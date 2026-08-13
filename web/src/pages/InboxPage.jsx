import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_LABEL = { writing: '寄送中', replying: '回信中', done: '已回信', error: '回信失败' };

export default function InboxPage() {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.letters().then(d => setLetters(d.list || [])).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  function fmt(t) {
    const d = new Date(t);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? d.toTimeString().slice(0, 5) : `${d.getMonth()+1}月${d.getDate()}日`;
  }

  return (
    <div className="page inbox-page">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="back-link">←</Link>
          <div className="topbar-title">我的信箱</div>
          <Link to="/" className="icon-link" title="写信">✎</Link>
        </div>
      </header>
      <main className="inbox-main">
        <div className="inbox-head">
          <p className="inbox-desc">写过的信都收在这里，可以反复回看、重新听，也可以分享给朋友。</p>
          {letters.length ? <span className="inbox-count">{letters.length} 封信</span> : null}
        </div>
        {loading ? <p className="empty-hint">正在打开信箱…</p> : null}
        {err ? <p className="form-err">{err}</p> : null}
        {!loading && !err && letters.length === 0 ? (
          <div className="empty-box">
            <span className="empty-icon">💌</span>
            <p>信箱还是空的</p>
            <Link className="empty-btn" to="/">写第一封信</Link>
          </div>
        ) : null}
        <ul className="letter-list">
          {letters.map(l => (
            <li key={l.id}>
              <Link className="letter-row" to={'/letter/' + l.id}>
                <span className="row-avatar" style={{ background: l.persona?.avatar_color }}>{l.persona?.name?.slice(0,1)}</span>
                <span className="row-body">
                  <span className="row-title">致 {l.persona?.name}{l.pen_name ? ' · ' + l.pen_name : ''}</span>
                  <span className="row-preview">{l.letter_preview || ''}{l.letter_preview?.length >= 80 ? '…' : ''}</span>
                </span>
                <span className="row-meta">
                  <span className={'status-dot ' + l.status} />
                  <span className="row-time">{fmt(l.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
