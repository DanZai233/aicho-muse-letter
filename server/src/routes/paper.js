import { CITY_NAMES, CITY_OPTIONS } from '../cities.js';
import { mailAllowance } from '../postal-quota.js';
import { wrapping, claim, ENVELOPES, STAMPS, PICTURES, CARDS, PLACES } from '../postal.js';
import { createRateLimiter } from '../tasks.js';
import { Router, raw } from 'express';
import { imageOwner, imagePath, storeImage } from '../paper-images.js';
import path from 'node:path';
import { DATA_DIR, uuid } from '../db.js';
import { getPersonas, assistLetter, synthesize, museAccount } from '../muse.js';
import { CITIES, state, mutate, profile, route, fail, blocked, delivered, canRead, viewLetter, match, distance, travelHours, paragraphs } from '../paper.js';
const router=Router();
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const send=(res,data)=>res.json({code:0,data});
const text=(v,max)=>String(v||'').trim().slice(0,max);
router.get('/meta',wrap(async(req,res)=>send(res,{cities:CITY_NAMES,city_options:CITY_OPTIONS,envelopes:ENVELOPES,stamps:STAMPS,pictures:PICTURES,cards:CARDS,places:PLACES})));
router.get('/admin/reports',wrap(async(req,res)=>{
 if(!process.env.FEEDBACK_ADMIN_TOKEN||req.headers['x-admin-token']!==process.env.FEEDBACK_ADMIN_TOKEN)fail('无权访问',403);
 const s=state();send(res,{list:s.reports.filter(r=>r.status==='pending').map(r=>({...r,letter:s.letters.find(l=>l.id===r.letter_id)?.content})).slice(-100)});
}));
router.post('/admin/reports/:id/resolve',wrap(async(req,res)=>{
 if(!process.env.FEEDBACK_ADMIN_TOKEN||req.headers['x-admin-token']!==process.env.FEEDBACK_ADMIN_TOKEN)fail('无权访问',403);
 send(res,await mutate(s=>{const report=s.reports.find(r=>r.id===req.params.id);if(!report)fail('举报不存在',404);report.status='reviewed';report.reviewed_at=new Date().toISOString();return {ok:true};}));
}));
router.use((req,res,next)=>{museAccount('/me',{token:String(req.headers.authorization||'').replace(/^Bearer /,'')}).then(({user})=>{req.paperId=user.id;next();}).catch(next);});
router.post('/images',createRateLimiter({limit:20,matches:()=>true}),raw({type:['image/jpeg','image/png','image/webp'],limit:'5mb'}),wrap(async(req,res)=>{
 profile(state(),req.paperId);send(res,{id:await storeImage(req.paperId,req.body)});
}));
router.get('/images/:id',wrap(async(req,res)=>{
 const owner=await imageOwner(req.params.id),s=state(),who=req.paperId;
 if(!owner||(owner!==who&&!s.letters.some(l=>l.wrapping?.image===req.params.id&&l.to===who&&canRead(s,l,who))))fail('图片不可访问',404);
 res.type('image/webp').set('Cache-Control','no-store').sendFile(imagePath(req.params.id));
}));
router.get('/',wrap(async(req,res)=>{
 const s=state(),who=req.paperId,p=s.profiles.find(p=>p.id===who);
 if(!p)return send(res,{user_id:who,profile:null,letters:[],routes:[]});
 const routes=s.routes.filter(r=>r.members.includes(who)).map(r=>{
  const peer=s.profiles.find(p=>p.id===r.members.find(x=>x!==who));
  return {id:r.id,status:r.status,peer:{name:peer?.name||'远方的朋友',city:peer?.public_city?peer.city:undefined},first_reply_used:r.first_reply_used};
 });
 send(res,{user_id:who,mail_allowance:mailAllowance(s,who),profile:{name:p.name,city:p.city,public_city:p.public_city,language:p.language,topics:p.topics,paused:p.paused,reader:p.reader},routes,
 letters:s.letters.filter(l=>(l.from===who||l.to===who)&&!(l.to===who&&blocked(s,l.from,who))).map(l=>viewLetter(s,l,who)).reverse()});
}));
router.post('/check-mail',wrap(async(req,res)=>send(res,await mutate(s=>claim(s,req.paperId)))));
router.post('/letters/:id/open',wrap(async(req,res)=>send(res,await mutate(s=>{
 const l=s.letters.find(l=>l.id===req.params.id&&l.to===req.paperId);
 if(!l||!delivered(l)||blocked(s,l.from,req.paperId))fail('信件尚未抵达或不可访问',404);
 if(!l.opened_at)l.opened_at=new Date().toISOString();return {id:l.id};
}))));
router.post('/profile',wrap(async(req,res)=>{
 const b=req.body||{},who=req.paperId;
 if(!text(b.name,30))fail('请填写笔名');
 if(b.city&&(typeof b.city!=='string'||b.city.length>60||/[<>\x00-\x1f]/.test(b.city)))fail('城市名称无效');
 send(res,await mutate(s=>{
  let p=s.profiles.find(p=>p.id===who);
  if(!p){p={id:who,blocked:[],active_at:new Date().toISOString()};s.profiles.push(p);}
  Object.assign(p,{name:text(b.name,30),city:text(b.city,60),public_city:!!b.public_city,language:['中文','English','日本語'].includes(b.language)?b.language:'中文',
   topics:Array.isArray(b.topics)?b.topics.map(t=>text(t,20)).filter(Boolean).slice(0,5):[],paused:!!b.paused,reader:text(b.reader,128),active_at:new Date().toISOString()});
  match(s);return {ok:true};
 }));
}));
router.post('/letters',wrap(async(req,res)=>{
 const b=req.body||{},who=req.paperId,content=text(b.content,3001),key=text(b.key,80);
 if(content.length<20||content.length>3000)fail('请写 20～3000 字');
 if(!key)fail('缺少寄信标识，请重试');
 const packaging=wrapping(b.wrapping);
 if(packaging.image&&await imageOwner(packaging.image)!==who)fail('请选择自己上传的明信片图片');
 const readers=b.reader?await getPersonas():[];const reader=readers.find(p=>p.id===b.reader);
 send(res,await mutate(s=>{
  const p=profile(s,who);p.active_at=new Date().toISOString();
  const existing=s.letters.find(l=>l.from===who&&l.key===key);if(existing)return {id:existing.id};
  if(s.letters.filter(l=>l.from===who&&Date.now()-Date.parse(l.sent_at)<86400000).length>=10)fail('今天已经寄了十封，歇一歇，明天再写');
  let r,to=null,instant=false,km=null;
  if(b.route_id){
   r=route(s,b.route_id,who);to=r.members.find(id=>id!==who);
   if(r.status==='closed'||blocked(s,who,to))fail('这条邮路已结束',409);
   const incoming=s.letters.filter(l=>l.route_id===r.id&&l.to===who&&canRead(s,l,who));
   if(!incoming.length)fail('等来信送达后再回信',409);
   if(s.letters.some(l=>l.route_id===r.id&&l.from===who&&!l.cancelled&&!delivered(l)))fail('你有一封信还在途中',409);
   if(!r.first_reply_used&&who!==r.initiator){instant=true;r.first_reply_used=true;r.status='replied';}
   else if(who===r.initiator&&r.first_reply_used)r.status='penpal';
   km=distance(p.city,profile(s,to).city);
  }else{
   const open=s.letters.filter(l=>l.from===who&&!l.cancelled&&(!l.route_id||s.routes.find(r=>r.id===l.route_id)?.status==='invited'));
   if(open.length>=2)fail('已有两封相遇信在等待，先等一等',409);
  }
  const now=new Date().toISOString();
  const l={id:uuid(),key,wrapping:packaging,sealed:true,opened_at:null,from:who,to,route_id:r?.id||null,content,reader:reader?{id:reader.id,name:reader.name}:null,ai_assisted:!!b.ai_assisted,
   instant,distance:km,sent_at:now,arrives_at:to?new Date(Date.now()+(instant?0:travelHours(km)*3600000)).toISOString():null};
  s.letters.push(l);match(s);return {id:l.id};
 }));
}));
router.post('/letters/:id/repost',wrap(async(req,res)=>send(res,await mutate(s=>{
 const who=req.paperId,l=s.letters.find(l=>l.id===req.params.id&&l.from===who);
 if(!l||!l.route_id)fail('信件不存在',404);const r=route(s,l.route_id,who);
 if(r.initiator!==who||r.first_reply_used||Date.now()-Date.parse(l.sent_at)<7*86400000)fail('初封信寄出七天后且未收到回信，才可重新投递',409);
 if(l.reposted)fail('这封信已经重新寄出',409);
 if(s.letters.filter(x=>x.from===who&&!x.cancelled&&(!x.route_id||s.routes.find(y=>y.id===x.route_id)?.status==='invited')).length>2)fail('请先等候已有相遇',409);
 r.status='closed';l.reposted=true;l.cancelled=true;
 const copy={...l,id:uuid(),key:uuid(),to:null,route_id:null,sent_at:new Date().toISOString(),arrives_at:null,cancelled:false,reposted:false,distance:null,opened_at:null,received_at:null};s.letters.push(copy);match(s);return {id:copy.id};
}))));
router.post('/letters/:id/withdraw',wrap(async(req,res)=>send(res,await mutate(s=>{
 const l=s.letters.find(l=>l.id===req.params.id&&l.from===req.paperId);if(!l)fail('信件不存在',404);
 if(l.to||l.cancelled)fail('只有尚未匹配的信可以撤回',409);l.cancelled=true;return {ok:true};
}))));
router.post('/routes/:id/:action',wrap(async(req,res)=>send(res,await mutate(s=>{
 const who=req.paperId,r=route(s,req.params.id,who),action=req.params.action;
 if(!['close','block','report','decline'].includes(action))fail('操作不存在',404);
 const peer=r.members.find(id=>id!==who);
 if(action==='report'){
  const l=s.letters.find(l=>l.id===req.body?.letter_id&&l.route_id===r.id&&l.to===who&&canRead(s,l,who));
  if(!l)fail('请选择已送达的来信',404);
  const reason=text(req.body.reason,500);if(!reason)fail('请填写举报原因');
  if(s.reports.some(x=>x.letter_id===l.id&&x.reporter===who))return {ok:true};
  s.reports.push({id:uuid(),letter_id:l.id,reporter:who,reason,created_at:new Date().toISOString(),status:'pending'});
 }
 r.status='closed';
 for(const l of s.letters.filter(l=>l.route_id===r.id&&!delivered(l)))l.cancelled=true;
 if(action==='block'||action==='report'){const p=profile(s,who);if(!p.blocked.includes(peer))p.blocked.push(peer);}
 return {ok:true};
}))));
router.use('/assist',createRateLimiter({limit:10,matches:req=>req.method==='POST'}));
router.post('/assist',wrap(async(req,res)=>{
 const b=req.body||{},who=req.paperId,s=state();profile(s,who);
 const intent=text(b.intent,1500),content=text(b.content,3001),mode=b.mode||'draft';
 if(!['draft','polish','continue'].includes(mode)||content.length>3000)fail('写信参数无效');
 if(mode!=='draft'&&!content)fail('请先在正文中写几句，再润色或续写');
 if(!content&&intent.length<5)fail('请先写几句想法（至少 5 字）');
 let incoming='';
 if(b.letter_id){const l=s.letters.find(l=>l.id===b.letter_id&&l.to===who);if(!l||!canRead(s,l,who))fail('来信尚未送达或不可访问',404);incoming=l.content;}
 const r=await assistLetter({mode,content,intent,tone:text(b.tone,30)||'自然',incoming,sender:profile(s,who).name});
 if(!r.text||r.text.length>3000)fail('草稿为空或过长，请重试',502);
 send(res,{text:r.text,ai_assisted:true});
}));
router.post('/preview',wrap(async(req,res)=>{
 profile(state(),req.paperId);const content=text(req.body.content,3001);if(!content||content.length>3000)fail('请输入 1～3000 字');
 const p=(await getPersonas()).find(p=>p.id===req.body.reader);if(!p?.voice_id)fail('请选择有音色的读信人');
 const parts=paragraphs(content),index=Number(req.body.index||0);if(!Number.isInteger(index)||!parts[index])fail('段落不存在');
 const result=await synthesize(parts[index],p.voice_id);if(!result.audio_url)fail('试听暂不可用，请稍后重试',502);
 // Return bytes, never the public upstream/cache URL for a private letter.
 res.type('audio/mpeg').set('Cache-Control','no-store').sendFile(path.join(DATA_DIR,'audio',path.basename(result.audio_url.split('?')[0])));
}));
router.post('/letters/:id/audio/:index',wrap(async(req,res)=>{
 const who=req.paperId,s=state(),l=s.letters.find(l=>l.id===req.params.id);if(!l||!canRead(s,l,who))fail('信件尚未送达或不可访问',404);
 const own=profile(s,who),reader=req.body.reader||own.reader||l.reader?.id;
 const p=(await getPersonas()).find(p=>p.id===reader);if(!p?.voice_id)fail('请选择一位读信人');
 const index=Number(req.params.index),parts=paragraphs(l.content);if(!Number.isInteger(index)||!parts[index])fail('段落不存在');
 const result=await synthesize(parts[index],p.voice_id);if(!result.audio_url)fail('语音暂不可用，请稍后重试',502);
 const latest=state(),current=latest.letters.find(x=>x.id===l.id);if(!current||!canRead(latest,current,who))fail('信件不可访问',404);
 res.type('audio/mpeg').set('Cache-Control','no-store').sendFile(path.join(DATA_DIR,'audio',path.basename(result.audio_url.split('?')[0])));
}));
export default router;
