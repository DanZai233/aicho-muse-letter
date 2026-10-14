import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, createRateLimiter } from '../src/tasks.js';

test('queue bounds concurrency, rejects excess work, and recovers after rejection', async () => {
  const queue = createQueue({ concurrency: 1, capacity: 1 });
  let release;
  const first = queue(() => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const second = queue(() => { throw new Error('upstream failure'); });
  const failed = assert.rejects(second, /upstream failure/);
  await assert.rejects(queue(() => 3), /当前请求较多/);
  release(1); assert.equal(await first, 1); await failed;
  assert.equal(await queue(() => 4), 4);
});

test('expired quota buckets permit new requests and return retry metadata', () => {
  let time = 0, passed = 0, status, retry;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => time });
  const req = { method: 'POST', path: '/letters', ip: '127.0.0.1', headers: { 'x-visitor-id': 'a' } };
  const res = { set(k, v) { retry = v; }, status(s) { status = s; return this; }, json() {} };
  limiter(req, res, () => passed++); limiter(req, res, () => passed++);
  assert.equal(passed, 1); assert.equal(status, 429); assert.equal(retry, '1');
  time = 1001; limiter(req, res, () => passed++); assert.equal(passed, 2);
});

test('queue discards expired waiting work without executing it', async () => {
  const queue = createQueue({ concurrency: 1, capacity: 2, waitMs: 10 });
  let ran = false;
  const first = queue(() => new Promise(resolve => setTimeout(resolve, 30)));
  const expired = queue(() => { ran = true; });
  await assert.rejects(expired, /等待生成超时/);
  await first;
  assert.equal(ran, false);
});
