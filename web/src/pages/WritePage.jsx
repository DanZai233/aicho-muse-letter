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
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customTagline, setCustomTagline] = useState('');
  const [customPersonality, setCustomPersonality] = useState('');
  const [customVoice, setCustomVoice] = useState(null); // { id, title, sample_audio }
  const [libOpen, setLibOpen] = useState(false);
  const [libQuery, setLibQuery] = useState('');
  const [libResults, setLibResults] = useState([]);
  const [libLoading, setLibLoading] = useState(false);

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
    if (!p.voice_id) return;
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

  function playSample(item) {
    if (!item.sample_audio) return;
    stopAllAudio();
    const a = new Audio(item.sample_audio);
    a.play().catch(() => {});
    setTimeout(() => a.pause(), 12000);
  }

  async function doSearch(q) {
    setLibLoading(true);
    try {
      const d = await api.librarySearch(q || '');
      setLibResults(d.list || []);
    } catch (e) {
      setErr('音色广场搜索失败：' + e.message);
    } finally {
      setLibLoading(false);
    }
  }

  async function send() {
    if (customMode) {
      if (!customName.trim()) { setErr('请填写写信对象的名字'); return; }
      if (!customVoice) { setErr('请先从音色广场选一个音色'); return; }
    } else if (!selected) {
      setErr('请先选择写信对象'); return;
    }
    if (content.trim().length < 5) { setErr('信的内容太短了，多写几句吧'); return; }
    setSending(true); setErr('');
    try {
      const d = await api.sendLetter({
        pen_name: penName.trim(),
        persona_id: customMode ? undefined : selected.id,
        persona_name: customMode ? customName.trim() : undefined,
        persona_tagline: customMode ? customTagline.trim() : undefined,
        persona_personality: customMode ? customPersonality.trim().split(/[，,]/).map(x => x.trim()).filter(Boolean).slice(0, 6) : undefined,
        voice_id: customMode ? customVoice.id : undefined,
        voice_name: customMode ? customVoice.title : undefined,
        letter_content: content.trim(),
      });
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
            <div className="picker-head">
              <p className="picker-hint">选择你的写信对象</p>
              <button className="custom-toggle" onClick={() => { setCustomMode(!customMode); setLibOpen(false); }}>{customMode ? '← 官方预设' : '＋ 自定义对象'}</button>
            </div>

            {!customMode ? (
              <>
                <div className="persona-list">
                  {personas.map(p => (
                    <PersonaCard key={p.id} p={p} selected={selected?.id === p.id} onSelect={setSelected} onPreview={onPreview} previewing={previewing} />
                  ))}
                </div>
                {selected?.background ? <p className="persona-bio">{selected.background}</p> : null}
              </>
            ) : (
              <div className="custom-box">
                <div className="custom-row">
                  <label className="pen-label">名字</label>
                  <input className="pen-input" value={customName} maxLength={20} placeholder="给 TA 起个名字" onChange={e => setCustomName(e.target.value)} />
                </div>
                <div className="custom-row">
                  <label className="pen-label">一句话</label>
                  <input className="pen-input" value={customTagline} maxLength={60} placeholder="TA 是个怎样的人（可选）" onChange={e => setCustomTagline(e.target.value)} />
                </div>
                <div className="custom-row">
                  <label className="pen-label">性格</label>
                  <input className="pen-input" value={customPersonality} maxLength={120} placeholder="温柔、真诚、有想象力（用逗号分隔）" onChange={e => setCustomPersonality(e.target.value)} />
                </div>
                <div className="custom-voice">
                  <div className="custom-voice-head">
                    <span className="pen-label">音色</span>
                    {customVoice ? <span className="voice-chip">♪ {customVoice.title} <button className="chip-x" onClick={() => setCustomVoice(null)}>✕</button></span> : null}
                    <button className="mini-btn" onClick={() => setLibOpen(!libOpen)}>{libOpen ? '收起' : '从音色广场选'}</button>
                  </div>
                  {libOpen ? (
                    <div className="lib-box">
                      <div className="lib-search">
                        <input className="pen-input" value={libQuery} placeholder="搜索音色，如：温柔 女声" onChange={e => setLibQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') doSearch(libQuery); }} />
                        <button className="mini-btn" onClick={() => doSearch(libQuery)} disabled={libLoading}>{libLoading ? '搜索中…' : '搜索'}</button>
                      </div>
                      <div className="lib-list">
                        {libResults.map(item => (
                          <div key={item.id} className={'lib-item' + (customVoice?.id === item.id ? ' selected' : '')} onClick={() => setCustomVoice({ id: item.id, title: item.title, sample_audio: item.sample_audio })}>
                            <span className="lib-title">{item.title}</span>
                            {item.sample_audio ? <button className="play-mini" onClick={(e) => { e.stopPropagation(); playSample(item); }}>▶</button> : null}
                          </div>
                        ))}
                        {!libLoading && libResults.length === 0 ? <p className="lib-empty">输入关键词搜索，或直接点搜索看全部</p> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
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
