import { readStorage, writeStorage } from './storage.js';
// 信笺 API 封装 + 访客标识
export function visitorId() {
  let v = readStorage('ml_visitor');
  if (!v) {
    v = 'v_' + crypto.randomUUID();
    writeStorage('ml_visitor', v);
  }
  return v;
}

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId(), ...(opts.headers || {}) };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (opts.signal?.aborted) abort();
  opts.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 210000);
  try {
    const response = await fetch('/api/v1' + path, { ...opts, headers, signal: controller.signal });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('响应解析失败，请重试');
    }
    if (!response.ok || (data.code && data.code !== 0)) throw new Error(data.message || ('请求失败 ' + response.status));
    return data.data;
  } catch (error) {
    if (error.name === 'AbortError' && !opts.signal?.aborted) throw new Error('请求超时，请重试');
    throw error;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', abort);
  }
}

export const api = {
  personas: (signal) => req('/letters/personas', { signal }),
  sendLetter: (body) => req('/letters', { method: 'POST', body: JSON.stringify(body) }),
  letter: (id, signal) => req('/letters/' + id, { signal }),
  letters: (query = {}, signal) => req('/letters?' + new URLSearchParams(query), { signal }),
  regen: (id) => req('/letters/' + id + '/regen', { method: 'POST' }),
  shareOn: (id) => req('/letters/' + id + '/share', { method: 'POST' }),
  shareOff: (id) => req('/letters/' + id + '/share', { method: 'DELETE' }),
  previewVoice: (body) => req('/letters/preview-voice', { method: 'POST', body: JSON.stringify(body) }),
  librarySearch: (q, signal) => req('/letters/library/search?q=' + encodeURIComponent(q), { signal }),
  regenAudio: (id, index) => req('/letters/' + id + '/regen-audio', { method: 'POST', body: JSON.stringify({ index }) }),
  synthAudio: (id, index, signal) => req('/letters/' + id + '/audio/' + index, { method: 'POST', signal }),
  shareSynthAudio: (token, index, signal) => req('/share/' + token + '/audio/' + index, { method: 'POST', signal }),
  polish: (text, style) => req('/letters/polish', { method: 'POST', body: JSON.stringify({ text, style }) }),
  deleteLetter: (id) => req('/letters/' + id, { method: 'DELETE' }),
  shared: (token, signal) => req('/share/' + token, { signal }),
  submitFeedback: (body) => req('/feedback', { method: 'POST', body: JSON.stringify(body) }),
};
