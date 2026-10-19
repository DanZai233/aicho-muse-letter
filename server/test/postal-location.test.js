import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCity } from '../../web/src/postal-location.js';
test('IP city lookup falls back after provider failure, preserves unlisted cities and returns a readable offline message',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const calls=[];globalThis.fetch=async url=>{calls.push(url);return calls.length===1?{ok:false}:{ok:true,json:async()=>({city:'Hangzhou'})};};
 assert.equal(await suggestCity([],new AbortController().signal),'杭州');assert.equal(calls.length,2);
 globalThis.fetch=async()=>({ok:true,json:async()=>({city:'Dali'})});assert.equal(await suggestCity([],new AbortController().signal),'Dali');
 globalThis.fetch=async()=>({ok:true,json:async()=>({city:'Suzhou'})});assert.equal(await suggestCity([{value:'苏州',romanized:'suzhou'}],new AbortController().signal),'苏州');
 globalThis.fetch=async()=>{throw new Error('Failed to fetch');};await assert.rejects(suggestCity([],new AbortController().signal),/手动选择/);
});
