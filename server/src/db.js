import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'letters.json');
export const uuid = () => crypto.randomUUID();

export function mysqlMode() {
  return !!(process.env.MYSQL_HOST || process.env.DB_HOST);
}

let cache = null;

function loadJson() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* fallthrough */ }
  }
  return { letters: [] };
}

function saveJson() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---- MySQL 模式：letters 表（id PK, value JSON）----
let pool = null;
async function getPool() {
  if (!pool) {
    const m = await import('mysql2/promise');
    pool = m.createPool({
      host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306),
      user: process.env.MYSQL_USER || process.env.DB_USER || 'letter',
      password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || 'letter123',
      database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'aicho_muse_letter',
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
  }
  return pool;
}

async function ensureTable() {
  const p = await getPool();
  await p.query(`CREATE TABLE IF NOT EXISTS letters (
    id VARCHAR(64) PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function mysqlLoad() {
  const p = await getPool();
  const [rows] = await p.query('SELECT id, value FROM letters');
  cache.letters = rows.map(r => r.value).filter(v => v && typeof v === 'object');
}

let mysqlTimer = null;
function mysqlScheduleSave() {
  if (mysqlTimer) return;
  mysqlTimer = setTimeout(async () => {
    mysqlTimer = null;
    try {
      const p = await getPool();
      for (const letter of cache.letters) {
        await p.query(
          'INSERT INTO letters (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
          [letter.id, JSON.stringify(letter)]
        );
      }
    } catch (e) {
      console.error('[DB] MySQL 落库失败:', e.message);
    }
  }, 300);
}

export async function initStorage() {
  cache = loadJson();
  if (mysqlMode()) {
    await ensureTable();
    await mysqlLoad();
    console.log('[DB] MySQL 模式（aicho_muse_letter.letters）');
  } else {
    console.log('[DB] JSON 文件模式', DB_FILE);
  }
}

export function db() {
  if (!cache) { cache = loadJson(); }
  return cache;
}

export function saveDb() {
  if (!cache) return;
  if (mysqlMode()) { mysqlScheduleSave(); return; }
  saveJson();
}

// 分享 token 唯一性
export function shareToken() {
  return crypto.randomBytes(6).toString('base64url');
}
