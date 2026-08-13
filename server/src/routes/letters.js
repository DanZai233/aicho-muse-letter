// 信笺：写信、信箱、详情、重新生成、分享
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db, saveDb, uuid, shareToken, DATA_DIR } from '../db.js';
import { getPersonas, generateReply, synthesizeParagraphs, synthesize, searchLibrary } from '../muse.js';

const router = Router();
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
const running = new Map(); // letterId -> true

function visitorOf(req) {
  const v = (req.headers['x-visitor-id'] || req.query.visitor || '').toString().trim();
  return v || null;
}

function brief(letter) {
  return {
    id: letter.id,
    pen_name: letter.pen_name,
    persona: letter.persona,
    letter_preview: String(letter.letter_content || '').slice(0, 80),
    status: letter.status,
    share_token: letter.share_token || null,
    created_at: letter.created_at,
    updated_at: letter.updated_at,
  };
}

function publicLetter(letter) {
  return {
    id: letter.id,
    pen_name: letter.pen_name,
    persona: letter.persona,
    letter_content: letter.letter_content,
    signature: letter.signature || '',
    reply: letter.reply || [],
    status: letter.status,
    created_at: letter.created_at,
  };
}

// 生成回信（内部：LLM + 逐段 TTS）
async function doGenerate(letter) {
  if (running.get(letter.id)) return;
  running.set(letter.id, true);
  letter.status = 'replying';
  saveDb();
  try {
    const r = await generateReply({
      persona_id: letter.persona_custom ? undefined : letter.persona.id,
      persona_name: letter.persona_custom?.name,
      persona_tagline: letter.persona_custom?.tagline,
      persona_personality: letter.persona_custom?.personality,
      voice_id: letter.persona_custom?.voice_id || letter.persona.voice_id,
      voice_name: letter.persona_custom?.voice_name || letter.persona.voice_name,
      pen_name: letter.pen_name || '远方的朋友',
      letter_content: letter.letter_content,
    });
    letter.signature = r.signature || letter.persona.name;
    const paragraphs = Array.isArray(r.paragraphs) ? r.paragraphs.map(x => String(x).trim()).filter(Boolean) : [];
    if (!paragraphs.length) throw new Error('回信内容为空');
    letter.reply = await synthesizeParagraphs(paragraphs, letter.persona.voice_id || '');
    letter.status = 'done';
  } catch (e) {
    console.error('[Letter] 生成回信失败:', e.message);
    letter.status = 'error';
    letter.error = e.message;
  } finally {
    running.delete(letter.id);
    letter.updated_at = new Date().toISOString();
    saveDb();
  }
}


// 写信对象列表（代理 muse，缓存 5 分钟）
router.get('/letters/personas', async (req, res) => {
  try {
    const list = await getPersonas();
    res.json({ code: 0, data: { list, total: list.length } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '对象列表加载失败：' + e.message });
  }
});

