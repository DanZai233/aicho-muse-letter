import {useEffect,useState} from 'react';
import {accountToken,loginFromMuse} from '../account.js';
import {PostalEnvelope,PostalKeepsakes} from '../components/PostalEnvelope.jsx';
import './paper.css';
const labels={matching:'等待相逢',transit:'邮路途中',delivered:'已投递',closed:'已结束'};
const date=v=>v?new Date(v).toLocaleString('zh-CN'):'';
async function request(path='',body){const r=await fetch('/api/v1/paper'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+accountToken(),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.message||'暂时无法完成');return d.data;}
export default function PaperSentPage(){
 const [data,setData]=useState(null),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function load(){setData(await request());}
 useEffect(()=>{if(accountToken())load().catch(e=>setError(e.message));},[]);
 async function manage(path,message){if(busy||!window.confirm(message))return;setBusy(true);setError('');try{await request(path,{});await load();setNotice('已更新寄信记录。');}catch(e){setError(e.message);}finally{setBusy(false);}}
 const own=data?.letters.filter(l=>l.own)||[],letters=own.filter(l=>filter==='all'||l.status===filter),letter=own.find(l=>l.id===selected),route=data?.routes.find(r=>r.id===letter?.route_id);
 return <main className="paper-page"><section className="paper-intro"><span>寄往远方的心意</span><h1>已寄出的信</h1><p>每一封认真写下的信，都在这里留一份底稿。</p></section><nav className="paper-tabs"><a href="/paper">← 回到纸上逢</a><a href="/paper">写一封新信</a></nav>
 {!accountToken()&&<button onClick={()=>loginFromMuse('paper')}>使用 Muse 账号查看寄信记录</button>}
 {error&&<p role="alert">{error} <button onClick={()=>load().catch(e=>setError(e.message))}>重试</button></p>}{notice&&<p role="status">{notice}</p>}
 {data&&<><nav className="paper-tabs" aria-label="寄信状态筛选">{Object.entries({all:'全部',...labels}).map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setSelected(null);}}>{label} · {id==='all'?own.length:own.filter(l=>l.status===id).length}</button>)}</nav>
 {!letter&&<section><p className="paper-muted">未匹配的信可以撤回；已投递的信保留底稿，不提供已读回执。结束邮路会停止途中信件。</p>{!letters.length&&<p>这里还没有信。慢慢写，心意总有抵达的一天。</p>}{letters.map(l=><button className="paper-mail" key={l.id} onClick={()=>setSelected(l.id)}><strong>致 {l.peer?.name||'尚未相识的人'}</strong><span>{labels[l.status]}</span><small>寄出于 {date(l.sent_at)}</small><span>{l.content?.slice(0,70)}</span></button>)}</section>}
 {letter&&<article className="paper-card"><button onClick={()=>setSelected(null)}>← 回到寄信记录</button><h2>致 {letter.peer?.name||'尚未相识的人'}</h2><p>{labels[letter.status]} · 寄出于 {date(letter.sent_at)}</p>{letter.arrives_at&&<p>投递时间：{date(letter.arrives_at)}</p>}<PostalEnvelope wrapping={letter.wrapping} from={data.profile?.name} to={letter.peer?.name||'尚未相识的你'}/><div className="paper-letter">{letter.paragraphs.map((p,i)=><p key={i}>{p}</p>)}</div><PostalKeepsakes wrapping={letter.wrapping}/>
 <a href={'/paper?letter='+letter.id}>查看往来与朗读</a>
 {letter.status==='matching'&&<button disabled={busy} onClick={()=>manage('/letters/'+letter.id+'/withdraw','撤回这封尚未匹配的信？底稿仍会保留。')}>撤回这封信</button>}
 {route&&route.status!=='closed'&&<><button disabled={busy} onClick={()=>manage('/routes/'+route.id+'/close','结束这条邮路？历史信件保留，未送达的信将停止投递。')}>结束这条邮路</button>{!route.first_reply_used&&letter.status!=='closed'&&Date.now()-Date.parse(letter.sent_at)>=7*86400000&&<button disabled={busy} onClick={()=>manage('/letters/'+letter.id+'/repost','结束等待，把这封信重新寄给另一人？')}>重新投递</button>}</>}
 </article>}</>}
 </main>;
}
