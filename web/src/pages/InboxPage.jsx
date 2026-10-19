import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const STATUS_LABEL = { writing: '寄送中', replying: '回信中', done: '已回信', error: '回信失败' };

export default function InboxPage() {
  const [params, setParams] = useSearchParams();
  const legacy=params.get('legacy')==='1';
  const persona = params.get('persona') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [total, setTotal] = useState(0);
  const [personas, setPersonas] = useState([]);
  const [retry, setRetry] = useState(0);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let timer = null;
    const controller = new AbortController();
    setLoading(true);
    async function load() {
      try {
        const d = await api.letters({ page, page_size: 20, persona, ...(legacy?{legacy:'1'}:{}) }, controller.signal);
        if (controller.signal.aborted) return;
        setTotal(d.total);
        setPersonas(d.personas || []);
        setLetters(d.list || []);
        setErr('');
        // 有未完成信件则继续轮询，全部完成后停止
        const pending = (d.list || []).some(l => l.status === 'writing' || l.status === 'replying');
        if (pending) timer = setTimeout(load, 3000);
      } catch (e) {
        if (!controller.signal.aborted) setErr(e.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [page, persona, retry, legacy]);

  async function remove(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('确定要删除这封信吗？删除后无法恢复。')) return;
    try {
      await api.deleteLetter(id);
      if (letters.length === 1 && page > 1) setParams({ persona, page: String(page - 1), ...(legacy?{legacy:'1'}:{}) });
      else setRetry(n => n + 1);
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
          <div className="topbar-title">{legacy?'浏览器旧信箱':'我的信箱'}</div>
          <Link to="/" className="icon-link" title="写信">✎</Link>
        </div>
      </header>
      <main className="inbox-main">
        <div className="inbox-head">
          <p className="inbox-desc">写过的信都收在这里，可以反复回看、重新听，也可以分享给朋友。</p>
          {total ? <span className="inbox-count">{total} 封信</span> : null}
        </div>
        <label className="conversation-filter">往来对象 <select value={persona} onChange={e => setParams({...(e.target.value?{persona:e.target.value}:{}),...(legacy?{legacy:'1'}:{})})}>
          <option value="">全部信件</option>{personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <p className="empty-hint"><Link to={legacy?'/inbox':'/inbox?legacy=1'}>{legacy?'返回账号信箱':'寻找登录前的信？打开浏览器旧信箱'}</Link></p>
        {loading ? <p className="empty-hint">正在打开信箱…</p> : null}
        {err ? <p className="form-err">{err} <button className="ghost-btn" onClick={() => setRetry(n => n + 1)}>重试</button></p> : null}
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
              <Link className="letter-row" to={'/letter/' + l.id+(legacy?'?legacy=1':'')}>
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
              </Link>
              <button className="row-del" title="删除这封信" aria-label="删除这封信" onClick={(e) => remove(l.id, e)}>✕</button>
            </li>
          ))}
        </ul>
        {total > 20 ? <nav className="letter-actions" aria-label="信箱分页">
          <button className="ghost-btn" disabled={page <= 1} onClick={() => setParams({ persona, page: String(page - 1), ...(legacy?{legacy:'1'}:{}) })}>上一页</button>
          <span>第 {page} / {Math.ceil(total / 20)} 页</span>
          <button className="ghost-btn" disabled={page * 20 >= total} onClick={() => setParams({ persona, page: String(page + 1), ...(legacy?{legacy:'1'}:{}) })}>下一页</button>
        </nav> : null}
      </main>
    </div>
  );
}
