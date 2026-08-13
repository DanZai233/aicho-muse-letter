import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { LetterHeader, Spinner, stopAllAudio } from '../components/ui.jsx';

const singleAudio = new Audio();

export default function LetterPage() {
  const id = window.location.pathname.split('/').pop();
  const [letter, setLetter] = useState(null);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(null);
  const [finished, setFinished] = useState({});
  const [shareUrl, setShareUrl] = useState('');
  const [toast, setToast] = useState('');
  const [regenAudio, setRegenAudio] = useState(null); // index
  const [progress, setProgress] = useState(null); // { i, pct }
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.letter(id);
      setLetter(d.letter);
      setStatus(d.letter.status);
      if (d.letter.status === 'writing' || d.letter.status === 'replying') {
        pollRef.current = setTimeout(load, 1800);
      }
    } catch (e) {
      setErr(e.message);
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    load();
    return () => { clearTimeout(pollRef.current); stopAllAudio(); };
  }, [load]);

  function playPara(i, url) {
    // 同一段再次点击：暂停/恢复
    if (playing === i) {
      if (singleAudio.paused) {
        singleAudio.play().catch(() => {});
      } else {
        singleAudio.pause();
      }
      return;
    }
    if (i > 0 && !finished[i - 1]) {
      setToast('先听完上一段再继续哦');
      setTimeout(() => setToast(''), 2000);
      return;
    }
    if (!url) return;
    stopAllAudio();
    setPlaying(null);
    singleAudio.src = url;
    setProgress({ i, pct: 0 });
    setPlaying(i);
    singleAudio.play().catch(() => { setPlaying(null); setProgress(null); });
    singleAudio.ontimeupdate = () => {
      if (singleAudio.duration > 0) {
        setProgress({ i, pct: Math.min(100, Math.round(singleAudio.currentTime / singleAudio.duration * 100)) });
      }
    };
    singleAudio.onended = () => { setPlaying(null); setProgress(null); setFinished(prev => ({ ...prev, [i]: true })); };
    singleAudio.onerror = () => { setPlaying(null); setProgress(null); };
  }

  async function regenPara(i) {
    if (regenAudio !== null) return;
    setRegenAudio(i);
    try {
      const d = await api.regenAudio(id, i);
      setLetter(prev => prev ? {
        ...prev,
        reply: prev.reply.map((p, j) => j === i ? { ...p, audio_url: d.audio_url, audio_error: null } : p),
      } : prev);
      setToast('这一段的声音已重新生成 ✓');
      setTimeout(() => setToast(''), 2200);
    } catch (e) {
      setErr(e.message);
    } finally {
      setRegenAudio(null);
    }
  }

  async function regen() {
    setStatus('replying');
    setLetter(prev => prev ? { ...prev, reply: [], signature: '', status: 'replying' } : prev);
    setFinished({});
    setPlaying(null);
    stopAllAudio();
    try {
      await api.regen(id);
      pollRef.current = setTimeout(load, 2000);
    } catch (e) { setErr(e.message); setStatus('error'); }
  }

  async function share() {
    try {
      const d = await api.shareOn(id);
      const url = location.origin + d.share_url;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setToast('分享链接已复制 ✓');
      setTimeout(() => setToast(''), 2500);
    } catch (e) { setErr(e.message); }
  }

  async function unshare() {
    try {
      await api.shareOff(id);
      setShareUrl('');
      setToast('已关闭分享');
      setTimeout(() => setToast(''), 2000);
    } catch (e) { setErr(e.message); }
  }

  const pending = status === 'writing' || status === 'replying';
  const done = status === 'done';

  return (
    <div className="page letter-page">
      <LetterHeader title={letter ? '致 ' + letter.persona?.name : '信'} backTo="/inbox"
        right={<Link to="/" className="icon-link">✎</Link>} />
      {toast ? <div className="toast">{toast}</div> : null}
      {err ? <p className="form-err page-err">{err}</p> : null}
      {!letter ? <Spinner label="正在取信…" /> : (
        <main className="letter-main">
          {/* 来信 */}
          <section className="paper-card incoming">
            <div className="paper-head">
              <span className="strip-avatar" style={{ background: letter.persona?.avatar_color }}>{letter.persona?.name?.slice(0,1)}</span>
              <div className="head-text">
                <span className="head-name">{letter.persona?.name}</span>
                <span className="head-sub">{letter.persona?.tagline || '来信已收到'}</span>
              </div>
              <span className="stamp">致{letter.pen_name}</span>
            </div>
            <div className="letter-body">
              <p className="opening">{letter.pen_name}：</p>
              {String(letter.letter_content || '').split(/\n{2,}/).filter(Boolean).map((para, i) => (
                <p key={i} className="para">{para}</p>
              ))}
            </div>
          </section>

          {/* 回信 */}
          {pending ? (
            <section className="reply-pending">
              <Spinner label={status === 'replying' ? (letter.reply?.length ? '正在诵读回信…' : '正在为你回信…') : '信已寄出，等待回音…'} />
              <p className="pending-hint">回信需要一小会儿，写完后会自动保存在你的信箱里。</p>
            </section>
          ) : done ? (
            <section className="paper-card reply-card">
              <div className="reply-tag">回信</div>
              <div className="letter-body reply-body">
                {letter.reply?.map((para, i) => (
                  <div key={i} className="reply-para" style={{ animationDelay: (i * 0.28) + 's' }}>
                    <button
                      className={'play-btn' + (playing === i ? ' playing' : '') + (finished[i] ? ' fin' : '')}
                      onClick={() => playPara(i, para.audio_url)}
                      title={para.audio_url ? '朗读这一段' : '暂无语音'}
                      disabled={!para.audio_url}
                    >
                      {playing === i ? (singleAudio.paused ? '▶' : '❚❚') : '▶'}
                    </button>
                    <div className="reply-text">
                      <p className="para">{para.text}</p>
                      {playing === i && progress?.i === i ? (
                        <div className="audio-progress" aria-label="朗读进度">
                          <div className="audio-progress-fill" style={{ width: progress.pct + '%' }} />
                        </div>
                      ) : null}
                      {para.audio_url ? (
                        <button className="regen-audio-btn" onClick={() => regenPara(i)} disabled={regenAudio !== null}>
                          {regenAudio === i ? '生成中…' : '↻ 重生成语音'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {letter.signature ? <p className="signature">—— {letter.signature}</p> : null}
              </div>
            </section>
          ) : status === 'error' ? (
            <section className="reply-pending">
              <p className="empty-hint">这封回信没有送达{letter.error ? '：' + letter.error : ''}</p>
              <button className="send-btn retry-btn" onClick={regen}>再寄一次</button>
            </section>
          ) : null}

          {/* 操作区 */}
          {letter ? (
            <div className="letter-actions">
              {done || status === 'error' ? <button className="ghost-btn" onClick={regen}>🔄 重新回信</button> : null}
              {done ? (
                shareUrl ? (
                  <>
                    <button className="ghost-btn" onClick={unshare}>🔒 关闭分享</button>
                    <span className="share-url">{shareUrl}</span>
                  </>
                ) : (
                  <button className="ghost-btn accent" onClick={share}>🔗 分享这封信</button>
                )
              ) : null}
            </div>
          ) : null}
        </main>
      )}
    </div>
  );
}
