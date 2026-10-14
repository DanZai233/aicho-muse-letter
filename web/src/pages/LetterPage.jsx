import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { LetterHeader, Spinner, stopAllAudio, useLetterPlayback } from '../components/ui.jsx';
import { getFont, fontFamily } from '../fonts.js';

export default function LetterPage() {
  const { id } = useParams();
  const [letter, setLetter] = useState(null);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const player = useLetterPlayback({ sourceId: id, letter, setLetter,
    synthesize: (i, signal) => api.synthAudio(id, i, signal),
    onError: message => setErr(message),
  });
  const { playPara, synthLoading } = player;
  const { playing, progress } = player;
  const [shareUrl, setShareUrl] = useState('');
  const [toast, setToast] = useState('');
  const [regenAudio, setRegenAudio] = useState(null); // index
  const [fontId, setFontId] = useState(() => getFont().id);
  const pollRef = useRef(null);
  const controllerRef = useRef(null);

  const load = useCallback(async () => {
    clearTimeout(pollRef.current);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setErr('');
    try {
      const d = await api.letter(id, controller.signal);
      if (controller.signal.aborted) return;
      setShareUrl(d.letter.share_token ? location.origin + '/l/' + d.letter.share_token : '');
      setLetter(d.letter);
      setStatus(d.letter.status);
      if (d.letter.status === 'writing' || d.letter.status === 'replying') {
        pollRef.current = setTimeout(load, 1800);
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setErr(e.message);
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    setLetter(null);
    setStatus('loading');
    setShareUrl('');
    load();
    return () => { clearTimeout(pollRef.current); controllerRef.current?.abort(); stopAllAudio(); };
  }, [load]);

  async function regenPara(i) {
    if (regenAudio !== null) return;
    const version = letter.reply_version;
    player.stop();
    setRegenAudio(i);
    try {
      const d = await api.regenAudio(id, i);
      setLetter(prev => prev && prev.reply_version === version ? {
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

  async function removeLetter() {
    if (!window.confirm('确定要删除这封信吗？删除后无法恢复。')) return;
    try {
      await api.deleteLetter(id);
      location.href = '/inbox';
    } catch (e) { setErr(e.message); }
  }

  async function regen() {
    clearTimeout(pollRef.current);
    controllerRef.current?.abort();
    player.stop();
    setErr('');
    setStatus('replying');
    setLetter(prev => prev ? { ...prev, reply: [], signature: '', status: 'replying' } : prev);
    player.play(-1, null);
    stopAllAudio();
    try {
      await api.regen(id);
      pollRef.current = setTimeout(load, 2000);
    } catch (e) { setErr(e.message); setStatus('error'); }
  }

  async function copyFull() {
    if (!letter) return;
    const lines = [];
    lines.push('致 ' + (letter.persona?.name || '') + (letter.pen_name ? '（' + letter.pen_name + '）' : ''));
    lines.push('');
    lines.push(String(letter.letter_content || ''));
    lines.push('');
    lines.push('—— ' + (letter.persona?.name || '') + ' 的回信 ——');
    lines.push('');
    for (const p of (letter.reply || [])) {
      lines.push(p.text);
      lines.push('');
    }
    if (letter.signature) lines.push(letter.signature);
    const text = lines.join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setToast('全文已复制 ✓');
      setTimeout(() => setToast(''), 2200);
    } catch (e) {
      setErr('复制失败：' + e.message);
    }
  }

  async function share() {
    try {
      const d = await api.shareOn(id);
      const url = location.origin + d.share_url;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); setToast('分享链接已复制 ✓'); }
      catch { setToast('分享已开启，请复制下方链接'); }
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

  function fmtDate(t) {
    if (!t) return '';
    const d = new Date(t);
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  const pending = status === 'writing' || status === 'replying';
  const done = status === 'done';

  return (
    <div className="page letter-page">
      <LetterHeader title={letter ? '致 ' + letter.persona?.name : '信'} backTo="/inbox"
        right={<Link to="/" className="icon-link">✎</Link>} />
      {toast ? <div className="toast">{toast}</div> : null}
      {err ? <p className="form-err page-err">{err}</p> : null}
      {!letter ? (err ? <button className="ghost-btn" onClick={load}>重新取信</button> : <Spinner label="正在取信…" />) : (
        <main className="letter-main">
          {/* 来信 */}
          <section className="paper-card incoming">
            <div className="paper-head">
              <span className="strip-avatar" style={{ background: letter.persona?.avatar_color }}>{letter.persona?.name?.slice(0,1)}</span>
              <div className="head-text">
                <span className="head-name">{letter.persona?.name}</span>
                <span className="head-sub">{letter.persona?.tagline || '来信已收到'}</span>
                <span className="head-date">{fmtDate(letter.created_at)}</span>
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

          {/* 回信 */}
          {pending ? (
            <section className="reply-pending">
              <Spinner label={status === 'replying' ? (letter.reply?.length ? '正在诵读回信…' : '正在为你回信…') : '信已寄出，等待回音…'} />
              <p className="pending-hint">回信需要一小会儿，写完后会自动保存在你的信箱里。</p>
            </section>
          ) : done ? (
            <section className="paper-card reply-card">
              <div className="reply-tag">回信</div>
              <button className="ghost-btn" onClick={player.readingAll ? player.stop : player.readAll}>{player.readingAll ? '停止朗读' : '朗读整封信'}</button>
              <div className="letter-body reply-body" style={fontFamily(fontId) ? { fontFamily: fontFamily(fontId) } : undefined}>
                {letter.reply?.map((para, i) => (
                  <div key={i} className="reply-para" style={{ animationDelay: (i * 0.28) + 's' }}>
                    <button
                      className={'play-btn' + (playing === i ? ' playing' : '')}
                      onClick={() => playPara(i, para.audio_url)} aria-label={"朗读第 " + (i + 1) + " 段"}
                      title={para.audio_url ? '朗读这一段' : '生成并朗读这一段'}
                    >
                      {synthLoading === i ? '…' : (playing === i ? (player.paused ? '▶' : '❚❚') : '▶')}
                    </button>
                    <div className="reply-text">
                      {playing === i && progress?.i === i ? (
                        <div className="audio-progress" aria-label="朗读进度">
                          <div className="audio-progress-fill" style={{ width: progress.pct + '%' }} />
                        </div>
                      ) : null}
                      <p className="para">{para.text}</p>
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
              <Link className="ghost-btn" to={'/?from=' + id}>接着写</Link>
              <Link className="ghost-btn" to={'/?from=' + id + '&new=1'}>开启新话题</Link>
              <Link className="ghost-btn" to={'/inbox?persona=' + encodeURIComponent(letter.persona.id)}>查看与 TA 的往来</Link>
              <button className="ghost-btn" onClick={copyFull}>📋 复制全文</button>
              <button className="ghost-btn danger" onClick={removeLetter}>🗑 删除这封信</button>
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
