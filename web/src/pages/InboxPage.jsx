import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_LABEL = { writing: '寄送中', replying: '回信中', done: '已回信', error: '回信失败' };

export default function InboxPage() {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let timer = null;
    async function load() {
      try {
        const d = await api.letters();
        setLetters(d.list || []);
        setErr('');
        // 有未完成信件则继续轮询，全部完成后停止
        const pending = (d.list || []).some(l => l.status === 'writing' || l.status === 'replying');
        if (pending) timer = setTimeout(load, 3000);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => clearTimeout(timer);
  }, []);

  async function remove(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('确定要删除这封信吗？删除后无法恢复。')) return;
    try {
      await api.deleteLetter(id);
      setLetters(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      alert('删除失败：' + err.message);
    }
  }

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
            <span className="empty-icon">🕊️</span>
            <p className="empty-title">信箱还是空的</p>
            <p className="empty-sub">把第一句话写给想见的人，<br/>让回声在字里行间等你。</p>
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
                  <span className={'row-status ' + l.status}>{STATUS_LABEL[l.status] || ''}</span>
                  <span className="row-time">{fmt(l.created_at)}</span>
                </span>
                <button className="row-del" title="删除这封信" onClick={(e) => remove(l.id, e)}>✕</button>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
