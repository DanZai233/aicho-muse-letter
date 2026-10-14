// 信笺：写信、信箱、详情、重新生成、分享
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, saveDb, uuid, shareToken, listLetters } from '../db.js';
import { getPersonas, generateReply, synthesize, searchLibrary, polishLetter } from '../muse.js';

const router = Router();
for (const method of ['get', 'post', 'delete', 'patch']) {
  const register = router[method].bind(router);
  router[method] = (route, handler) => register(route, (req, res, next) =>
    Promise.resolve().then(() => handler(req, res, next)).catch(next));
}

const running = new Map(); // letterId -> true

function visitorOf(req) {
  const v = (req.headers['x-visitor-id'] || req.query.visitor || '').toString().trim();
  return v && v.length <= 128 ? v : null;
}

// Client IP honors only the Express trusted-proxy configuration.
function clientIp(req) {
  return req.ip || '';
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

function publicLetter(letter, owner = false) {
  return {
    id: letter.id,
    ...(owner ? { share_token: letter.share_token || null, persona_custom: letter.persona_custom || null, thread_id: letter.thread_id || null, reply_version: letter.reply_version || 0 } : {}),
    pen_name: letter.pen_name,
    persona: letter.persona,
    letter_content: letter.letter_content,
    signature: letter.signature || '',
    reply: letter.reply || [],
    status: letter.status,
    error: letter.error || null,
    created_at: letter.created_at,
  };
}

// 回信段落 -> 纯文本
function replyToText(replyArr) {
  if (!Array.isArray(replyArr)) return '';
  return replyArr.map(p => (typeof p === 'string' ? p : p.text || '')).filter(Boolean).join('\n');
}

// 同一用户 + 同一收信人：自动带上最近 3 轮往来信作为上下文（连续写信可延续话题）
// 不同用户/不同收信人之间严格隔离（按 visitor_id + persona.id 过滤）
function buildHistory(letter) {
  const visitor = letter.visitor_id;
  const personaKey = letter.persona?.id;
  if (!visitor || !personaKey) return [];
  const prev = db().letters
    .filter(l => l.visitor_id === visitor && l.persona?.id === personaKey && l.id !== letter.id
      && (l.thread_id || null) === (letter.thread_id || null) && l.created_at < letter.created_at
      && l.status === 'done' && Array.isArray(l.reply) && l.reply.length)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-3);
  const history = [];
  for (const p of prev) {
    const userText = String(p.letter_content || '').trim().slice(0, 500);
    const aiText = replyToText(p.reply).trim().slice(0, 800);
    if (userText) history.push({ role: 'user', content: userText });
    if (aiText) history.push({ role: 'assistant', content: aiText });
  }
  return history;
}

// 生成回信（内部：LLM + 逐段 TTS）
async function doGenerate(letter) {
  if (running.get(letter.id)) return;
  running.set(letter.id, true);
  letter.status = 'replying';
  try { await saveDb('letters', letter); }
  catch (error) { running.delete(letter.id); throw error; }
  generateInBackground(letter).catch(error => console.error('[Letter] 后台任务异常:', error.message));
}

