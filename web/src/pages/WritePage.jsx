import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, visitorId } from '../api.js';
import { LetterHeader, PersonaCard, stopAllAudio } from '../components/ui.jsx';

export default function WritePage() {
  const nav = useNavigate();
  const [personas, setPersonas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [penName, setPenName] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => {
    api.personas().then(d => {
      const list = d.list || [];
      setPersonas(list);
      const elysia = list.find(p => p.id === 'preset-elysia') || list[0];
      if (elysia) setSelected(elysia);
    }).catch(e => setErr('对象列表加载失败：' + e.message));
    return () => stopAllAudio();
  }, []);

  async function onPreview(p) {
    setPreviewing(p.id);
    try {
      const d = await api.previewVoice({ persona_name: p.name, voice_id: p.voice_id });
      stopAllAudio();
      const a = new Audio(d.audio_url);
      a.play().catch(() => {});
      setTimeout(() => a.pause(), 12000);
    } catch (e) {
      setErr('试听失败：' + e.message);
    } finally {
      setPreviewing(null);
    }
  }

  async function send() {
    if (!selected) { setErr('请先选择写信对象'); return; }
    if (content.trim().length < 5) { setErr('信的内容太短了，多写几句吧'); return; }
    setSending(true); setErr('');
    try {
      const d = await api.sendLetter({ pen_name: penName.trim(), persona_id: selected.id, letter_content: content.trim() });
      nav('/letter/' + d.id);
    } catch (e) {
      setErr(e.message);
      setSending(false);
    }
  }

  return (
    <div className="page write-page">
      <LetterHeader title="写信" />
      <main className="write-main">
        <section className="paper-card">
          <div className="paper-head">
            <span className="paper-kicker">致</span>
            <div className="persona-strip">
              {selected ? (
                <>
                  <span className="strip-avatar" style={{ background: selected.avatar_color }}>{selected.name.slice(0,1)}</span>
                  <span className="strip-name">{selected.name}</span>
                  {selected.voice_id ? <button className="mini-btn" onClick={() => onPreview(selected)}>♪ 试听</button> : null}
                </>
              ) : <span className="strip-name">…</span>}
            </div>
          </div>

          <div className="persona-picker">
            <p className="picker-hint">选择你的写信对象</p>
            <div className="persona-list">
              {personas.map(p => (
                <PersonaCard key={p.id} p={p} selected={selected?.id === p.id} onSelect={setSelected} onPreview={onPreview} previewing={previewing} />
              ))}
            </div>
            {selected?.background ? <p className="persona-bio">{selected.background}</p> : null}
          </div>

          <div className="pen-row">
            <label className="pen-label">落款笔名</label>
            <input className="pen-input" value={penName} maxLength={20} placeholder="你的笔名（可选）" onChange={e => setPenName(e.target.value)} />
          </div>

          <textarea
            className="letter-area"
            value={content}
            maxLength={3000}
            placeholder={'给「' + (selected?.name || '…') + '」写一封信吧……\n\n最近在想什么，想写什么故事，都可以告诉她。'}
            onChange={e => setContent(e.target.value)}
          />
          <div className="letter-count">{content.length}/3000</div>

          {err ? <p className="form-err">{err}</p> : null}
          <button className="send-btn" disabled={sending} onClick={send}>
            {sending ? '寄出中…' : '寄出这封信 💌'}
          </button>
        </section>
      </main>
    </div>
  );
}
