import { useState, useRef } from 'react';
import { api } from '../api.js';

const TYPES = ['功能建议', '问题反馈', '希望新增角色', '其他'];

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('功能建议');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  function close() {
    setOpen(false);
    setErr('');
  }

  function closeDone() {
    setOpen(false);
    setDone(false);
    setContent('');
    setContact('');
    setErr('');
  }

  async function submit() {
    if (content.trim().length < 2) { setErr('写几句话再提交吧'); return; }
    setSending(true); setErr('');
    try {
      await api.submitFeedback({ type, content: content.trim(), contact: contact.trim() });
      setDone(true);
      setSending(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(closeDone, 2200);
    } catch (e) {
      setErr(e.message);
      setSending(false);
    }
  }

  return (
    <>
      <button className="feedback-fab" onClick={() => { setDone(false); setOpen(!open); }} title="意见反馈">
        💬
      </button>
      {open ? (
        <div className="feedback-mask" onClick={close}>
          <div className="feedback-card" onClick={e => e.stopPropagation()}>
            {done ? (
              <div className="feedback-done">
                <span className="feedback-done-icon">💌</span>
                <p>收到啦,谢谢你!</p>
                <p className="feedback-done-sub">你的反馈我们会认真看</p>
              </div>
            ) : (
              <>
                <div className="feedback-head">
                  <span className="feedback-title">意见反馈</span>
                  <button className="feedback-x" onClick={close}>✕</button>
                </div>
                <div className="feedback-types">
                  {TYPES.map(t => (
                    <button
                      key={t}
                      className={'feedback-type' + (type === t ? ' active' : '')}
                      onClick={() => setType(t)}
                    >{t}</button>
                  ))}
                </div>
                <textarea
                  className="feedback-textarea"
                  value={content}
                  maxLength={2000}
                  placeholder="想说的话、遇到的问题、希望新增的角色……"
                  onChange={e => setContent(e.target.value)}
                />
                <input
                  className="feedback-input"
                  value={contact}
                  maxLength={200}
                  placeholder="联系方式(选填,方便我们回复你)"
                  onChange={e => setContact(e.target.value)}
                />
                {err ? <p className="form-err">{err}</p> : null}
                <button className="feedback-submit" disabled={sending} onClick={submit}>
                  {sending ? '提交中…' : '提交反馈'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
