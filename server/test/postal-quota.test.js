import test from 'node:test';
import assert from 'node:assert/strict';
import { claim } from '../src/postal.js';
import { match } from '../src/paper.js';
import { mailAllowance, postalDay } from '../src/postal-quota.js';
const noon=Date.parse('2026-10-19T04:00:00Z');
function office(){return {profiles:['reader','one','two','three','four'].map(id=>({id,name:id,city:'上海',language:'中文',topics:[],blocked:[],paused:false,active_at:new Date(noon).toISOString()})),routes:[],letters:['one','two','three','four'].map(id=>({id:'letter-'+id,from:id,content:'一封等待投递的匿名信',sent_at:'2026-10-17T00:00:00Z',sealed:true})),reports:[]};}
test('one anonymous letter per day, a sent reply unlocks only the second; closed routes cannot reset usage',()=>{
 const s=office();const first=claim(s,'reader',noon);assert.ok(first.id);
 assert.equal(claim(s,'reader',noon).id,first.id); // Rechecking the same envelope costs nothing.
 const l=s.letters.find(l=>l.id===first.id);l.opened_at=new Date(noon).toISOString();
 assert.equal(mailAllowance(s,'reader',noon).needs_reply,true);
 assert.equal(claim(s,'reader',noon).id,null); // Opening alone never unlocks another.
 const closed=structuredClone(s);closed.routes[0].status='closed';assert.equal(claim(closed,'reader',noon).id,null);
 s.letters.push({id:'reply-one',from:'reader',to:l.from,route_id:l.route_id,content:'已确认寄出的回信',sent_at:new Date(noon).toISOString()});
 s.routes[0].first_reply_used=true;
 assert.equal(mailAllowance(s,'reader',noon).allowed,true);
 const second=claim(s,'reader',noon);assert.ok(second.id);assert.notEqual(second.id,first.id);
 const l2=s.letters.find(l=>l.id===second.id);l2.opened_at=new Date(noon).toISOString();
 s.letters.push({id:'reply-two',from:'reader',to:l2.from,route_id:l2.route_id,sent_at:new Date(noon).toISOString()});
 s.routes[1].first_reply_used=true;
 assert.equal(mailAllowance(s,'reader',noon).received,2);assert.equal(claim(s,'reader',noon).id,null);
 // Sending to someone else or receiving ordinary pen-pal replies does not use this allowance.
 s.letters.push({id:'ordinary',from:l.from,to:'reader',route_id:l.route_id,sent_at:new Date(noon).toISOString()});
 assert.equal(mailAllowance(s,'reader',noon).received,2);
 assert.equal(postalDay('2026-10-19T15:59:59Z'),'2026-10-19');assert.equal(postalDay('2026-10-19T16:00:00Z'),'2026-10-20');
 assert.equal(mailAllowance(s,'reader',Date.parse('2026-10-19T16:00:00Z')).received,0);
 assert.ok(claim(s,'reader',Date.parse('2026-10-19T16:00:00Z')).id);
});
test('automatic matching uses the same daily allowance and does not assign a second before a reply',()=>{
 const s=office();s.profiles.filter(p=>p.id!=='reader').forEach(p=>{p.paused=true;});s.profiles.find(p=>p.id==='reader').receive_opt_in=true;
 match(s,noon);
 assert.equal(s.letters.filter(l=>l.to==='reader').length,1);
 const first=s.letters.find(l=>l.to==='reader');
 s.letters.push({id:'reply',from:'reader',to:first.from,route_id:first.route_id,sent_at:new Date(noon).toISOString()});
 match(s,noon);assert.equal(s.letters.filter(l=>l.to==='reader').length,2);
 match(s,noon);assert.equal(s.letters.filter(l=>l.to==='reader').length,2);
});
