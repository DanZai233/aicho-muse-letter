import {Router} from 'express';
import crypto from 'node:crypto';
import {state,mutate,fail,delivered} from '../paper.js';
import {suspension,setSuspension,moderateLetter,audit} from '../paper-moderation.js';
import {imagePath,imageOwner} from '../paper-images.js';
const router=Router(),send=(res,data)=>res.set('Cache-Control','no-store').json({code:0,data});
const wrap=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
router.use((req,res,next)=>{
 const expected=process.env.FEEDBACK_ADMIN_TOKEN||'',actual=String(req.headers['x-admin-token']||'');
 if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(actual)||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return next(Object.assign(new Error('无权访问'),{status:403}));
 req.actor=String(req.headers['x-admin-actor']||'service').slice(0,128);res.set('Cache-Control','no-store');next();
});
function page(items,query){const number=Math.max(1,Math.floor(Number(query.page)||1)),size=30;return {list:items.slice((number-1)*size,number*size),total:items.length,page:number,page_size:size};}
function person(s,id){const p=s.profiles.find(p=>p.id===id);return {id,name:p?.name||'未知用户',city:p?.city||'',suspension:suspension(p)};}
const status=l=>l.moderation?.hidden?'hidden':l.cancelled?'closed':!l.to?'matching':delivered(l)?'delivered':'transit';
function summary(s,l){return {id:l.id,from:person(s,l.from),to:l.to?person(s,l.to):null,status:status(l),sent_at:l.sent_at,arrives_at:l.arrives_at,ai_assisted:l.ai_assisted,preview:l.content.slice(0,80),moderation:l.moderation||null};}
router.get('/stats',wrap(async(req,res)=>{const s=state();send(res,{users:s.profiles.length,banned:s.profiles.filter(p=>suspension(p)).length,letters:s.letters.length,waiting:s.letters.filter(l=>status(l)==='matching').length,transit:s.letters.filter(l=>status(l)==='transit').length,reports:s.reports.filter(r=>r.status==='pending').length,hidden:s.letters.filter(l=>l.moderation?.hidden).length});}));
router.get('/users',wrap(async(req,res)=>{
 const s=state(),q=String(req.query.q||'').trim().toLowerCase();
 const list=s.profiles.filter(p=>(!q||[p.id,p.name,p.city].some(v=>String(v||'').toLowerCase().includes(q)))&&(!req.query.status||(req.query.status==='banned'?!!suspension(p):!suspension(p)))).map(p=>({...person(s,p.id),paused:p.paused,active_at:p.active_at,sent:s.letters.filter(l=>l.from===p.id).length,received:s.letters.filter(l=>l.to===p.id).length,reports:s.reports.filter(r=>s.letters.find(l=>l.id===r.letter_id)?.from===p.id&&r.status==='pending').length,last_suspension:p.suspension||null})).sort((a,b)=>String(b.active_at||'').localeCompare(String(a.active_at||'')));
 send(res,page(list,req.query));
}));
router.post('/users/:id/suspension',wrap(async(req,res)=>send(res,await mutate(s=>setSuspension(s,req.params.id,req.body||{},req.actor)))));
router.get('/letters',wrap(async(req,res)=>{
 const s=state(),q=String(req.query.q||'').trim().toLowerCase();
 send(res,page(s.letters.filter(l=>(!req.query.user_id||l.from===req.query.user_id||l.to===req.query.user_id)&&(!req.query.status||status(l)===req.query.status)&&(!q||[l.id,l.content,l.from,l.to,s.profiles.find(p=>p.id===l.from)?.name,s.profiles.find(p=>p.id===l.to)?.name].some(x=>String(x||'').toLowerCase().includes(q)))).slice().reverse().map(l=>summary(s,l)),req.query));
}));
router.get('/letters/:id',wrap(async(req,res)=>{
 send(res,await mutate(s=>{const l=s.letters.find(l=>l.id===req.params.id);if(!l)fail('信件不存在',404);audit(s,req.actor,'letter_view',l.id);return {...summary(s,l),content:l.content,wrapping:l.wrapping,route_id:l.route_id,reader:l.reader};}));
}));
router.get('/letters/:id/image',wrap(async(req,res)=>{
 const l=state().letters.find(l=>l.id===req.params.id);if(!l?.wrapping?.image||!await imageOwner(l.wrapping.image))fail('图片不存在',404);
 await mutate(s=>{audit(s,req.actor,'image_view',l.id);});res.type('image/webp').sendFile(imagePath(l.wrapping.image));
}));
router.post('/letters/:id/moderation',wrap(async(req,res)=>send(res,await mutate(s=>moderateLetter(s,req.params.id,req.body||{},req.actor)))));
router.get('/reports',wrap(async(req,res)=>{
 const s=state(),filter=req.query.status||'pending';
 send(res,page(s.reports.filter(r=>filter==='all'||r.status===filter).slice().reverse().map(r=>{const l=s.letters.find(l=>l.id===r.letter_id);return {...r,reporter:person(s,r.reporter),sender:l?person(s,l.from):null,preview:l?.content.slice(0,80)};}),req.query));
}));
router.post('/reports/:id/resolve',wrap(async(req,res)=>send(res,await mutate(s=>{
 const r=s.reports.find(r=>r.id===req.params.id);if(!r)fail('举报不存在',404);
 const note=String(req.body?.note||'已审核').trim();if(!note||note.length>500)fail('处理备注为 1～500 字');
 r.status='reviewed';r.note=note;r.reviewed_at=new Date().toISOString();r.reviewed_by=req.actor;audit(s,req.actor,'report_resolve',r.id,note);return {ok:true};
}))));
router.get('/audit',wrap(async(req,res)=>send(res,page([...(state().audit||[])].reverse(),req.query))));
export default router;
