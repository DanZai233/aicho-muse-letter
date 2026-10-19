import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { accountRequest, accountToken, enterMuse, loginFromMuse } from '../account.js';
import './account-nav.css';

function Mark({ kind }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='paper'?<><path d="M4 5h16v14H4z"/><path d="m4 6 8 7 8-7M8 16h3"/></>:kind==='muse'?<><path d="M4 19V5l8 9 8-9v14"/><path d="M8 19v-5m8 5v-5"/></>:<><path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3"/><path d="m16 16 4-4"/></>}</svg>;
}

export default function AccountNav() {
  const [user,setUser]=useState(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const location=useLocation(), paper=location.pathname==='/paper'||location.pathname.startsWith('/paper/');
  useEffect(()=>{
    let active=true;
    if(accountToken()) accountRequest('/me').then(d=>{if(active)setUser(d.user);}).catch(()=>{if(active)setUser(null);});
    else setUser(null);
    return()=>{active=false;};
  },[location.pathname]);
  if(location.pathname==='/connect')return null;
  async function connect(fn){if(pending)return;setPending(true);setError('');try{await fn();}catch(e){setError(e.message);setPending(false);}}
  return <header className="account-header">
    <nav className="account-nav" aria-label="Muse 应用切换">
      <button className="account-brand" disabled={pending} onClick={()=>connect(enterMuse)} aria-label="前往 Muse 创作">
        <span className="account-monogram"><Mark kind="muse"/></span><span>Muse<span className="account-brand-caption">灵感有处安放</span></span><span className="account-external" aria-hidden="true">↗</span>
      </button>
      <div className="account-switch" aria-label="选择信笺应用">
        <Link className={'account-destination'+(!paper?' is-active':'')} to="/" aria-current={!paper?'page':undefined}><Mark kind="letter"/><span>Letter<small>与 AI 通信</small></span></Link>
        <Link className={'account-destination'+(paper?' is-active':'')} to="/paper" aria-current={paper?'page':undefined}><Mark kind="paper"/><span>纸上逢<small>与远方相逢</small></span></Link>
      </div>
      <div className="account-session">{user?<>
        <span className="account-avatar" aria-hidden="true">{Array.from(user.display_name||'M')[0]}</span><span className="account-name" title={user.display_name}>{user.display_name}</span>
        <button className="account-signout" onClick={()=>{localStorage.removeItem('ml_muse_token');window.location.assign('/');}}>退出</button>
      </>:<button className="account-login" disabled={pending} onClick={()=>connect(()=>loginFromMuse(paper?'paper':'letter'))}><span className="account-login-dot" aria-hidden="true"/>{pending?'正在接续…':'登录 Muse'}<span className="account-login-arrow" aria-hidden="true">↗</span></button>}</div>
    </nav>
    {error&&<p className="account-error" role="alert">{error}</p>}
  </header>;
}
