import { useEffect, useRef, useState } from 'react';
import { accountRequest, challenge, MUSE_URL } from '../account.js';
export default function ConnectPage(){
 const [error,setError]=useState(''),started=useRef(false);
 useEffect(()=>{if(started.current)return;started.current=true;(async()=>{
  const params=new URLSearchParams(location.search),code=params.get('code'),target=params.get('target');
  if(code){
   const verifier=sessionStorage.getItem('ml_bridge_verifier')||'';
   history.replaceState(null,'','/connect');
   const d=await accountRequest('/exchange',{code,verifier,target});
   sessionStorage.removeItem('ml_bridge_verifier');localStorage.setItem('ml_muse_token',d.token);
   location.replace(target==='paper'?'/paper':'/');
  }else if(['paper','letter'].includes(target)){
   const verifier=crypto.randomUUID()+crypto.randomUUID();sessionStorage.setItem('ml_bridge_verifier',verifier);
   location.replace(MUSE_URL+'/connect?target='+target+'&challenge='+await challenge(verifier));
  }else if(target==='muse'&&/^[a-f0-9]{64}$/.test(params.get('challenge')||'')){
   const d=await accountRequest('/bridge',{challenge:params.get('challenge')});location.replace(d.url);
  }else throw new Error('登录接续已失效，请从入口重新进入');
 })().catch(e=>setError(e.message));},[]);
 return <main style={{maxWidth:500,margin:'15vh auto',padding:24}}><h1>正在接续你的 Muse 账号</h1><p>{error||'一本书、一封信，都属于同一个你。'}</p>{error&&<a href="/paper">回到纸上逢</a>}</main>;
}
