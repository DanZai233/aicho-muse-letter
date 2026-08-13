// 信笺 API 封装 + 访客标识
export function visitorId() {
  let v = localStorage.getItem('ml_visitor');
  if (!v) {
    v = 'v_' + crypto.randomUUID();
    localStorage.setItem('ml_visitor', v);
  }
  return v;
}

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Visitor-Id': visitorId(), ...(opts.headers || {}) };
  const r = await fetch('/api/v1' + path, { ...opts, headers });
  let data;
  try { data = await r.json(); } catch { data = { code: -1, message: '响应解析失败' }; }
  if (!r.ok || (data.code && data.code !== 0)) {
    throw new Error(data.message || ('请求失败 ' + r.status));
  }
  return data.data;
}

export const api = {
  personas: () => req('/letters/personas'),
  sendLetter: (body) => req('/letters', { method: 'POST', body: JSON.stringify(body) }),
  letter: (id) => req('/letters/' + id),
  letters: () => req('/letters'),
  regen: (id) => req('/letters/' + id + '/regen', { method: 'POST' }),
  shareOn: (id) => req('/letters/' + id + '/share', { method: 'POST' }),
  shareOff: (id) => req('/letters/' + id + '/share', { method: 'DELETE' }),
  previewVoice: (body) => req('/letters/preview-voice', { method: 'POST', body: JSON.stringify(body) }),
  librarySearch: (q) => req('/letters/library/search?q=' + encodeURIComponent(q)),
  regenAudio: (id, index) => req('/letters/' + id + '/regen-audio', { method: 'POST', body: JSON.stringify({ index }) }),
  polish: (text, style) => req('/letters/polish', { method: 'POST', body: JSON.stringify({ text, style }) }),
  deleteLetter: (id) => req('/letters/' + id, { method: 'DELETE' }),
  shared: (token) => req('/share/' + token),
};
