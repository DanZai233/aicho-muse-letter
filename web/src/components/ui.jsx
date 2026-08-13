import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, visitorId } from '../api.js';

// 全局唯一音频：一次只播一段
const singleAudio = new Audio();
let currentPlaying = null; // { key, stop }

export function stopAllAudio() {
  singleAudio.pause();
  singleAudio.src = '';
  currentPlaying = null;
}

export function useParagraphAudio({ paragraphs = [], enabled = true } = {}) {
  const [playingKey, setPlayingKey] = useState(null);
  const [loadingKey, setLoadingKey] = useState(null);
  const [finished, setFinished] = useState({});
  const refs = useRef({});

  useEffect(() => {
    return () => { stopAllAudio(); };
  }, []);

  function play(key, url, index) {
    if (!enabled || !url) return;
    // 只能顺序播放：当前段完成后才能播下一段
    const next = finished[key] ? null : key;
    stopAllAudio();
    setPlayingKey(next);
    if (!next) return;
    singleAudio.src = url;
    singleAudio.play().catch(() => setPlayingKey(null));
    singleAudio.onended = () => {
      setPlayingKey(null);
      setFinished(prev => ({ ...prev, [key]: true }));
    };
    singleAudio.onerror = () => setPlayingKey(null);
  }

  return { playingKey, loadingKey, finished, play };
}

export function LetterHeader({ title, backTo, right }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {backTo ? <Link to={backTo} className="back-link">←</Link> : <span className="brand">缪斯信笺</span>}
        <div className="topbar-title">{title || ''}</div>
        <div className="topbar-right">{right || (backTo ? <Link to="/" className="icon-link" title="写信">✎</Link> : <Link to="/inbox" className="icon-link" title="信箱">✉</Link>)}</div>
      </div>
    </header>
  );
}

export function PersonaCard({ p, selected, onSelect, onPreview, previewing }) {
  return (
    <button
      type="button"
      className={'persona-card' + (selected ? ' selected' : '')}
      style={{ '--pc': p.avatar_color || '#8b7d6b' }}
      onClick={() => onSelect(p)}
    >
      <span className="persona-avatar" style={{ background: p.avatar_color || '#8b7d6b' }}>
        {p.name.slice(0, 1)}
      </span>
      <span className="persona-name">{p.name}</span>
      <span className="persona-tag">{p.tagline || ''}</span>
      {p.voice_id ? (
        <span
          className="voice-preview"
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onPreview(p); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onPreview(p); } }}
          title="试听声音"
        >
          {previewing === p.id ? '♪…' : '♪'}
        </span>
      ) : null}
    </button>
  );
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      <span className="spinner-label">{label || '正在生成…'}</span>
    </div>
  );
}
