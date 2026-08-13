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
  const [finished, setFinished] = useState({});

  useEffect(() => {
    api.shared(token).then(d => setLetter(d.letter)).catch(e => setErr(e.message));
    return () => { stopAllAudio(); };
  }, [token]);

  function playPara(i, url) {
    stopAllAudio();
    setPlaying(null);
    if (playing === i) return;
    if (i > 0 && !finished[i - 1]) return;
    if (!url) return;
    singleAudio.src = url;
    setPlaying(i);
    singleAudio.play().catch(() => setPlaying(null));
    singleAudio.onended = () => { setPlaying(null); setFinished(prev => ({ ...prev, [i]: true })); };
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
                <button className={'play-btn' + (playing === i ? ' playing' : '')} onClick={() => playPara(i, para.audio_url)} disabled={!para.audio_url}>
                  {playing === i ? '❚❚' : '▶'}
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
