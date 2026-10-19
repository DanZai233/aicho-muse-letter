import crypto from 'node:crypto';
import { db, saveDb, uuid } from './db.js';

export const CITIES = {
  '北京': [39.9,116.4], '上海': [31.2,121.5], '广州': [23.1,113.3], '深圳': [22.5,114.1],
  '杭州': [30.3,120.2], '成都': [30.6,104.1], '重庆': [29.6,106.6], '武汉': [30.6,114.3],
  '南京': [32.1,118.8], '西安': [34.3,108.9], '长沙': [28.2,112.9], '厦门': [24.5,118.1],
  '昆明': [25,102.7], '哈尔滨': [45.8,126.5], '乌鲁木齐': [43.8,87.6], '台北': [25,121.6],
  '香港': [22.3,114.2], '东京': [35.7,139.7], '新加坡': [1.4,103.8], '伦敦': [51.5,-.1],
  '巴黎': [48.9,2.4], '纽约': [40.7,-74], '悉尼': [-33.9,151.2], '洛杉矶': [34.1,-118.2],
};
export function distance(a, b) {
  if (!Object.hasOwn(CITIES,a) || !Object.hasOwn(CITIES,b)) return null;
  const [x,y]=CITIES[a], [u,v]=CITIES[b], rad=n=>n*Math.PI/180;
  const h=Math.sin(rad(u-x)/2)**2+Math.cos(rad(x))*Math.cos(rad(u))*Math.sin(rad(v-y)/2)**2;
  return Math.round(6371*2*Math.asin(Math.sqrt(Math.min(1,h))));
}
export function travelHours(km) { return km === null ? 24 : km < 500 ? 8 : km < 1500 ? 16 : km < 4000 ? 24 : 48; }
export function fail(message, status=400) { throw Object.assign(new Error(message), { status }); }
export function state() { return db().paper?.find(r=>r.id==='postoffice') || {id:'postoffice',profiles:[],routes:[],letters:[],reports:[]}; }
let queue=Promise.resolve();
// A single durable aggregate makes pairing and its first letter atomic in JSON and MySQL.
export function mutate(fn) {
  const job=queue.then(async()=>{
    const next=structuredClone(state()); const result=await fn(next);
    const previous=db().paper.findIndex(r=>r.id===next.id);
    if(previous<0) db().paper.push(next); else db().paper[previous]=next;
    await saveDb('paper',next); return result;
  });
  queue=job.catch(()=>{});return job;
}
export function profile(s,id) { const p=s.profiles.find(p=>p.id===id);if(!p)fail('请先填写寄信名片',401);return p; }
export function route(s,id,who) {
  const r=s.routes.find(r=>r.id===id && r.members.includes(who));if(!r)fail('邮路不存在',404);return r;
}
export function blocked(s,a,b) {return s.profiles.find(p=>p.id===a)?.blocked.includes(b)||s.profiles.find(p=>p.id===b)?.blocked.includes(a);}
export function delivered(l,now=Date.now()) {return !!l.to && !l.cancelled && Date.parse(l.arrives_at)<=now;}
export function canRead(s,l,who,now=Date.now()) {
  return l.from===who || (!l.cancelled && l.to===who && delivered(l,now) && !blocked(s,l.from,who));
}
export function viewLetter(s,l,who) {
  const readable=canRead(s,l,who), peer=s.profiles.find(p=>p.id===(l.from===who?l.to:l.from));
  return {id:l.id,route_id:l.route_id,own:l.from===who,peer:peer?{name:peer.name,city:peer.public_city?peer.city:undefined}:null,
    status:l.cancelled?'closed':!l.to?'matching':delivered(l)?'delivered':'transit',sent_at:l.sent_at,arrives_at:l.arrives_at,
    distance:l.distance===null?null:Math.round(l.distance/100)*100,instant:l.instant,reader:l.reader,ai_assisted:l.ai_assisted,
    ...(readable?{content:l.content,paragraphs:paragraphs(l.content)}:{})};
}
export function paragraphs(text) { return text.split(/\n\s*\n/).flatMap(p=>p.trim().match(/[\s\S]{1,600}/g)||[]).filter(Boolean); }
export function match(s,now=Date.now()) {
  for(const l of s.letters.filter(l=>!l.to&&!l.cancelled)) {
    const sender=s.profiles.find(p=>p.id===l.from);if(!sender)continue;
    const candidates=s.profiles.filter(p=>p.id!==sender.id&&!p.paused&&p.language===sender.language&&!blocked(s,sender.id,p.id)
      && s.letters.some(x=>x.from===p.id&&!x.cancelled)
      && now-Date.parse(p.active_at)<30*86400000
      && !s.routes.some(r=>r.members.includes(sender.id)&&r.members.includes(p.id))
      && s.letters.filter(x=>x.to===p.id&&!x.cancelled&&!s.letters.some(reply=>reply.route_id===x.route_id&&reply.from===p.id)).length<2);
    candidates.sort((a,b)=>b.topics.filter(t=>sender.topics.includes(t)).length-a.topics.filter(t=>sender.topics.includes(t)).length);
    const best=candidates.filter(p=>p.topics.filter(t=>sender.topics.includes(t)).length===(candidates[0]?.topics.filter(t=>sender.topics.includes(t)).length));
    const recipient=best.length?best[crypto.randomInt(best.length)]:null;if(!recipient)continue;
    l.to=recipient.id;l.distance=distance(sender.city,recipient.city);l.arrives_at=new Date(now+travelHours(l.distance)*3600000).toISOString();
    const r={id:uuid(),members:[sender.id,recipient.id],initiator:sender.id,first_reply_used:false,status:'invited',created_at:new Date(now).toISOString()};
    s.routes.push(r);l.route_id=r.id;
  }
}
