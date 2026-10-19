import { mailAllowance } from './postal-quota.js';
import crypto from 'node:crypto';
import { fail, distance, travelHours, blocked } from './paper.js';
import { uuid } from './db.js';

export const ENVELOPES=['linen','sage','rose','midnight'];
export const STAMPS=['moon','leaf','bird','star'];
export const PICTURES=['','mountains','sea','window','flowers'];
export const CARDS=['','愿你今天也有一点小小的快乐。','不必急着回信，照顾好自己。','把一阵晚风，夹在这封信里。','愿我们在平常日子里，慢慢相识。'];
export const PLACES=['晚风邮局','月亮街七号','云边小站','山海之间','春日巷口','星光码头'];
export function wrapping(input={}) {
 if(!input||typeof input!=='object'||Array.isArray(input))fail('信封附件选项无效');
 const pick=(key,values,fallback)=>{if(input[key]!==undefined&&!values.includes(input[key]))fail('信封附件选项无效');return input[key]??fallback;};
 if(input.image&&!/^[0-9a-f-]{36}$/.test(input.image))fail('图片标识无效');
 return {...(input.image?{image:input.image}:{}),envelope:pick('envelope',ENVELOPES,'linen'),stamp:pick('stamp',STAMPS,'moon'),picture:pick('picture',PICTURES,''),card:pick('card',CARDS,''),
  place:pick('place',PLACES,PLACES[crypto.randomInt(PLACES.length)]),postcode:/^\d{6}$/.test(input.postcode||'')?input.postcode:String(crypto.randomInt(1000000)).padStart(6,'0')};
}
export function availableFor(s,l,who,now=Date.now()) {
 const p=s.profiles.find(p=>p.id===who),sender=s.profiles.find(p=>p.id===l.from);
 return p&&sender&&!l.to&&!l.cancelled&&l.from!==who&&!p.paused&&p.language===sender.language&&!blocked(s,l.from,who)
  &&!s.routes.some(r=>r.members.includes(l.from)&&r.members.includes(who));
}
export function claim(s,who,now=Date.now()) {
 const p=s.profiles.find(p=>p.id===who);
 if(!p)fail('请先填写寄信名片',409);
 p.active_at=new Date(now).toISOString();p.receive_opt_in=true;
 const existing=s.letters.find(l=>l.to===who&&!l.cancelled&&!l.opened_at&&l.sealed&&!blocked(s,l.from,who));
 if(existing)return {id:existing.id,already_waiting:true};
 const allowance=mailAllowance(s,who,now);
 if(!allowance.allowed)return {id:null,reason:allowance.reason};
 if(p.paused)fail('请先在寄信名片中恢复随机来信',409);
 const outstanding=s.routes.filter(r=>r.members.includes(who)&&r.initiator!==who&&r.status!=='closed'&&!r.first_reply_used);
 if(outstanding.length>=2)return {id:null,reason:'先给已有的相遇回一封信，再迎接新朋友吧。'};
 const candidates=s.letters.filter(l=>availableFor(s,l,who,now));
 candidates.sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at));
 const pool=candidates.slice(0,10),l=pool.length?pool[crypto.randomInt(pool.length)]:null;
 if(!l)return {id:null,reason:'邮筒里暂时没有合适的来信。你可以先写一封，也可以过会儿再来。'};
 const sender=s.profiles.find(p=>p.id===l.from);l.to=who;l.distance=distance(sender.city,p.city);
 // The time spent waiting in the post office is part of the initial journey.
 l.arrives_at=new Date(Math.max(now,Date.parse(l.sent_at)+travelHours(l.distance)*3600000)).toISOString();l.sealed=true;l.received_at=new Date(now).toISOString();
 const r={id:uuid(),initial_letter_id:l.id,members:[l.from,who],initiator:l.from,first_reply_used:false,status:'invited',created_at:new Date(now).toISOString()};
 s.routes.push(r);l.route_id=r.id;return {id:l.id,already_waiting:false};
}
