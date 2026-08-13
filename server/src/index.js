import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initStorage } from './db.js';
import { DATA_DIR } from './db.js';
import letterRoutes from './routes/letters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(DATA_DIR, 'audio');

await initStorage();

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

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

app.use('/api/v1', letterRoutes);

// 前端静态资源（生产构建后）
const webDist = fs.existsSync(path.join(__dirname, '..', 'public'))
  ? path.join(__dirname, '..', 'public')
  : path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/|audio\/).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`Muse Letter server running at http://localhost:${PORT}`);
});
