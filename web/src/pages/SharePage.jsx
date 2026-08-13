import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, stopAllAudio } from '../components/ui.jsx';

const singleAudio = new Audio();

export default function SharePage() {
  const token = window.location.pathname.split('/').pop();
  const [letter, setLetter] = useState(null);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(null);
  const [synthLoading, setSynthLoading] = useState(null); // index（按需合成中）

  useEffect(() => {
    api.shared(token).then(d => setLetter(d.letter)).catch(e => setErr(e.message));
    return () => { stopAllAudio(); };
  }, [token]);

  async function playPara(i, url) {
    // 同一段再次点击：暂停/恢复
    if (playing === i) {
      if (singleAudio.paused) {
        singleAudio.play().catch(() => {});
      } else {
        singleAudio.pause();
      }
      return;
    }
    // 没有音频：先按需合成（并打断当前播放），生成完立刻播放
    if (!url) {
      stopAllAudio();
      setPlaying(null);
      setSynthLoading(i);
      try {
        const d = await api.shareSynthAudio(token, i);
        setLetter(prev => prev ? {
          ...prev,
          reply: prev.reply.map((p, j) => j === i ? { ...p, audio_url: d.audio_url, audio_error: null } : p),
        } : prev);
        playPara(i, d.audio_url);
      } catch (e) {
        console.error('语音生成失败', e);
      } finally {
        setSynthLoading(null);
      }
      return;
    }
    // 自由点播：直接打断当前播放，立刻读这段
    stopAllAudio();
    setPlaying(null);
    singleAudio.src = url;
    setPlaying(i);
    singleAudio.play().catch(() => setPlaying(null));
    singleAudio.onended = () => setPlaying(null);
    singleAudio.onerror = () => setPlaying(null);
  }

  if (!letter && !err) return <div className="page"><Spinner label="正在展开信笺…" /></div>;
  if (err) return (
    <div className="page share-page">
      <main className="share-main">
        <div className="empty-box">
          <span className="empty-icon">📭</span>
          <p>{err}</p>
          <Link className="empty-btn" to="/">去写一封信</Link>
        </div>
      </main>
    </div>
  );

  return (
    <div className="page share-page">
      <main className="share-main">
        <div className="share-banner">
          <span>💌 一封来自缪斯的回信</span>
        </div>
        <section className="paper-card incoming">
          <div className="paper-head">
            <span className="strip-avatar" style={{ background: letter.persona?.avatar_color }}>{letter.persona?.name?.slice(0,1)}</span>
            <div className="head-text">
              <span className="head-name">{letter.persona?.name}</span>
              <span className="head-sub">{letter.persona?.tagline || ''}</span>
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
        <section className="paper-card reply-card">
          <div className="reply-tag">回信</div>
          <div className="letter-body reply-body">
            {letter.reply?.map((para, i) => (
              <div key={i} className="reply-para">
                <button className={'play-btn' + (playing === i ? ' playing' : '')} onClick={() => playPara(i, para.audio_url)} title={para.audio_url ? '朗读这一段' : '生成并朗读这一段'}>
                  {synthLoading === i ? '…' : (playing === i ? '❚❚' : '▶')}
                </button>
                <p className="para">{para.text}</p>
              </div>
            ))}
            {letter.signature ? <p className="signature">—— {letter.signature}</p> : null}
          </div>
        </section>
        <p className="share-foot">在 缪斯信笺，把想说的话写成信，听回音。 <Link to="/">也来写一封</Link></p>
      </main>
    </div>
  );
}
