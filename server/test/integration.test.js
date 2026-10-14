import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from './fixture.js';

async function waitFor(fn) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await delay(20); }
  throw new Error('Timed out waiting for fixture');
}

test('mailbox, sharing, generation races and conversation isolation', async t => {
  const app = await fixture(); t.after(() => app.close());
  const { request, state } = app;
  const mailbox = await request('/letters?page=1&page_size=20');
  assert.equal(mailbox.data.total, 24); assert.equal(mailbox.data.list.length, 20);
  assert.equal((await request('/letters?page=2&page_size=20')).data.list.length, 4);
  assert.equal((await request('/letters?persona=other')).data.total, 1);
  assert.equal((await request('/letters', { visitor: 'another-visitor' })).data.total, 0);
  assert.equal((await request('/letters/seed-0', { visitor: 'another-visitor' })).status, 404);
  const share = await request('/letters/seed-0/share', { method: 'POST' });
  const token = share.data.share_token;
  assert.equal((await request('/letters/seed-0')).data.letter.share_token, token);
  assert.equal((await request('/share/' + token)).data.letter.share_token, undefined);
  // Owner and share requests must join the same upstream synthesis.
  state.hold = true;
  const a = request('/letters/seed-0/audio/0', { method: 'POST' });
  await waitFor(() => state.release);
  const b = request('/share/' + token + '/audio/0', { method: 'POST' });
  await delay(30); assert.equal(state.tts, 1);
  state.hold = false; state.release(); state.release = null;
  assert.equal((await a).data.audio_url, (await b).data.audio_url);
  // A late TTS result must not replace a regenerated paragraph.
  state.hold = true;
  const old = request('/letters/seed-0/audio/1', { method: 'POST' });
  await waitFor(() => state.release);
  assert.equal((await request('/letters/seed-0/regen', { method: 'POST' })).status, 200);
  await waitFor(async () => (await request('/letters/seed-0')).data.letter.status === 'done');
  state.hold = false; state.release(); state.release = null;
  assert.equal((await old).status, 409);
  assert.equal((await request('/letters/seed-0')).data.letter.reply[1].audio_url, null);
  assert.equal((await request('/letters/seed-0/audio/-1', { method: 'POST' })).status, 400);
  await request('/letters/seed-0/share', { method: 'DELETE' });
  assert.equal((await request('/share/' + token)).status, 404);
  async function send(body) {
    const result = await request('/letters', { method: 'POST', body: { persona_id: 'preset-elysia', letter_content: '这是一封新的测试来信。', ...body } });
    assert.equal(result.status, 200);
    await waitFor(async () => (await request('/letters/' + result.data.id)).data.letter.status === 'done');
    return (await request('/letters/' + result.data.id)).data.letter;
  }
  const topic = await send({ new_topic: true });
  assert.equal(state.replies.at(-1).history.length, 0);
  await send({ thread_id: topic.thread_id });
  assert.equal(state.replies.at(-1).history.length, 2);
  await send({});
  assert.equal(state.replies.at(-1).history.length, 6);
  const file = JSON.parse(await readFile(path.join(app.dataDir, 'letters.json'), 'utf8'));
  assert.equal(file.letters.find(l => l.id === 'seed-0').share_token, null);
  const generated = file.letters.find(l => l.id === topic.id);
  assert.equal(generated.status, 'done');
  await request('/letters/' + topic.id, { method: 'DELETE' });
  assert.equal((await request('/letters/' + topic.id)).status, 404);
  const after = JSON.parse(await readFile(path.join(app.dataDir, 'letters.json'), 'utf8'));
  assert.ok(!after.letters.some(l => l.id === topic.id));
});

test('server enforces anonymous operation quotas', async t => {
  const app = await fixture({ limit: 2 }); t.after(() => app.close());
  const options = { method: 'POST', body: { content: '测试反馈' } };
  assert.equal((await app.request('/feedback', options)).status, 200);
  assert.equal((await app.request('/feedback', options)).status, 200);
  assert.equal((await app.request('/feedback', options)).status, 429);
  // Changing visitor IDs cannot bypass the IP quota.
  assert.equal((await app.request('/feedback', { ...options, visitor: 'new-id' })).status, 429);
});
