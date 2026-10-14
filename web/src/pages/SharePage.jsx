import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Spinner, stopAllAudio, useLetterPlayback } from '../components/ui.jsx';
import { getFont, fontFamily } from '../fonts.js';

export default function SharePage() {
  const { token } = useParams();
  const [letter, setLetter] = useState(null);
  const [retry, setRetry] = useState(0);
  const [err, setErr] = useState('');
  const player = useLetterPlayback({ sourceId: token, letter, setLetter,
    synthesize: (i, signal) => api.shareSynthAudio(token, i, signal),
    onError: message => setErr(message),
  });
  const { playPara, synthLoading } = player;
  const { playing, progress } = player;
  const [fontId, setFontId] = useState(() => getFont().id);

  useEffect(() => {
    const controller = new AbortController();
    setErr('');
    setLetter(null);
    api.shared(token, controller.signal).then(d => { if (!controller.signal.aborted) setLetter(d.letter); }).catch(e => { if (!controller.signal.aborted) setErr(e.message); });
    return () => { controller.abort(); stopAllAudio(); };
  }, [token, retry]);

  if (!letter && !err) return <div className="page"><Spinner label="正在展开信笺…" /></div>;
  if (err && !letter) return (
    <div className="page share-page">
      <main className="share-main">
        <div className="empty-box">
          <span className="empty-icon">📭</span>
          <p>{err}</p><button className="ghost-btn" onClick={() => setRetry(n => n + 1)}>重试</button>
          <Link className="empty-btn" to="/">去写一封信</Link>
        </div>
      </main>
    </div>
  );

  return (
    <div className="page share-page">
      <main className="share-main">
        {err ? <p role="alert" className="form-err">{err}（点击段落可重试）</p> : null}
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
          <div className="letter-body" style={fontFamily(fontId) ? { fontFamily: fontFamily(fontId) } : undefined}>
            <p className="opening">{letter.pen_name}：</p>
            {String(letter.letter_content || '').split(/\n{2,}/).filter(Boolean).map((para, i) => (
              <p key={i} className="para">{para}</p>
            ))}
          </div>
        </section>
        <section className="paper-card reply-card">
          <div className="reply-tag">回信</div>
              <button className="ghost-btn" onClick={player.readingAll ? player.stop : player.readAll}>{player.readingAll ? '停止朗读' : '朗读整封信'}</button>
          <div className="letter-body reply-body" style={fontFamily(fontId) ? { fontFamily: fontFamily(fontId) } : undefined}>
            {letter.reply?.map((para, i) => (
              <div key={i} className="reply-para">
                <button className={'play-btn' + (playing === i ? ' playing' : '')} onClick={() => playPara(i, para.audio_url)} aria-label={"朗读第 " + (i + 1) + " 段"} title={para.audio_url ? '朗读这一段' : '生成并朗读这一段'}>
                  {synthLoading === i ? '…' : (playing === i ? (player.paused ? '▶' : '❚❚') : '▶')}
                </button>
                <div className="reply-text">
                  {playing === i && progress?.i === i ? (
                    <div className="audio-progress" aria-label="朗读进度">
                      <div className="audio-progress-fill" style={{ width: progress.pct + '%' }} />
                    </div>
                  ) : null}
                  <p className="para">{para.text}</p>
                </div>
              </div>
            ))}
            {letter.signature ? <p className="signature">—— {letter.signature}</p> : null}
          </div>
        </section>
        <div className="share-cta">
          <Link className="share-cta-btn" to="/">✍ 去写自己的信<span className="share-cta-arrow">→</span></Link>
          <p className="share-foot">在 缪斯信笺，把想说的话写成信，听回音。</p>
        </div>
      </main>
    </div>
  );
}
