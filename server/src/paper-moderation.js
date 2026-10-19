import {fail,delivered} from './paper.js';
import {uuid} from './db.js';
export function suspension(profile,now=Date.now()){
 const ban=profile?.suspension;
 return ban?.active&&(!ban.until||Date.parse(ban.until)>now)?ban:null;
}
export function assertPaperAccess(s,who,now=Date.now()){
 const ban=suspension(s.profiles.find(p=>p.id===who),now);
 if(ban)fail('纸上逢账号已封禁'+(ban.until?'，至 '+new Date(ban.until).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'')+'。原因：'+ban.reason,403);
}
export function audit(s,actor,action,target,reason=''){
 s.audit||=[];s.audit.push({id:uuid(),actor:String(actor||'service').slice(0,128),action,target,reason,at:new Date().toISOString()});
 if(s.audit.length>5000)s.audit.splice(0,s.audit.length-5000);
}
export function setSuspension(s,id,{active,days,reason},actor,now=Date.now()){
 const p=s.profiles.find(p=>p.id===id);if(!p)fail('纸上逢用户不存在',404);
 if(typeof active!=='boolean')fail('封禁状态无效');
 reason=String(reason||'').trim();if(reason.length<2||reason.length>500)fail('请填写 2～500 字的处理原因');
 if(active&&![0,1,3,7,30].includes(days))fail('请选择封禁时长');
 p.suspension={active,reason,until:active&&days?new Date(now+days*86400000).toISOString():null,at:new Date(now).toISOString(),actor};
 let stopped=0;
 if(active){
  for(const l of s.letters)if((l.from===id||l.to===id)&&!l.cancelled&&!delivered(l,now)){l.cancelled=true;stopped++;}
  for(const r of s.routes)if(r.members.includes(id)&&r.status!=='closed'){r.status='closed';r.closed_by_admin=true;}
 }
 audit(s,actor,active?'user_ban':'user_unban',id,reason);return {ok:true,stopped};
}
export function moderateLetter(s,id,{hidden,reason},actor,now=Date.now()){
 const l=s.letters.find(l=>l.id===id);if(!l)fail('信件不存在',404);
 reason=String(reason||'').trim();if(typeof hidden!=='boolean'||reason.length<2||reason.length>500)fail('请填写 2～500 字的处理原因');
 if(hidden===!!l.moderation?.hidden)return {ok:true};
 if(hidden){const wasDelivered=delivered(l,now);l.moderation={hidden:true,reason,at:new Date(now).toISOString(),actor,restore_delivery:wasDelivered};l.cancelled=true;}
 else {const restore=l.moderation?.restore_delivery;l.moderation={...l.moderation,hidden:false,reason,at:new Date(now).toISOString(),actor};if(restore)l.cancelled=false;}
 audit(s,actor,hidden?'letter_hide':'letter_restore',id,reason);return {ok:true};
}
