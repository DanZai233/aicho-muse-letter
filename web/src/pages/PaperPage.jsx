import { PostalEnvelope, PostalPacking, PostalKeepsakes, newWrapping } from '../components/PostalEnvelope.jsx';
import { suggestCity } from '../postal-location.js';
import { useEffect, useRef, useState } from 'react';
import { accountToken, loginFromMuse, MUSE_URL } from '../account.js';
import { api } from '../api.js';
import './paper.css';

async function request(path='',body,blob=false){
 const r=await fetch('/api/v1/paper'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accountToken()},body:body===undefined?undefined:JSON.stringify(body)});
 if(blob&&r.ok)return r.blob();const d=await r.json();if(!r.ok){const e=new Error(d.message||'暂时无法完成，请重试');e.status=r.status;throw e;}return d.data;
}
const when=v=>v?new Date(v).toLocaleString('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const labels={matching:'寻找收信人',transit:'在途',delivered:'已投递',closed:'已结束'};
const blank={name:'',city:'',language:'中文',topics:[],public_city:false,paused:false,reader:''};
export default function PaperPage(){
 const [packaging,setPackaging]=useState(newWrapping),[postalMeta,setPostalMeta]=useState({cards:[]}),[sealing,setSealing]=useState(false),[opening,setOpening]=useState(false),[locating,setLocating]=useState(false),[cityHint,setCityHint]=useState('');
 const cityTouched=useRef(false);
 const [signedIn,setSignedIn]=useState(()=>!!accountToken());
 const [data,setData]=useState(null),[cities,setCities]=useState([]),[voices,setVoices]=useState([]),[tab,setTab]=useState('相逢'),[profile,setProfile]=useState(blank),[editing,setEditing]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(null),[compose,setCompose]=useState(null),[content,setContent]=useState(''),[reader,setReader]=useState(''),[assisted,setAssisted]=useState(false);
 const [intent,setIntent]=useState(''),[tone,setTone]=useState('自然'),[suggestion,setSuggestion]=useState(''),[showAssist,setShowAssist]=useState(false),[report,setReport]=useState(''),[reporting,setReporting]=useState(false);
 const [playing,setPlaying]=useState(-1),[loadingAudio,setLoadingAudio]=useState(false),[speed,setSpeed]=useState(1),[draftKey,setDraftKey]=useState('');
 const arrived=useRef(null);
 const audio=useRef(null),audioUrl=useRef(null),generation=useRef(0),sendKey=useRef(''),busyRef=useRef(false);
 async function load(){const d=await request();const ids=d.letters.filter(l=>!l.own&&l.status==='delivered').map(l=>l.id);if(arrived.current&&ids.some(id=>!arrived.current.includes(id)))setNotice('你有一封远方来信，已经抵达。');arrived.current=ids;setData(d);return d;}
 useEffect(()=>{if(!signedIn)return;let active=true;Promise.all([request(),request('/meta')]).then(([d,m])=>{if(active){setData(d);setProfile(d.profile||blank);setEditing(!d.profile);setCities(m.cities);setPostalMeta(m);arrived.current=d.letters.filter(l=>!l.own&&l.status==='delivered').map(l=>l.id);}}).catch(e=>{if(active){setError(e.message);if(e.status===401)setSignedIn(false);}});
 api.personas().then(v=>{if(active)setVoices(v.list.filter(p=>p.voice_id));}).catch(()=>{if(active)setNotice('读信人暂时无法加载，你仍然可以写信和阅读。');});
 const timer=setInterval(()=>{if(active)load().catch(()=>{});},60000);return()=>{active=false;clearInterval(timer);stop();};},[signedIn]);
 useEffect(()=>{if(!editing||data?.profile||!cities.length)return;const ctrl=new AbortController();let active=true;setLocating(true);setCityHint('正在根据网络 IP 识别城市（由 IP 城市服务提供），你也可以手动选择。');
 suggestCity(cities,AbortSignal.any([ctrl.signal,AbortSignal.timeout(7000)])).then(city=>{if(active&&!cityTouched.current){setProfile(p=>({...p,city}));setCityHint('已根据网络位置填写 '+city+'，可修改，默认不向笔友公开。'+(!cities.includes(city)?'此城市使用默认 24 小时邮程。':''));}}).catch(()=>{if(active)setCityHint('未能自动识别城市，请手动选择；留空使用 24 小时邮程。');}).finally(()=>{if(active)setLocating(false);});return()=>{active=false;ctrl.abort();};},[editing,cities.length]);
 function stop(){generation.current++;audio.current?.pause();audio.current=null;if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);audioUrl.current=null;setPlaying(-1);setLoadingAudio(false);}
 async function action(fn){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message);}finally{busyRef.current=false;setBusy(false);}}
 function openCompose(routeId=null,incoming=null){
  stop();const key='ml_paper_draft_'+data.user_id+'_'+(routeId||'new');let draft={};try{draft=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
  setDraftKey(key);setContent(draft.content||'');setAssisted(!!draft.assisted);setReader(draft.reader||data.profile.reader||'');setPackaging(draft.wrapping||newWrapping());setIntent('');setSuggestion('');setShowAssist(false);setSelected(null);setCompose({route_id:routeId,letter_id:incoming});sendKey.current=draft.key||crypto.randomUUID();
 }
 useEffect(()=>{if(compose&&draftKey){const draft={content,assisted,reader,wrapping:packaging,key:sendKey.current};try{localStorage.setItem(draftKey,JSON.stringify(draft));}catch{setError('浏览器无法保存草稿，请在关闭页面前复制正文。');}}},[content,assisted,reader,packaging,compose,draftKey]);
 async function locateCity(){
  if(locating)return;setLocating(true);setCityHint('正在根据网络 IP 识别城市…');
  try{const city=await suggestCity(cities,AbortSignal.timeout(7000));if(!cityTouched.current)setProfile(p=>({...p,city}));setCityHint('网络位置建议：'+city+'。'+(!cities.includes(city)?'此城市使用默认 24 小时邮程。':'')+'可手动修改，默认不向笔友公开。');}catch(e){setCityHint(e.name==='TimeoutError'?'网络位置查询超时，请手动选择。':e.message);}finally{setLocating(false);}
 }
 async function checkMail(){await action(async()=>{const d=await request('/check-mail',{});await load();stop();setTab('信箱');setCompose(null);if(d.id){setSelected(d.id);setNotice(d.already_waiting?'你的信箱里已经有一封未拆的信。':'从邮筒里为你找到一封信，信在邮局等待的时间也计入邮程。');}else{setSelected(null);setNotice(d.reason);}});}
 async function unseal(){if(opening||busy)return;setOpening(true);setError('');try{await request(`/letters/${letter.id}/open`,{});if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,650));await load();setReader(data.profile.reader||letter.reader?.id||voices[0]?.id||'');}catch(e){setError(e.message);}finally{setOpening(false);}}
 async function sendLetter(){await action(async()=>{const d=await request('/letters',{...compose,content,reader,wrapping:packaging,ai_assisted:assisted,key:sendKey.current});stop();setSealing(true);if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,800));try{localStorage.removeItem(draftKey);}catch{}setSealing(false);setCompose(null);setContent('');const fresh=await load();setSelected(d.id);setReader(fresh.profile.reader||reader);setNotice('信封已封好，心意正在去往远方。');setTab('信箱');setSealing(false);});}
 function view(l){stop();setSelected(l.id);setCompose(null);setReader(data.profile.reader||l.reader?.id||voices[0]?.id||'');setReporting(false);setReport('');}
 const letter=data?.letters.find(l=>l.id===selected);
 const route=letter&&data.routes.find(r=>r.id===letter.route_id);
 async function play(index,preview=false){
  stop();const version=generation.current;setLoadingAudio(true);try{
   const blob=await request(preview?'/preview':`/letters/${letter.id}/audio/${index}`,{reader,content:preview?content:undefined,index},true);
   if(version!==generation.current)return;audioUrl.current=URL.createObjectURL(blob);const a=new Audio(audioUrl.current);audio.current=a;a.playbackRate=speed;setPlaying(index);
   a.onended=()=>{if(version===generation.current){setPlaying(-1);if(!preview&&index+1<letter.paragraphs.length)play(index+1);}};await a.play();
  }catch(e){if(version===generation.current)setError(e.message);}finally{if(version===generation.current)setLoadingAudio(false);}
 }
 function readerSelect(){return <label>读信人<select value={reader} onChange={e=>{stop();setReader(e.target.value);}}><option value="">{compose?'不推荐，交给收信人选择':'请选择读信人'}</option>{voices.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;}
 async function manage(kind){await request(`/routes/${route.id}/${kind}`,kind==='report'?{letter_id:letter.id,reason:report}:{});setSelected(null);setReporting(false);setNotice(kind==='report'?'举报已收录，已屏蔽此邮路。':'这条邮路已结束，历史信件仍保留。');await load();}
 return <main className="paper-page"> <section className="paper-intro"><span>给远方的一封信</span><h1>纸上逢</h1><p>人海未相识，纸上先相逢。</p><p className="paper-muted">与真人交换书信。第一次回信即刻抵达，之后，让信慢慢旅行。</p></section>
 <nav className="paper-tabs" aria-label="纸上逢导航">{['相逢','信箱','笔友'].map(t=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>{stop();setTab(t);setSelected(null);setCompose(null);}}>{t}{t==='信箱'&&data?' · '+data.letters.filter(l=>!l.own&&l.status==='delivered').length:''}</button>)}<button disabled={!signedIn||busy} onClick={()=>{cityTouched.current=false;setProfile(data?.profile||blank);setEditing(true);}}>寄信名片</button></nav>
 {error&&<p role="alert" className="paper-error">{error}<button onClick={()=>{setError('');load().catch(e=>setError(e.message));}}>重试</button></p>}{notice&&<p role="status">{notice}</p>}
 {!signedIn&&<section className="paper-card"><h2>用 Muse 账号，在纸上相逢</h2><p>已有 Muse 账号可直接使用，无需重复注册。名片、笔友和来信随账号保存。</p><button className="paper-join" onClick={()=>loginFromMuse('paper').catch(e=>setError(e.message))}>使用 Muse 账号继续</button><p><a href={MUSE_URL+'/login'}>前往 Muse 注册</a></p></section>}
 {!data&&signedIn&&!error&&<p role="status">正在打开邮局…</p>}
 {editing&&<section className="paper-card"><h2>你的寄信名片</h2><p>与 Muse 共用账号，信件随账号保存。草稿保存在当前浏览器，城市默认不公开。</p><form onSubmit={e=>{e.preventDefault();action(async()=>{await request('/profile',profile);await load();setEditing(false);setNotice('名片已保存。');});}}>
 <label>笔名<input required maxLength={30} value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></label>
 <label>寄信城市<select value={profile.city} onChange={e=>{cityTouched.current=true;setProfile({...profile,city:e.target.value});}}><option value="">暂不选择 · 默认 24 小时邮程</option>{profile.city&&!cities.includes(profile.city)&&<option value={profile.city}>{profile.city} · 默认 24 小时邮程</option>}{cities.map(c=><option key={c}>{c}</option>)}</select></label>
 <button type="button" disabled={locating} onClick={()=>{cityTouched.current=false;locateCity();}}>{locating?'正在识别城市…':'↻ 根据 IP 填写城市'}</button><p className="paper-muted" role="status">{cityHint||'网络位置可能受代理影响，可手动修改。IP 查询由 IP 城市服务提供，不使用 GPS。'}</p>
 <label><input type="checkbox" checked={profile.public_city} onChange={e=>setProfile({...profile,public_city:e.target.checked})}/>向笔友公开城市名（默认只显示约数距离）</label>
 <label>通信语言<select value={profile.language} onChange={e=>setProfile({...profile,language:e.target.value})}>{['中文','English','日本語'].map(l=><option key={l}>{l}</option>)}</select></label>
 <label>兴趣话题（逗号分隔，最多五个）<input value={profile.topics.join(',')} onChange={e=>setProfile({...profile,topics:e.target.value.split(/[,，]/).slice(0,5)})}/></label>
 <label>固定读信人<select value={profile.reader} onChange={e=>setProfile({...profile,reader:e.target.value})}><option value="">跟随来信推荐</option>{voices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label><input type="checkbox" checked={profile.paused} onChange={e=>setProfile({...profile,paused:e.target.checked})}/>暂停新的随机来信（已有笔友不受影响）</label>
 <button disabled={busy}>保存名片</button>{data?.profile&&<button type="button" onClick={()=>setEditing(false)}>取消</button>}</form></section>}
 {data?.profile&&!editing&&<>
 {!compose&&!letter&&tab==='相逢'&&<section className="paper-card"><h2>把今天的一点心事，寄给远方。</h2><p>最近有哪件小事，你想讲给一个陌生人听？</p><button onClick={()=>openCompose()}>写给远方</button><button className="postal-check" disabled={busy} onClick={checkMail}>{busy?'正在检查邮筒…':'✉ 检查信箱'}</button><p className="paper-muted">还没写过信，也可以检查信箱，从邮局领取一封匿名来信。没有合适来信时，邮筒会安静等你再来。</p><p className="paper-muted">一封信只交给一个人。同时最多等待两次相遇。没有已读回执，也不必急着回。</p><p className="paper-muted">附近约 8 小时，远方约 16～48 小时。写信或检查信箱，都能开始相遇。</p></section>}
 {!compose&&!letter&&tab==='信箱'&&<section><h2>往来信件</h2><button className="postal-check" disabled={busy} onClick={checkMail}>{busy?'正在检查邮筒…':'✉ 检查信箱'}</button>{!data.letters.length&&<p>这里还很安静。检查一下信箱，或寄出一封信，让相逢开始。</p>}{data.letters.map(l=><button className="paper-mail" key={l.id} onClick={()=>view(l)}><span>{l.own?'寄给':'来自'} {l.peer?.name||'尚未相识的人'}</span><strong>{!l.own&&l.status==='delivered'&&l.sealed&&!l.opened?'未拆封':labels[l.status]}</strong><small>{when(l.arrives_at)}{l.distance!==null?' · 约 '+Math.round(l.distance/100)*100+' 公里':''}</small></button>)}</section>}
 {!compose&&!letter&&tab==='笔友'&&<section><h2>相识的邮路</h2>{!data.routes.length&&<p>收到回信以后，远方的人会在这里留下名字。</p>}{data.routes.map(r=><article className="paper-card" key={r.id}><h3>{r.peer.name}</h3><p>{r.peer.city||'远方'} · {r.status==='closed'?'邮路已结束':r.status==='penpal'?'笔友':r.status==='replied'?'初次回信已抵达':'等待第一封回信'}</p><button onClick={()=>{setTab('信箱');const l=data.letters.find(l=>l.route_id===r.id&&!l.own)||data.letters.find(l=>l.route_id===r.id);if(l)view(l);}}>展开往来</button></article>)}</section>}
 {letter&&<section className="paper-card"><button onClick={()=>{stop();setSelected(null);}}>← 回到信箱</button><h2>{letter.own?'寄给':'来自'} {letter.peer?.name||'远方的朋友'}</h2><p>{labels[letter.status]} {letter.instant?' · 首次回信，即刻抵达':''} {letter.arrives_at?' · '+when(letter.arrives_at):''}</p>
 {!letter.own&&!letter.content&&<PostalEnvelope wrapping={letter.wrapping} from={letter.peer?.name} to={data.profile.name} sealed opening={opening} disabled={busy} onOpen={letter.status==='delivered'?unseal:undefined}/>}
 {(letter.own||letter.content)&&<PostalEnvelope wrapping={letter.wrapping} from={letter.own?data.profile.name:letter.peer?.name} to={letter.own?(letter.peer?.name||'尚未相识的你'):data.profile.name}/>}
 {letter.content?<div className="postal-opened"><div className="paper-player">{readerSelect()}<button disabled={!reader||loadingAudio} onClick={()=>playing>=0?stop():play(0)}>{loadingAudio?'正在准备声音…':playing>=0?'停止朗读':'▶ 听信'}</button><button disabled={!audio.current} onClick={()=>{if(audio.current.paused)audio.current.play().catch(e=>setError(e.message));else audio.current.pause();}}>暂停 / 继续</button><label>倍速<select value={speed} onChange={e=>{setSpeed(+e.target.value);if(audio.current)audio.current.playbackRate=+e.target.value;}}>{[.75,1,1.25,1.5,2].map(v=><option key={v} value={v}>{v}×</option>)}</select></label></div>
 <PostalKeepsakes wrapping={letter.wrapping}/><div className="paper-letter">{letter.paragraphs.map((p,i)=><p key={i} className={playing===i?'paper-speaking':''}>{p}<button className="paper-segment" aria-label={'朗读第 '+(i+1)+' 段'} disabled={!reader||loadingAudio} onClick={()=>play(i)}>♫</button></p>)}</div>{letter.ai_assisted&&<small>AI 辅助成稿 · 由寄信人确认寄出</small>}
 {!letter.own&&route?.status!=='closed'&&<button onClick={()=>openCompose(letter.route_id,letter.id)}>{route?.status==='replied'?'继续通信':'写回信'}</button>}</div>:<p className="paper-sealed">{letter.status==='delivered'?'远方的心意已经抵达，拆开信封，看看里面写了什么。':'信还在途中。等它抵达，再慢慢拆开。'}</p>}
 {letter.own&&letter.route_id&&route&&!route.first_reply_used&&Date.now()-Date.parse(letter.sent_at)>=7*86400000&&letter.status!=='closed'&&<button disabled={busy} onClick={()=>action(async()=>{await request(`/letters/${letter.id}/repost`,{});setSelected(null);await load();})}>结束等待，重新寄给另一人</button>}
 {letter.own&&letter.status==='matching'&&<button disabled={busy} onClick={()=>action(async()=>{await request(`/letters/${letter.id}/withdraw`,{});setSelected(null);await load();})}>撤回未匹配的信</button>}
 {route&&route.status!=='closed'&&<details><summary>管理这条邮路</summary><p>结束通信后保留历史信件，未送达的信将停止投递。</p><button disabled={busy} onClick={()=>action(()=>manage('close'))}>结束通信</button><button disabled={busy} onClick={()=>action(()=>manage('block'))}>屏蔽对方</button>{!letter.own&&letter.content&&<button onClick={()=>setReporting(!reporting)}>举报来信</button>}{reporting&&<label>举报原因<textarea value={report} maxLength={500} onChange={e=>setReport(e.target.value)}/><button disabled={!report.trim()||busy} onClick={()=>action(()=>manage('report'))}>提交举报并屏蔽</button></label>}</details>}
 <h3>这条邮路的其他信件</h3>{data.letters.filter(l=>l.route_id===letter.route_id&&l.id!==letter.id&&l.route_id).map(l=><button key={l.id} onClick={()=>view(l)}>{l.own?'寄出':'来信'} · {when(l.sent_at)} · {labels[l.status]}</button>)}</section>}
 {compose&&<section className={'paper-card'+(sealing?' postal-sending':'')}><h2>{compose.route_id?'写给相识的人':'写给远方'}</h2><p>{compose.route_id?'每段相遇仅第一次回信即时送达，后续按距离旅行。':'匹配完成后按距离寄送；没有合适的人时，信会安静等候。'}</p><label>信的正文<textarea className="paper-compose" value={content} maxLength={3000} onChange={e=>setContent(e.target.value)} placeholder="今天，有一件小事想讲给你听……"/></label><small>{content.length} / 3000 · 草稿自动保存在本浏览器</small>
 <button onClick={()=>setShowAssist(!showAssist)}>✦ AI 帮我{compose.letter_id?'回':'写'}</button>
 {showAssist&&<div className="paper-assist"><p>{compose.letter_id?'AI 会参考这封已送达的来信和你输入的想法，不读取其他笔友的信。':'写几句真实想法，AI 帮你起头、整理或成信；不会自动寄出。'}</p><label>你的真实想法<textarea value={intent} maxLength={1500} onChange={e=>setIntent(e.target.value)} placeholder="我想说些什么？也可以把原稿放在这里，请 AI 润色。"/></label><label>语气<select value={tone} onChange={e=>setTone(e.target.value)}>{['自然','温柔','幽默','简短','只纠错，保留原文'].map(t=><option key={t}>{t}</option>)}</select></label><button disabled={busy||intent.trim().length<5} onClick={()=>action(async()=>{const d=await request('/assist',{intent,tone,letter_id:compose.letter_id});setSuggestion(d.text);})}>{busy?'正在整理…':'生成草稿'}</button>{suggestion&&<><label>AI 草稿（采用前可编辑）<textarea value={suggestion} onChange={e=>setSuggestion(e.target.value)}/></label><button onClick={()=>{setContent(suggestion.slice(0,3000));setAssisted(true);setSuggestion('');}}>采用这份草稿</button><button onClick={()=>setSuggestion('')}>保留原稿</button></>}</div>}
 {readerSelect()}<button disabled={!reader||!content.trim()||loadingAudio} onClick={()=>play(0,true)}>{loadingAudio?'正在准备…':'试听正文首段'}</button>{playing>=0&&<button onClick={stop}>停止试听</button>}
 <p className="paper-letter">{content||'在这里预览你的信。'}</p>{assisted&&<p>随信标注「AI 辅助成稿」。</p>}
 <PostalPacking value={packaging} onChange={setPackaging} cards={postalMeta.cards} name={data.profile.name} to={compose.route_id?data.routes.find(r=>r.id===compose.route_id)?.peer.name:undefined}/><p className="paper-muted">信封、邮票、祝福卡和明信片会随信一起保存，收信人拆开后看到同一份心意。</p>
 <button className="paper-join" disabled={busy||sealing||content.trim().length<20} onClick={sendLetter}>{busy?'正在封好这封信…':'封好信封，寄往远方'}</button><button onClick={()=>{stop();setCompose(null);}}>收起，保留草稿</button></section>}
 </>}
 </main>;
}
