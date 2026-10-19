import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './fixture.js';
import {setSuspension,suspension,moderateLetter} from '../src/paper-moderation.js';
import {match,canRead} from '../src/paper.js';
import {claim} from '../src/postal.js';
const content='这是测试中的虚构书信，用于验证管理员处理后不再继续投递。';
function seed(){const past=new Date(Date.now()-86400000).toISOString(),now=new Date().toISOString();return {id:'postoffice',profiles:['a','b','c'].map(n=>({id:'test-user-'+n,name:'用户'+n,language:'中文',city:'上海',blocked:[],topics:[],active_at:now,receive_opt_in:true})),routes:[{id:'r',members:['test-user-a','test-user-b'],initiator:'test-user-a',status:'penpal',first_reply_used:true,created_at:past}],letters:[{id:'history',from:'test-user-a',to:'test-user-b',route_id:'r',content,sent_at:past,arrives_at:past,sealed:true,opened_at:past},{id:'pending',from:'test-user-a',to:'test-user-b',route_id:'r',content,sent_at:now,arrives_at:new Date(Date.now()+86400000).toISOString()},{id:'waiting',from:'test-user-a',content,sent_at:now}],reports:[{id:'report',letter_id:'history',reporter:'test-user-b',reason:'测试举报原因',created_at:past,status:'pending'}]};}
test('paper ban expires, excludes both matching roles, closes routes and never revives stopped letters',()=>{
 const s=seed(),now=Date.now();setSuspension(s,'test-user-a',{active:true,days:1,reason:'测试不友好行为'},'moderator',now);
 assert.ok(suspension(s.profiles[0],now));assert.equal(suspension(s.profiles[0],now+86400001),null);
 assert.ok(s.letters.find(l=>l.id==='waiting').cancelled);assert.ok(s.letters.find(l=>l.id==='pending').cancelled);assert.equal(s.routes[0].status,'closed');assert.equal(s.letters[0].cancelled,undefined);
 assert.throws(()=>claim(s,'test-user-a',now),/封禁/);assert.equal(canRead(s,s.letters[0],'test-user-a'),false);
 // Even a queued task or stale record cannot match a banned sender or receiver.
 s.letters.push({id:'stale',from:'test-user-a',content,sent_at:new Date().toISOString()});match(s,now);assert.equal(s.letters.at(-1).to,undefined);
 const copy=seed();setSuspension(copy,'test-user-b',{active:true,days:0,reason:'测试封禁接收方'},'moderator');copy.profiles[2].paused=true;copy.routes=[];match(copy);assert.equal(copy.letters.find(l=>l.id==='waiting').to,undefined);
 setSuspension(s,'test-user-a',{active:false,reason:'复核后解除限制'},'moderator');assert.equal(suspension(s.profiles[0]),null);assert.equal(s.letters[1].cancelled,true);assert.equal(s.audit.at(-1).action,'user_unban');
 const pending=seed();moderateLetter(pending,'pending',{hidden:true,reason:'测试屏蔽待投递信'},'moderator');moderateLetter(pending,'pending',{hidden:false,reason:'复核恢复展示'},'moderator');assert.equal(pending.letters[1].cancelled,true);
});
test('admin auth, review audit, letter hiding, reports and bans persist and enforce valid existing user tokens',async t=>{
 const app=await fixture({paper:[seed()]});t.after(()=>app.close());
 async function admin(path,body,token='test-admin-token'){const r=await fetch(app.url+'/api/v1/paper/admin'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Admin-Token':token,'X-Admin-Actor':'moderator-test'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 async function user(path='',body,who='b'){const r=await fetch(app.url+'/api/v1/paper'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-'+who},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 assert.equal((await admin('/users',undefined,'')).status,403);assert.equal((await user('/admin/users')).status,403);
 assert.equal((await admin('/stats')).data.reports,1);assert.equal((await admin('/users?q=用户a')).data.total,1);
 assert.equal((await admin('/letters/history')).data.content,content);assert.equal((await admin('/audit')).data.list[0].action,'letter_view');
 assert.equal((await admin('/letters/history/moderation',{hidden:true,reason:'测试屏蔽'})).status,200);
 assert.equal((await user()).data.letters.find(l=>l.id==='history').content,undefined);
 assert.equal((await user('/letters/history/open',{})).status,404);
 assert.equal((await user('/assist',{letter_id:'history',intent:'想回应这封来信'})).status,404);
 const audio=await fetch(app.url+'/api/v1/paper/letters/history/audio/0',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-b'},body:JSON.stringify({reader:'preset-elysia'})});assert.equal(audio.status,404);
 await admin('/letters/history/moderation',{hidden:false,reason:'复核恢复展示'});assert.equal((await user()).data.letters.find(l=>l.id==='history').content,content);
 assert.equal((await admin('/reports/report/resolve',{note:'已审查并采取处理'})).status,200);assert.equal((await admin('/reports')).data.total,0);assert.equal((await admin('/reports?status=reviewed')).data.list[0].note,'已审查并采取处理');
 assert.equal((await admin('/users/test-user-a/suspension',{active:true,days:7,reason:''})).status,400);
 assert.equal((await admin('/users/test-user-a/suspension',{active:true,days:7,reason:'多次骚扰，测试封禁'})).status,200);
 for(const [path,body] of [['',undefined],['/profile',{name:'绕过封禁'}],['/check-mail',{}],['/letters',{content,key:'blocked'}],['/assist',{intent:'绕过封禁写信'}]])assert.equal((await user(path,body,'a')).status,403,path);
 const stored=JSON.parse(await readFile(app.dataDir+'/letters.json','utf8')).paper[0];assert.equal(stored.profiles[0].suspension.active,true);assert.equal(stored.audit.at(-1).actor,'moderator-test');assert.equal(stored.letters.find(l=>l.id==='waiting').cancelled,true);
 await admin('/users/test-user-a/suspension',{active:false,reason:'复核后恢复用户'});assert.equal((await user('',undefined,'a')).status,200);
 assert.equal((await admin('/letters?status=closed')).data.list.some(l=>l.id==='pending'),true);
});
