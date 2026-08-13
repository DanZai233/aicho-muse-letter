import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initStorage } from './db.js';
import letterRoutes from './routes/letters.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await initStorage();

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/v1/health', (req, res) => {
  res.json({ code: 0, data: { ok: true, time: new Date().toISOString(), name: 'aicho-muse-letter' } });
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
