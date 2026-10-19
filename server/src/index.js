import express from 'express';
import cors from 'cors';
import { createRateLimiter } from './tasks.js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initStorage, db, saveDb, closeStorage } from './db.js';
import { DATA_DIR } from './db.js';
import letterRoutes from './routes/letters.js';
import { cleanupAudio } from './muse.js';
import accountRoutes from './routes/account.js';
import paperRoutes from './routes/paper.js';
import feedbackRoutes from './routes/feedback.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(DATA_DIR, 'audio');

await initStorage();
// 服务重启恢复：把卡在生成中的信件标记为失败，让用户可重新生成（容器重启会中断内存任务）
for (const letter of db().letters) {
  if (letter.status === 'writing' || letter.status === 'replying') {
    letter.status = 'error';
    letter.error = '回信生成被服务重启中断，请点击「再寄一次」重新生成';
    await saveDb('letters', letter);
  }
}

cleanupAudio().catch(error => console.error('[Audio] 清理失败:', error.message));
setInterval(() => cleanupAudio().catch(error => console.error('[Audio] 清理失败:', error.message)), 86400000).unref();

const app = express();
// Only explicitly trusted proxies may supply the client IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(s => s.trim()));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use('/connect', (req,res,next)=>{res.set('Referrer-Policy','no-referrer').set('Cache-Control','no-store');next();});
app.use(express.json({ limit: '32kb' }));

app.get('/api/v1/health', (req, res) => {
  res.json({ code: 0, data: { ok: true, time: new Date().toISOString(), name: 'aicho-muse-letter' } });
});

// 音频静态访问（顶层路径，供前端 audio_url 直接播放）
app.get('/audio/:file', (req, res) => {
  const file = String(req.params.file || '');
  if (!/^[0-9a-f]{24}\.mp3$/.test(file)) return res.status(400).json({ code: 40001, message: '非法文件' });
  const p = path.join(AUDIO_DIR, file);
  if (!fs.existsSync(p)) return res.status(404).json({ code: 40401, message: '音频不存在' });
  res.set('Content-Type', 'audio/mpeg').set('Cache-Control', 'public, max-age=86400').sendFile(p);
});

app.use('/api/v1/account', createRateLimiter({limit:60,matches:req=>req.method==='POST'}), accountRoutes);
app.use('/api/v1/paper', createRateLimiter({ limit: 180, matches: req => req.method === 'POST' }), paperRoutes);
app.use('/api/v1', createRateLimiter({ limit: Math.max(1, Number(process.env.REQUESTS_PER_HOUR) || 30) }));
app.use('/api/v1', letterRoutes);
app.use('/api/v1', feedbackRoutes);

// 前端静态资源（生产构建后）
const webDist = fs.existsSync(path.join(__dirname, '..', 'public'))
  ? path.join(__dirname, '..', 'public')
  : path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { setHeaders: (res, file) => {
    if (file.includes(path.sep + 'assets' + path.sep)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    else res.set('Cache-Control', 'no-cache');
  } }));
  app.get(/^\/(?!api\/|audio\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3004;
app.use((error, req, res, next) => {
  console.error('[HTTP]', error.message);
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  res.status(status).json({ code: status * 100 + 1, message: status === 500 ? '保存失败，请稍后重试' : error.message });
});

const server = app.listen(PORT, () => {
  console.log(`Muse Letter server running at http://localhost:${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(async () => { await closeStorage(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
