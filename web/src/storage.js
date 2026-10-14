const memory = new Map();
export function readStorage(key, fallback = '') {
  try { return localStorage.getItem(key) ?? memory.get(key) ?? fallback; }
  catch { return memory.get(key) ?? fallback; }
}
export function writeStorage(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Session fallback for private browsers. */ }
}
export function removeStorage(key) {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* Session fallback. */ }
}
export function readDraft() {
  try { return JSON.parse(readStorage('ml_draft_v2', '{}')); } catch { return {}; }
}
