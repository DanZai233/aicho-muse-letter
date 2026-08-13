// muse 信笺公共接口客户端：回信生成 + 分段 TTS（音频转存到本服务）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from './db.js';

export const MUSE_BASE = String(process.env.MUSE_BASE_URL || 'http://127.0.0.1:3002/api/v1/letter').replace(/\/+$/, '');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');
fs.mkdirSync(AUDIO_DIR, { recursive: true });

let personasCache = null;
let personasAt = 0;
const PERSONAS_TTL = 5 * 60 * 1000;

async function muse(pathname, opts = {}) {
  const qs = opts.query ? '?' + new URLSearchParams(opts.query).toString() : '';
  const url = MUSE_BASE + pathname + qs;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 120000);
  try {
    const r = await fetch(url, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { code: -1, message: text.slice(0, 200) }; }
    if (!r.ok || (data.code && data.code !== 0)) {
      throw new Error(data.message || ('HTTP ' + r.status));
    }
    return data.data || {};
  } finally {
    clearTimeout(timer);
  }
}

// 人设列表（缓存 5 分钟），供写信页选择
export async function getPersonas(force = false) {
  if (!force && personasCache && Date.now() - personasAt < PERSONAS_TTL) return personasCache;
  const data = await muse('/personas');
  personasCache = data.list || [];
  personasAt = Date.now();
  return personasCache;
}

// 生成回信段落（支持自定义写信对象：persona_name + voice_id + personality）
export async function generateReply({ persona_id, persona_name, persona_tagline, persona_personality, voice_id, voice_name, pen_name, letter_content }) {
  const body = {
    persona_id: persona_id || undefined,
    persona_name: persona_name || undefined,
    persona_tagline: persona_tagline || undefined,
    persona_personality: persona_personality || undefined,
    voice_id: voice_id || undefined,
    voice_name: voice_name || undefined,
    pen_name,
    letter_content,
  };
  const data = await muse('/reply', { method: 'POST', body, timeout: 120000 });
  return data;
}

// Fish 音色广场搜索（代理 muse）
export async function searchLibrary(q = '', pageSize = 10) {
  const data = await muse('/library/search', { query: { q, page_size: pageSize }, timeout: 30000 });
  return data.list || [];
}

// 单段 TTS：force=true 强制重新合成（覆盖本地+远端缓存）
export async function synthesize(text, voiceId, force = false) {
  const t = String(text || '').trim();
  if (!t) return { audio_url: null, error: '空文本' };
  const target = audioCachePath(t, voiceId);
  if (!force && fs.existsSync(target)) {
    return { audio_url: '/audio/' + path.basename(target), cached: true };
  }
  const data = await muse('/tts', { method: 'POST', body: { text: t, voice_id: voiceId, force: !!force }, timeout: 90000 });
  const url = absolutize(data.audio_url);
  if (!url) return { audio_url: null, error: 'muse 未返回音频' };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error('音频下载 ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000) throw new Error('音频数据异常（过小）');
    fs.writeFileSync(target, buf);
    return { audio_url: '/audio/' + path.basename(target), cached: false, bytes: buf.length };
  } catch (e) {
    return { audio_url: null, error: e.message };
  }
}

function audioCachePath(text, voiceId) {
  const h = crypto.createHash('sha256').update([text, voiceId || ''].join('|')).digest('hex').slice(0, 24);
  return path.join(AUDIO_DIR, h + '.mp3');
}

// 把 muse 签名音频 URL 转成完整地址（muse 域）
function absolutize(url) {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  // MUSE_BASE 形如 https://muse.danzaii.cn/api/v1/letter
  const base = MUSE_BASE.replace(/\/api\/v1\/letter$/, '');
  return base + url;
}

// 逐段 TTS（串行，每段间小间隔；返回段落增强后的对象）
export async function synthesizeParagraphs(paragraphs, voiceId) {
  const out = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const r = await synthesize(paragraphs[i], voiceId);
    out.push({ text: paragraphs[i], audio_url: r.audio_url, audio_error: r.error || null });
    if (i < paragraphs.length - 1) await new Promise(res => setTimeout(res, 250));
  }
  return out;
}
