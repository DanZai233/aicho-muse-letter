import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export async function fixture({ limit = 1000, paper = [] } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'muse-letter-test-'));
  const persona = { id: 'preset-elysia', name: '爱莉希雅', voice_id: 'test-voice', avatar_color: '#8b7d6b' };
  const letters = Array.from({ length: 24 }, (_, i) => ({
    id: `seed-${i}`, visitor_id: 'test-visitor', persona: i === 23 ? { ...persona, id: 'other', name: '另一位朋友' } : persona,
    pen_name: '测试笔名', letter_content: `测试来信 ${i}，今天的心情很好。`,
    status: 'done', reply_version: 1, thread_id: null, signature: '测试回信',
    reply: [{ text: `第 ${i} 封回信的第一段` }, { text: `第 ${i} 封回信的第二段` }],
    created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  await writeFile(path.join(dataDir, 'letters.json'), JSON.stringify({ letters, feedbacks: [], paper }));
  const state = { replies: [], assists: [], tts: 0, release: null, hold: false };
  const wav = Buffer.alloc(44 + 8000);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(8000, 40);
  const upstream = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    const reply = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: 0, data })); };
    if(req.url==='/me'){const token=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^test-user-[abc]$/.test(token)){res.statusCode=401;return res.end(JSON.stringify({code:40101,message:'未登录'}));}return reply({user:{id:token,display_name:token}});}
    if (req.url === '/personas') return reply({ list: [persona, { ...persona, id: 'other', name: '另一位朋友' }] });
    if(req.url==='/write-assist'){state.assists.push(input);return reply({text:'远方的朋友：\n'+(input.content||input.intent)+'\n愿你安好。'});}
    if (req.url === '/reply') {
      state.replies.push(input);
      return reply({ paragraphs: [`回信 ${state.replies.length} 的第一段`, `回信 ${state.replies.length} 的第二段`], signature: '爱莉希雅' });
    }
    if (req.url === '/tts') {
      state.tts++;
      if (state.hold) await new Promise(resolve => { state.release = resolve; });
      return reply({ audio_url: `http://127.0.0.1:${upstream.address().port}/sample.wav` });
    }
    if (req.url === '/sample.wav') { res.setHeader('Content-Type', 'audio/wav'); return res.end(wav); }
    if (req.url.startsWith('/library/search')) return reply({ list: [{ id: 'test-voice', title: '测试音色' }] });
    if (req.url === '/polish') return reply({ text: input.text + ' 愿你一切都好。' });
    res.writeHead(404).end();
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const reservation = http.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const env = { ...process.env, DATA_DIR: dataDir, PORT: String(port), MUSE_BASE_URL: `http://127.0.0.1:${upstream.address().port}`, REQUESTS_PER_HOUR: String(limit) };
  for (const key of ['MYSQL_HOST', 'DB_HOST']) delete env[key];
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; child.stdout.on('data', x => { logs += x; }); child.stderr.on('data', x => { logs += x; });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url + '/api/v1/health')).ok) break; } catch {}
    if (child.exitCode !== null) throw new Error(logs);
    await delay(30);
    if (i === 99) throw new Error('Fixture failed to start: ' + logs);
  }
  async function request(route, { method = 'GET', body, visitor = 'test-visitor' } = {}) {
    const response = await fetch(url + '/api/v1' + route, { method,
      headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': visitor },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, ...(await response.json()) };
  }
  async function close() {
    state.release?.();
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => upstream.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
  return { url, request, close, state, dataDir };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await fixture();
  console.log(JSON.stringify({ url: app.url, visitor: 'test-visitor', letter: 'seed-0' }));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
