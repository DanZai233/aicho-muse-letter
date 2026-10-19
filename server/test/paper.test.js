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
 let mailbox=(await req('')).data;const instant=mailbox.letters.find(l=>l.id===a.data.id);assert.equal(instant.status,'delivered');assert.equal(instant.instant,true);assert.equal(instant.content,undefined);
 assert.equal((await req(`/letters/${a.data.id}/open`,{method:'POST',body:{}})).status,200);
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

test('first-time recipients claim one queued letter atomically, keep packaging and explicitly open after delivery',async t=>{
 const s=seed()[0];s.routes=[];s.letters=[{id:'queued',from:'test-user-a',content,key:'queued',sent_at:new Date(Date.now()-3*86400000).toISOString(),wrapping:{envelope:'rose',stamp:'bird',place:'云边小站',postcode:'000123',picture:'sea',card:'不必急着回信，照顾好自己。'},sealed:true}];
 const app=await fixture({paper:[s]});t.after(()=>app.close());
 const call=async(path,who='b',body)=>{const r=await fetch(app.url+'/api/v1/paper'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-'+who},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 const results=await Promise.all([call('/check-mail','b',{}),call('/check-mail','c',{})]);
 const winner=results.findIndex(r=>r.data.id==='queued');assert.ok(winner>=0);assert.equal(results.filter(r=>r.data.id==='queued').length,1);
 const who=winner===0?'b':'c',other=who==='b'?'c':'b';
 const sealed=(await call('',who)).data.letters.find(l=>l.id==='queued');
 assert.equal(sealed.status,'delivered');assert.equal(sealed.content,undefined);assert.equal(sealed.wrapping.envelope,'rose');assert.equal(sealed.wrapping.postcode,'000123');assert.equal(sealed.wrapping.picture,undefined);assert.equal(sealed.opened,false);
 assert.equal((await call('/letters/queued/audio/0',who,{reader:'preset-elysia'})).status,404);
 assert.equal((await call('/assist',who,{letter_id:'queued',intent:'我想回一封信给你'})).status,404);
 assert.equal((await call('/letters/queued/open',other,{})).status,404);
 assert.equal((await call('/check-mail',who,{})).data.id,'queued');
 assert.equal((await call('/letters/queued/open',who,{})).status,200);
 const opened=(await call('',who)).data.letters.find(l=>l.id==='queued');assert.equal(opened.content,content);assert.equal(opened.wrapping.picture,'sea');assert.equal(opened.wrapping.card,s.letters[0].wrapping.card);
 const sender=(await call('','a')).data.letters.find(l=>l.id==='queued');assert.equal(sender.opened,undefined);
 assert.equal((await call('/check-mail',who,{})).data.id,null);
});

test('new packaging is durable and cannot bypass city travel or sealed access',async t=>{
 const s=seed()[0];s.routes=[];s.letters=[];
 const app=await fixture({paper:[s]});t.after(()=>app.close());
 const call=async(path,who,body)=>{const r=await fetch(app.url+'/api/v1/paper'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-'+who},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 assert.equal((await call('/letters','a',{content,key:'invalid',wrapping:{picture:'https://untrusted.test/x'}})).status,400);
 const pack={envelope:'midnight',stamp:'star',place:'月亮街七号',postcode:'000001',picture:'flowers',card:'愿你今天也有一点小小的快乐。'};
 const sent=await call('/letters','a',{content,key:'decorated',wrapping:pack});assert.equal(sent.status,200);
 const picked=await call('/check-mail','b',{});assert.equal(picked.data.id,sent.data.id);
 const incoming=(await call('','b')).data.letters[0];assert.equal(incoming.status,'transit');assert.equal(incoming.content,undefined);assert.equal(incoming.wrapping.picture,undefined);
 assert.equal((await call('/letters/'+sent.data.id+'/open','b',{})).status,404);
 const sender=(await call('','a')).data.letters[0];assert.deepEqual(sender.wrapping,pack);
 const {readFile}=await import('node:fs/promises');const stored=JSON.parse(await readFile(app.dataDir+'/letters.json','utf8')).paper[0].letters[0];assert.deepEqual(stored.wrapping,pack);assert.equal(stored.to,'test-user-b');
});

test('checking an empty mailbox opts a new reader into future matching without requiring an outgoing letter',async t=>{
 const s=seed()[0];s.routes=[];s.letters=[];const app=await fixture({paper:[s]});t.after(()=>app.close());
 const call=async(path,who,body)=>{const r=await fetch(app.url+'/api/v1/paper'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-'+who},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 assert.equal((await call('/check-mail','b',{})).data.id,null);
 assert.equal((await call('/letters','a',{content,key:'bad',wrapping:null})).status,400);
 const sent=await call('/letters','a',{content,key:'future'});assert.equal(sent.status,200);
 const inbox=(await call('','b')).data;assert.equal(inbox.letters.length,1);assert.equal(inbox.letters[0].id,sent.data.id);assert.equal(inbox.letters[0].sealed,true);assert.equal(inbox.letters[0].content,undefined);
 assert.equal((await call('/check-mail','b',{})).data.id,sent.data.id);
 assert.equal((await call('','b')).data.routes.length,1);
});

test('concurrent mailbox checks cannot claim a second daily letter until the first receives a sent reply',async t=>{
 const s=seed()[0];s.routes=[];s.letters=['a','c'].map(id=>({id:'daily-'+id,from:'test-user-'+id,content,key:'daily-'+id,sealed:true,sent_at:new Date(Date.now()-3*86400000).toISOString()}));
 const app=await fixture({paper:[s]});t.after(()=>app.close());
 const call=async(path,body)=>{const r=await fetch(app.url+'/api/v1/paper'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer test-user-b'},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};};
 const [a,b]=await Promise.all([call('/check-mail',{}),call('/check-mail',{})]);assert.equal(a.data.id,b.data.id);
 await call('/letters/'+a.data.id+'/open',{});
 const denied=await call('/check-mail',{});assert.equal(denied.data.id,null);assert.match(denied.data.reason,/回复/);
 let inbox=(await call('')).data;assert.equal(inbox.mail_allowance.received,1);assert.equal(inbox.mail_allowance.needs_reply,true);
 const initial=inbox.letters.find(l=>l.id===a.data.id);
 const reply=await call('/letters',{route_id:initial.route_id,content,key:'quota-first-reply'});assert.equal(reply.status,200);
 const picked=await call('/check-mail',{});assert.ok(picked.data.id);assert.notEqual(picked.data.id,initial.id);
 inbox=(await call('')).data;assert.equal(inbox.mail_allowance.received,2);assert.equal(inbox.mail_allowance.allowed,false);
 const second=inbox.letters.find(l=>l.id===picked.data.id);await call('/routes/'+second.route_id+'/close',{});assert.match((await call('/check-mail',{})).data.reason,/两封/);
});