async function generateInBackground(letter) {
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
      history: buildHistory(letter),
    });
    if (!db().letters.includes(letter)) return;
    letter.signature = r.signature || letter.persona.name;
    const paragraphs = Array.isArray(r.paragraphs) ? r.paragraphs.map(x => String(x).trim()).filter(Boolean) : [];
    if (!paragraphs.length) throw new Error('回信内容为空');
    // 只保存文本段落；语音按需生成（用户点哪段才合成哪段）
    letter.reply = paragraphs.map(text => ({ text, audio_url: null, audio_error: null }));
    letter.status = 'done';
  } catch (e) {
    console.error('[Letter] 生成回信失败:', e.message);
    letter.status = 'error';
    letter.error = e.message;
  } finally {
    running.delete(letter.id);
    letter.updated_at = new Date().toISOString();
    if (db().letters.includes(letter)) {
      try { await saveDb('letters', letter); }
      catch (error) {
        // The durable pending record survives; expose a retryable error instead of polling forever.
        const failed = db().letters.find(l => l.id === letter.id);
        if (failed) {
          failed.status = 'error';
          failed.error = '回信保存失败，请稍后重新生成';
          try { await saveDb('letters', failed); }
          catch {
            const current = db().letters.find(l => l.id === letter.id);
            if (current) { current.status = 'error'; current.error = failed.error; }
          }
        }
        console.error('[Letter] 回信落库失败:', error.message);
      }
    }
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
  const { pen_name, persona_id, persona_name, persona_tagline, persona_personality, voice_id, voice_name, letter_content, thread_id, new_topic, reply_to } = req.body || {};
  const content = String(letter_content || '').trim();
  if (!visitor) return res.status(400).json({ code: 40001, message: '缺少访客标识' });
  if (!persona_id && !persona_name) return res.status(400).json({ code: 40001, message: '请选择写信对象' });
  if (content.length < 5) return res.status(400).json({ code: 40001, message: '信的内容太短了' });
  if (content.length > 3000) return res.status(400).json({ code: 40001, message: '信太长了（最多 3000 字）' });
  try {
    let persona;
    const personality = Array.isArray(persona_personality) ? persona_personality.map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 6) : [];
    const previous = reply_to ? db().letters.find(l => l.id === reply_to && l.visitor_id === visitor) : null;
    if (reply_to && !previous) return res.status(404).json({ code: 40401, message: '之前的信件不存在' });
    if (persona_id) {
      const personas = await getPersonas();
      persona = personas.find(p => p.id === persona_id);
      if (!persona) return res.status(404).json({ code: 40401, message: '写信对象不存在' });
    } else {
      // 自定义对象（音色广场选择）：名字 + 音色 + 性格
      const customName = String(persona_name || '').trim().slice(0, 20);
      if (!customName) return res.status(400).json({ code: 40001, message: '请填写对象名字' });
      const vid = String(voice_id || '').trim().slice(0, 128);
      if (!vid) return res.status(400).json({ code: 40001, message: '请选择一个音色' });
      persona = {
        id: 'custom:' + crypto.createHash('sha256').update(JSON.stringify([customName, String(persona_tagline || '').trim().slice(0, 60), vid, personality])).digest('hex').slice(0, 24),
        name: customName,
        tagline: String(persona_tagline || '').trim().slice(0, 60) || '一位特别的朋友',
        avatar_color: '#8b7d6b',
        voice_id: vid,
        voice_name: String(voice_name || '').trim().slice(0, 80) || '自定义音色',
      };
    }
    // Continue legacy custom recipients without changing their conversation identity.
    if (!persona_id && previous?.persona_custom && previous.persona_custom.name === persona.name
      && previous.persona_custom.voice_id === persona.voice_id
      && previous.persona_custom.tagline === persona.tagline
      && JSON.stringify(previous.persona_custom.personality || []) === JSON.stringify(personality)) {
      persona.id = previous.persona.id;
    }
    const letter = {
      id: uuid(),
      visitor_id: visitor,
      pen_name: String(pen_name || '').trim().slice(0, 20) || '远方的朋友',
      thread_id: new_topic ? uuid() : (previous ? previous.thread_id || null : String(thread_id || '').slice(0, 64) || null),
      reply_version: 1,
      persona: {
        id: persona.id, name: persona.name, tagline: persona.tagline || '',
        avatar_color: persona.avatar_color || '#8b7d6b',
        voice_id: persona.voice_id || null, voice_name: persona.voice_name || '',
      },
      persona_custom: !persona_id ? {
        name: persona.name,
        tagline: persona.tagline || '',
        personality: Array.isArray(persona_personality) ? personality : [],
        voice_id: persona.voice_id || '',
        voice_name: persona.voice_name || '',
      } : null,
      letter_content: content,
      signature: '',
      reply: [],
      status: 'writing',
      share_token: null,
      error: null,
      source: {
        ip: clientIp(req),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
        referer: String(req.headers['referer'] || req.headers['referrer'] || '').slice(0, 500),
        created_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db().letters.push(letter);
    await saveDb('letters', letter);
    // 异步生成回信，不阻塞寄出
    await doGenerate(letter);
    res.json({ code: 0, data: { id: letter.id, status: letter.status } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '寄信失败：' + e.message });
  }
});

// 信箱列表（本人）
router.get('/letters', async (req, res) => {
  const visitor = visitorOf(req);
  const page = Math.max(1, Math.min(1000000, Math.floor(Number(req.query.page) || 1)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.page_size) || 20)));
  if (!visitor) return res.json({ code: 0, data: { list: [], total: 0, page, page_size: pageSize } });
  const result = await listLetters(visitor, { page, pageSize, persona: String(req.query.persona || '') });
  const personas = [...new Map(db().letters.filter(l => l.visitor_id === visitor).map(l => [l.persona.id, l.persona])).values()];
  res.json({ code: 0, data: { list: result.list.map(brief), total: result.total, page, page_size: pageSize, personas } });
});

// 信件详情（本人）
router.get('/letters/:id', async (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  res.json({ code: 0, data: { letter: publicLetter(letter, true) } });
});


