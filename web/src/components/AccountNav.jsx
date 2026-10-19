import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { accountRequest, accountToken, enterMuse, loginFromMuse } from '../account.js';
export default function AccountNav(){
 const [user,setUser]=useState(null),[error,setError]=useState('');const location=useLocation();
 useEffect(()=>{let active=true;if(accountToken())accountRequest('/me').then(d=>active&&setUser(d.user)).catch(()=>active&&setUser(null));return()=>{active=false;};},[location.pathname]);
 if(location.pathname==='/connect')return null;
 return <nav aria-label="Muse 应用切换" style={{display:'flex',justifyContent:'center',alignItems:'center',flexWrap:'wrap',gap:18,padding:'12px 18px',fontSize:13,borderBottom:'1px solid #dbd2c4'}}>
 <button style={{background:'none',border:0,color:'inherit',cursor:'pointer',padding:8}} onClick={()=>enterMuse().catch(e=>setError(e.message))}>Muse 创作 ↗</button><Link to="/">Letter · AI 来信</Link><Link to="/paper">纸上逢 · 真人笔友</Link>
 {user?<><span>{user.display_name}</span><button onClick={()=>{localStorage.removeItem('ml_muse_token');window.location.assign('/');}}>退出</button></>:<button onClick={()=>loginFromMuse(location.pathname==='/paper'?'paper':'letter').catch(e=>setError(e.message))}>Muse 账号登录</button>}{error&&<span role="alert">{error}</span>}
 </nav>;
}
