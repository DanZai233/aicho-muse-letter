import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
import { distance, travelHours, match, viewLetter } from '../src/paper.js';
const content='今天走在城市的小路上，遇见一只很可爱的猫，想把这件小事写给远方的你。';
function seed(){
 const now=new Date().toISOString(),past=new Date(Date.now()-86400000).toISOString();
 return [{id:'postoffice',profiles:['a','b','c'].map((id,i)=>({id:'test-user-'+id,name:id,city:i?'上海':'北京',topics:[],language:'中文',paused:false,blocked:[],active_at:now,reader:''})),
 routes:[{id:'first',members:['test-user-a','test-user-b'],initiator:'test-user-a',status:'invited',first_reply_used:false}],
 letters:[{id:'initial',from:'test-user-a',to:'test-user-b',route_id:'first',content,reader:{id:'preset-elysia',name:'爱莉希雅'},sent_at:past,arrives_at:past,distance:1000}],reports:[]}];
}
test('postal distance bands and server projections hide undelivered text',()=>{
 assert.equal(distance('上海','上海'),0);assert.equal(distance('','北京'),null);assert.ok(distance('北京','上海')>1000);
 assert.deepEqual([null,0,499,500,1499,1500,3999,4000].map(travelHours),[24,8,8,16,16,24,24,48]);
 const s=seed()[0],l={...s.letters[0],arrives_at:new Date(Date.now()+100000).toISOString()};
 assert.equal(viewLetter(s,l,'test-user-b').content,undefined);assert.equal(viewLetter(s,l,'test-user-a').content,content);
 // Reading preference and city do not expose coordinates or identity credentials.
 assert.equal(viewLetter(s,l,'test-user-b').peer.city,undefined);
});
test('random match excludes paused, unwritten and previously paired people',()=>{
 const s=seed()[0];s.routes=[];s.letters=[{id:'waiting',from:'test-user-a',content,sent_at:new Date().toISOString()}];
 match(s);assert.equal(s.letters[0].to,undefined);
 s.letters.push({id:'b-wait',from:'test-user-b',content,sent_at:new Date().toISOString()});s.profiles[1].paused=true;s.profiles[0].paused=true;
 match(s);assert.equal(s.letters[0].to,undefined);s.profiles[1].paused=false;s.profiles[0].paused=false;match(s);
 assert.equal(s.letters[0].to,'test-user-b');assert.equal(s.routes.length,1);assert.ok(Date.parse(s.letters[0].arrives_at)>Date.now());
 match(s);assert.equal(s.routes.length,1);
});
test('account auth, first instant reply, idempotency, in-transit secrecy, AI and TTS access, blocking',async t=>{
 const app=await fixture({paper:seed()});t.after(()=>app.close());
 async function req(path,{who='a',method='GET',body}={}){const r=await fetch(app.url+'/api/v1/paper'+path,{method,headers:{'Content-Type':'application/json',...(who?{Authorization:'Bearer test-user-'+who}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 assert.equal((await req('',{who:null})).status,401);
 assert.equal((await req('')).data.profile.name,'a');
 const reply={route_id:'first',content,reader:'preset-elysia',key:'reply-once'};
 const [a,b]=await Promise.all([req('/letters',{who:'b',method:'POST',body:reply}),req('/letters',{who:'b',method:'POST',body:reply})]);assert.equal(a.data.id,b.data.id);
 let mailbox=(await req('')).data;const instant=mailbox.letters.find(l=>l.id===a.data.id);assert.equal(instant.status,'delivered');assert.equal(instant.instant,true);
 const follow=await req('/letters',{method:'POST',body:{...reply,key:'follow'}});assert.equal(follow.status,200);
 mailbox=(await req('',{who:'b'})).data;const transit=mailbox.letters.find(l=>l.id===follow.data.id);assert.equal(transit.status,'transit');assert.equal(transit.content,undefined);assert.equal(transit.paragraphs,undefined);
 assert.equal((await req('/letters',{method:'POST',body:{...reply,key:'too-soon'}})).status,409);
 assert.equal((await req(`/letters/${follow.data.id}/audio/0`,{who:'b',method:'POST',body:{reader:'preset-elysia'}})).status,404);
 assert.equal((await req('/assist',{who:'b',method:'POST',body:{letter_id:follow.data.id,intent:'我想回应这封来信'}})).status,404);
 assert.equal((await req('/assist',{who:'c',method:'POST',body:{letter_id:'initial',intent:'我想回应这封来信'}})).status,404);
 const assist=await req('/assist',{who:'b',method:'POST',body:{letter_id:'initial',intent:'谢谢你的来信，我也想分享最近的小事'}});assert.equal(assist.status,200);assert.ok(assist.data.text);
 const audio=await fetch(app.url+'/api/v1/paper/letters/initial/audio/0',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-b'},body:JSON.stringify({reader:'preset-elysia'})});assert.equal(audio.status,200);assert.match(audio.headers.get('content-type'),/audio/);assert.equal(audio.headers.get('cache-control'),'no-store');
 assert.equal((await req('/routes/first/block',{who:'c',method:'POST',body:{}})).status,404);
 assert.equal((await req('/routes/first/block',{who:'b',method:'POST',body:{}})).status,200);
 assert.equal((await req('',{who:'b'})).data.letters.some(l=>l.id==='initial'),false);
 assert.equal((await req('/letters',{method:'POST',body:{...reply,key:'after-block'}})).status,409);
 assert.equal((await req('/letters/initial/audio/0',{who:'b',method:'POST',body:{reader:'preset-elysia'}})).status,404);
});

test('Muse AI mailbox stays with the account and rejects anonymous account impersonation',async t=>{
 const app=await fixture();t.after(()=>app.close());
 const call=async(path,{token='test-user-a',visitor='browser-one',body}={})=>{
  const r=await fetch(app.url+'/api/v1'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Visitor-Id':visitor,...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};
 };
 const created=await call('/letters',{body:{persona_id:'preset-elysia',pen_name:'测试',letter_content:content}});
 assert.equal(created.status,200);
 const box=await call('/letters',{visitor:'browser-two'});assert.equal(box.data.total,1);
 assert.equal((await call('/letters',{token:'test-user-b'})).data.total,0);
 const impostor=await call('/letters',{token:'',visitor:'muse:test-user-a'});assert.equal(impostor.data.total,0);assert.equal((await call('/letters/'+created.data.id,{token:'',visitor:'muse:test-user-a'})).status,404);
 const old=await call('/letters?legacy=1',{visitor:'test-visitor'});assert.equal(old.data.total,24);
});

test('unmatched withdrawal, seven-day repost and report authorization preserve postal boundaries',async t=>{
 const initial=seed();initial[0].letters[0].sent_at=new Date(Date.now()-8*86400000).toISOString();
 const app=await fixture({paper:initial});t.after(()=>app.close());
 const call=async(path,who='a',body)=>{const r=await fetch(app.url+'/api/v1/paper'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-'+who},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 assert.equal((await call('/letters/initial/repost','b',{})).status,404);
 const repost=await call('/letters/initial/repost','a',{});assert.equal(repost.status,200);
 const box=(await call('')).data;assert.equal(box.routes[0].status,'closed');assert.equal(box.letters.find(l=>l.id===repost.data.id).status,'matching');
 assert.equal((await call('/letters/initial/repost','a',{})).status,409);
 assert.equal((await call('/letters/'+repost.data.id+'/withdraw','a',{})).status,200);
 assert.equal((await call('/routes/first/report','c',{letter_id:'initial',reason:'测试'})).status,404);
 // Reposting cancels the original invitation, so its recipient cannot read/report it.
 assert.equal((await call('/routes/first/report','b',{letter_id:'initial',reason:'测试'})).status,404);
});