// One task identity for owner/share/forced synthesis; stale replies cannot be written back.
const generatingAudio = new Map();
async function paragraphAudio(letter, index, force = false) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || !letter.reply?.[i] || letter.status !== 'done')
    throw Object.assign(new Error('段落不存在或回信尚未完成'), { status: 400 });
  const para = letter.reply[i];
  const version = letter.reply_version || 0;
  const vid = letter.persona_custom?.voice_id || letter.persona.voice_id;
  if (!vid) throw Object.assign(new Error('该对象没有音色'), { status: 400 });
  const key = `${letter.id}:${version}:${i}`;
  if (generatingAudio.has(key)) return generatingAudio.get(key);
  const promise = (async () => {
    const r = await synthesize(para.text, vid, force);
    if (!r.audio_url) throw Object.assign(new Error(r.error || '语音生成失败'), { status: 502 });
    if (!db().letters.includes(letter) || (letter.reply_version || 0) !== version || letter.reply[i]?.text !== para.text)
      throw Object.assign(new Error('回信已更新，请重新播放'), { status: 409 });
    letter.reply[i] = { ...para, audio_url: r.audio_url, audio_error: null };
    letter.updated_at = new Date().toISOString();
    await saveDb('letters', letter);
    return { audio_url: r.audio_url, cached: !!r.cached };
  })().finally(() => generatingAudio.delete(key));
  generatingAudio.set(key, promise);
  return promise;
}
router.post('/letters/:id/audio/:index', async (req, res) => {
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitorOf(req));
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  res.json({ code: 0, data: await paragraphAudio(letter, req.params.index) });
});
router.post('/letters/:id/regen-audio', async (req, res) => {
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitorOf(req));
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  res.json({ code: 0, data: await paragraphAudio(letter, req.body?.index, true) });
});

// 删除信件（共享音频由定时清理回收）
router.delete('/letters/:id', async (req, res) => {
  const visitor = visitorOf(req);
  const idx = db().letters.findIndex(l => l.id === req.params.id && l.visitor_id === visitor);
  if (idx === -1) return res.status(404).json({ code: 40401, message: '信件不存在' });
  const [letter] = db().letters.splice(idx, 1);
  // Shared audio remains until orphan cleanup.
  await saveDb('letters', letter, true);
  res.json({ code: 0, data: { ok: true, id: letter.id } });
});

// 重新生成回信
router.post('/letters/:id/regen', async (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  if (running.get(letter.id)) return res.status(409).json({ code: 40901, message: '正在生成中，请稍候' });
  letter.reply_version = (letter.reply_version || 0) + 1;
  letter.reply = [];
  letter.signature = '';
  letter.error = null;
  await doGenerate(letter);
  res.json({ code: 0, data: { id: letter.id, status: 'replying' } });
});

// 开启分享
router.post('/letters/:id/share', async (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  if (!letter.share_token) letter.share_token = shareToken();
  letter.updated_at = new Date().toISOString();
  await saveDb('letters', letter);
  res.json({ code: 0, data: { share_token: letter.share_token, share_url: '/l/' + letter.share_token } });
});

// 关闭分享
router.delete('/letters/:id/share', async (req, res) => {
  const visitor = visitorOf(req);
  const letter = db().letters.find(l => l.id === req.params.id && l.visitor_id === visitor);
  if (!letter) return res.status(404).json({ code: 40401, message: '信件不存在' });
  letter.share_token = null;
  letter.updated_at = new Date().toISOString();
  await saveDb('letters', letter);
  res.json({ code: 0, data: { ok: true } });
});



// 信件润色（预设风格）
router.post('/letters/polish', async (req, res) => {
  const { text, style } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return res.status(400).json({ code: 40001, message: 'text 必填' });
  if (t.length < 5) return res.status(400).json({ code: 40001, message: '内容太短了' });
  if (t.length > 3000) return res.status(400).json({ code: 40001, message: '内容太长了（最多 3000 字）' });
  try {
    const d = await polishLetter(t, String(style || 'gentle'));
    res.json({ code: 0, data: d });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '润色失败：' + e.message });
  }
});

// Fish 音色广场搜索（匿名，低配额）
router.get('/letters/library/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120);
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
  const name = String(persona_name || '').trim().slice(0, 20) || '我';
  if (!voice_id || String(voice_id).length > 128) return res.status(400).json({ code: 40001, message: '缺少音色' });
  try {
    const text = `嗨，我是${name}。你的信我收到啦，想和你说的话都在信里，慢慢讲给你听。`;
    const r = await synthesize(text, String(voice_id));
    if (!r.audio_url) return res.status(502).json({ code: 50201, message: r.error || '试听生成失败' });
    res.json({ code: 0, data: { audio_url: r.audio_url, cached: !!r.cached } });
  } catch (e) {
    res.status(502).json({ code: 50201, message: '试听失败：' + e.message });
  }
});

// 分享页按需合成单段语音：任何人通过分享链接点击段落即可生成/复用同一份音频（服务器统一缓存）
router.post('/share/:token/audio/:index', async (req, res) => {
  const letter = db().letters.find(l => l.share_token === req.params.token);
  if (!letter) return res.status(404).json({ code: 40401, message: '分享不存在或已关闭' });
  const data = await paragraphAudio(letter, req.params.index);
  if (letter.share_token !== req.params.token) return res.status(404).json({ code: 40401, message: '分享已关闭' });
  res.json({ code: 0, data });
});

// 分享只读快照（匿名）
router.get('/share/:token', async (req, res) => {
  const letter = db().letters.find(l => l.share_token === req.params.token);
  if (!letter) return res.status(404).json({ code: 40401, message: '分享不存在或已关闭' });
  res.json({ code: 0, data: { letter: publicLetter(letter) } });
});

export default router;
