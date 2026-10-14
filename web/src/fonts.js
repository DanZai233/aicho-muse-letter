// 中文字写体选择：引入 3 款免费可商用字体
import { readStorage, writeStorage } from './storage.js';
const loaders = {
  wenkai: () => import('lxgw-wenkai-webfont/lxgwwenkai-regular.css'),
  kuaile: () => import('@fontsource/zcool-kuaile/chinese-simplified-400.css'),
  xiaolai: () => import('@chinese-fonts/xiaolai/dist/Xiaolai/result.css'),
};
const loaded = new Map();
export function loadFont(id) {
  if (loaders[id] && !loaded.has(id)) loaded.set(id, loaders[id]().catch(() => loaded.delete(id)));
}

export const FONT_OPTIONS = [
  { id: 'default', label: '默认', desc: '系统宋体/黑体', family: null, sample: '山高水长，见字如面。' },
  { id: 'wenkai', label: '霞鹜文楷', desc: '清雅楷书手写', family: '"LXGW WenKai", "KaiTi", serif', sample: '山高水长，见字如面。' },
  { id: 'xiaolai', label: '小赖手写', desc: '圆润可爱手写', family: '"Xiaolai SC", "LXGW WenKai", serif', sample: '山高水长，见字如面。' },
  { id: 'kuaile', label: '站酷快乐体', desc: '活泼元气手写', family: '"ZCOOL KuaiLe", "LXGW WenKai", serif', sample: '山高水长，见字如面。' },
];

const KEY = 'ml_font';
export function getFont() {
  try {
    const id = readStorage(KEY);
    return FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0];
  } catch { return FONT_OPTIONS[0]; }
}
export function setFont(id) {
  try { writeStorage(KEY, id); } catch { /* 隐私模式忽略 */ }
}
export function fontFamily(id) {
  loadFont(id);
  const f = FONT_OPTIONS.find(x => x.id === id) || FONT_OPTIONS[0];
  return f.family;
}