// 写信并寄出（同步返回草稿，回信异步生成）
router.post('/letters', async (req, res) => {
  const visitor = visitorOf(req);
  const { pen_name, persona_id, persona_name, persona_tagline, persona_personality, voice_id, voice_name, letter_content } = req.body || {};
  const content = String(letter_content || '').trim();
  if (!visitor) return res.status(400).json({ code: 40001, message: '缺少访客标识' });
  if (!persona_id && !persona_name) return res.status(400).json({ code: 40001, message: '请选择写信对象' });
  if (content.length < 5) return res.status(400).json({ code: 40001, message: '信的内容太短了' });
  if (content.length > 3000) return res.status(400).json({ code: 40001, message: '信太长了（最多 3000 字）' });
  try {
    let persona;
    if (persona_id) {
      const personas = await getPersonas();
      persona = personas.find(p => p.id === persona_id);
      if (!persona) return res.status(404).json({ code: 40401, message: '写信对象不存在' });
    } else {
      // 自定义对象（音色广场选择）：名字 + 音色 + 性格
      const customName = String(persona_name || '').trim().slice(0, 20);
      if (!customName) return res.status(400).json({ code: 40001, message: '请填写对象名字' });
      const vid = String(voice_id || '').trim();
      if (!vid) return res.status(400).json({ code: 40001, message: '请选择一个音色' });
      persona = {
        id: 'custom:' + customName,
        name: customName,
        tagline: String(persona_tagline || '').trim().slice(0, 60) || '一位特别的朋友',
        avatar_color: '#8b7d6b',
        voice_id: vid,
        voice_name: String(voice_name || '').trim() || '自定义音色',
      };
    }
    const letter = {
      id: uuid(),
      visitor_id: visitor,
      pen_name: String(pen_name || '').trim() || '远方的朋友',
      persona: {
        id: persona.id, name: persona.name, tagline: persona.tagline || '',
        avatar_color: persona.avatar_color || '#8b7d6b',
        voice_id: persona.voice_id || null, voice_name: persona.voice_name || '',
      },
      persona_custom: !persona_id ? {
        name: persona.name,
        tagline: persona.tagline || '',
        personality: Array.isArray(persona_personality) ? persona_personality.map(String).slice(0, 6) : [],
        voice_id: persona.voice_id || '',
        voice_name: persona.voice_name || '',
      } : null,
      letter_content: content,
      signature: '',
      reply: [],
      status: 'writing',
      share_token: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db().letters.push(letter);
    saveDb();
    // 异步生成回信，不阻塞寄出
    doGenerate(letter).catch(e => console.error('[Letter] 后台任务异常:', e));
    res.json({ code: 0, data: { id: letter.id, status: letter.status } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '寄信失败：' + e.message });
  }
});

// 信箱列表（本人）
router.get('/letters', (req, res) => {
  const visitor = visitorOf(req);
  if (!visitor) return res.json({ code: 0, data: { list: [], total: 0 } });
  const list = db().letters
    .filter(l => l.visitor_id === visitor)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(brief);
  res.json({ code: 0, data: { list, total: list.length } });
});

// 信件详情（本人）
router.get('/letters/:id', (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  res.json({ code: 0, data: { letter: publicLetter(letter) } });
});

// 单段语音重新生成（强制重合成该段音频）
router.post('/letters/:id/regen-audio', async (req, res) => {
  const visitor = visitorOf(req);
  const { index } = req.body || {};
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  if (running.get(letter.id)) return res.status(409).json({ code: 40901, message: '正在处理中，请稍候' });
  const i = Number(index);
  const para = letter.reply && letter.reply[i];
  if (!para) return res.status(400).json({ code: 40001, message: '段落不存在' });
  const vid = letter.persona_custom?.voice_id || letter.persona.voice_id || '';
  if (!vid) return res.status(400).json({ code: 40001, message: '该对象没有音色，无法重新生成语音' });
  running.set(letter.id, true);
  try {
    const r = await synthesize(para.text, vid, true);
    if (!r.audio_url) return res.status(502).json({ code: 50201, message: r.error || '语音生成失败' });
    letter.reply[i] = { ...para, audio_url: r.audio_url, audio_error: null };
    letter.updated_at = new Date().toISOString();
    saveDb();
    res.json({ code: 0, data: { audio_url: r.audio_url, cached: !!r.cached } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '语音生成失败：' + e.message });
  } finally {
    running.delete(letter.id);
  }
});

// 重新生成回信
router.post('/letters/:id/regen', async (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  if (running.get(letter.id)) return res.status(409).json({ code: 40901, message: '正在生成中，请稍候' });
  letter.reply = [];
  letter.signature = '';
  letter.error = null;
  doGenerate(letter).catch(e => console.error('[Letter] 后台任务异常:', e));
  res.json({ code: 0, data: { id: letter.id, status: 'replying' } });
});

// 开启分享
router.post('/letters/:id/share', (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  if (!letter.share_token) letter.share_token = shareToken();
  letter.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { share_token: letter.share_token, share_url: '/l/' + letter.share_token } });
});

// 关闭分享
router.delete('/letters/:id/share', (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  letter.share_token = null;
  letter.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { ok: true } });
});


// Fish 音色广场搜索（匿名，低配额）
router.get('/letters/library/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const pageSize = Math.min(20, Math.max(1, Number(req.query.page_size) || 10));
  try {
    const list = await searchLibrary(q, pageSize);
    res.json({ code: 0, data: { list, total: list.length } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '音色广场搜索失败：' + e.message });
  }
});

// 音色试听（固定文案，缓存：同一音色只合成一次）
router.post('/letters/preview-voice', async (req, res) => {
  const { persona_name, voice_id } = req.body || {};
  const name = String(persona_name || '').trim() || '我';
  if (!voice_id) return res.status(400).json({ code: 40001, message: '缺少音色' });
  try {
    const text = `嗨，我是${name}。你的信我收到啦，想和你说的话都在信里，慢慢讲给你听。`;
    const r = await synthesize(text, String(voice_id));
    if (!r.audio_url) return res.status(502).json({ code: 50201, message: r.error || '试听生成失败' });
    res.json({ code: 0, data: { audio_url: r.audio_url, cached: !!r.cached } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '试听失败：' + e.message });
  }
});

// 分享只读快照（匿名）
router.get('/share/:token', (req, res) => {
  const letter = db().letters.find(l => l.share_token === req.params.token);
  if (!letter) return res.status(404).json({ code: 40401, message: '分享不存在或已关闭' });
  res.json({ code: 0, data: { letter: publicLetter(letter) } });
});

// 音频静态访问（本域转存的 mp3）
router.get('/audio/:file', (req, res) => {
  const file = String(req.params.file || '');
  if (!/^[0-9a-f]{24}\.mp3$/.test(file)) return res.status(400).json({ code: 40001, message: '非法文件' });
  const p = path.join(AUDIO_DIR, file);
  if (!fs.existsSync(p)) return res.status(404).json({ code: 40401, message: '音频不存在' });
  res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'public, max-age=86400').sendFile(p);
});

export default router;
