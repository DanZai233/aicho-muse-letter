import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, visitorId } from '../api.js';

// 全局共享播放器：模块级单例，一次只播一段。
// 页面各自 new Audio() 会导致 stop/pause 停不住真正在播的实例，
// 统一走这里保证暂停/恢复、打断、进度都能生效。
const playerAudio = new Audio();
let playerPlaying = false;

export function stopAllAudio() {
  playerAudio.pause();
  playerAudio.removeAttribute('src');
  playerAudio.load();
  playerPlaying = false;
}

// 段落播放 hook：共享同一播放器实例，支持暂停/恢复、进度条、播完回调（自动连播）。
// play(index, url) —— 同一段再次调用会暂停/恢复；不同段则打断并立即播放新段。
export function useParagraphPlayer({ onEnded } = {}) {
  const [playing, setPlaying] = useState(null); // 当前播放段落 index
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(null); // { i, pct }
  const cbRef = useRef({ onEnded });
  cbRef.current = { onEnded };

  useEffect(() => {
    return () => { stopAllAudio(); };
  }, []);

  const play = useCallback((index, url) => {
    // 显式清空播放态（如按需合成前打断）
    if (!url) {
      stopAllAudio();
      setPlaying(null);
      setPaused(false);
      setProgress(null);
      return;
    }
    // 同一段：暂停/恢复
    if (playerPlaying && playing === index) {
      if (playerAudio.paused) {
        playerAudio.play().catch(() => {});
        setPaused(false);
      } else {
        playerAudio.pause();
        setPaused(true);
      }
      return;
    }
    stopAllAudio();
    setPlaying(index);
    setPaused(false);
    setProgress({ i: index, pct: 0 });
    playerPlaying = true;
    playerAudio.src = url;
    playerAudio.play().catch(() => {
      playerPlaying = false;
      setPlaying(null);
      setProgress(null);
    });
    playerAudio.ontimeupdate = () => {
      if (playerAudio.duration > 0) {
        setProgress({ i: index, pct: Math.min(100, Math.round(playerAudio.currentTime / playerAudio.duration * 100)) });
      }
    };
    playerAudio.onended = () => {
      playerPlaying = false;
      setPlaying(null);
      setPaused(false);
      setProgress(null);
      cbRef.current.onEnded?.(index);
    };
    playerAudio.onerror = () => {
      playerPlaying = false;
      setPlaying(null);
      setPaused(false);
      setProgress(null);
    };
  }, [playing]);

  return { playing, paused, progress, play };
}

export function LetterHeader({ title, backTo, right }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        {backTo ? (
          <>
            <Link to={backTo} className="back-link">←</Link>
            <span className="brand brand-small">缪斯信笺</span>
          </>
        ) : (
          <span className="brand-mark" aria-hidden="true">💌</span>
        )}
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
