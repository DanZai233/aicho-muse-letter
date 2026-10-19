export const MUSE_URL=import.meta.env.VITE_MUSE_URL||'https://imuse.chat';
export async function challenge(verifier){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),n=>n.toString(16).padStart(2,'0')).join('');}
export function accountToken(){return localStorage.getItem('ml_muse_token')||'';}
export async function accountRequest(path,body){
 const r=await fetch('/api/v1/account'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accountToken()},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw new Error(d.message||'账号服务暂不可用');return d.data;
}
export async function enterMuse(){ window.location.href=accountToken()?MUSE_URL+'/connect?target=muse':MUSE_URL; }
export async function loginFromMuse(target='paper'){
 const verifier=crypto.randomUUID()+crypto.randomUUID();sessionStorage.setItem('ml_bridge_verifier',verifier);
 window.location.href=MUSE_URL+'/connect?target='+target+'&challenge='+await challenge(verifier);
}
