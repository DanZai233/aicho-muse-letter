import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'letters.json');
export const uuid = () => crypto.randomUUID();

export function mysqlMode() {
  return !!(process.env.MYSQL_HOST || process.env.DB_HOST);
}

let cache = null;

function loadJson() {
  if (fs.existsSync(DB_FILE)) {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }
  return { letters: [], feedbacks: [], paper: [] };
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
  await p.query('CREATE TABLE IF NOT EXISTS paper (id VARCHAR(64) PRIMARY KEY, value JSON NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  // Existing JSON rows remain intact; generated columns provide indexed mailbox queries.
  const [columns] = await p.query('SHOW COLUMNS FROM letters');
  const names = new Set(columns.map(c => c.Field));
  for (const [name, definition] of [
    ['visitor_id', "VARCHAR(128) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(value, '$.visitor_id'))) STORED"],
    ['persona_id', "VARCHAR(128) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(value, '$.persona.id'))) STORED"],
    ['created_at_key', "VARCHAR(32) GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(value, '$.created_at'))) STORED"],
  ]) if (!names.has(name)) await p.query(`ALTER TABLE letters ADD COLUMN ${name} ${definition}`);
  const [indexes] = await p.query('SHOW INDEX FROM letters');
  if (!indexes.some(i => i.Key_name === 'mailbox')) await p.query('CREATE INDEX mailbox ON letters (visitor_id, created_at_key, id)');
  if (!indexes.some(i => i.Key_name === 'conversation')) await p.query('CREATE INDEX conversation ON letters (visitor_id, persona_id, created_at_key)');
  await p.query(`CREATE TABLE IF NOT EXISTS feedbacks (
    id VARCHAR(64) PRIMARY KEY,
    value JSON NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function mysqlLoad() {
  const p = await getPool();
  const [rows] = await p.query('SELECT id, value FROM letters');
  cache.letters = rows.map(r => r.value).filter(v => v && typeof v === 'object');
  const [paperRows] = await p.query('SELECT id, value FROM paper');
  cache.paper = paperRows.map(r => r.value).filter(v => v && typeof v === 'object');
  const [fbRows] = await p.query('SELECT id, value FROM feedbacks');
  cache.feedbacks = fbRows.map(r => r.value).filter(v => v && typeof v === 'object');
}

// Serialize snapshots: only changed rows are written, and failures reach callers.
let saved = { letters: new Map(), feedbacks: new Map(), paper: new Map() };
let writes = Promise.resolve();
function snapshot() {
  return Object.fromEntries(['letters', 'feedbacks', 'paper'].map(table =>
    [table, new Map(cache[table].map(row => [row.id, JSON.stringify(row)]))]));
}
async function persist(changes) {
  if (!mysqlMode()) {
    const next = { letters: new Map(saved.letters), feedbacks: new Map(saved.feedbacks), paper: new Map(saved.paper) };
    for (const { table, id, value } of changes) {
      if (value === null) next[table].delete(id); else next[table].set(id, value);
    }
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(Object.fromEntries(
      Object.entries(next).map(([table, rows]) => [table, [...rows.values()].map(JSON.parse)]))));
    await fs.promises.rename(tmp, DB_FILE);
    saved = next;
    return;
  }
  const connection = await (await getPool()).getConnection();
  try {
    await connection.beginTransaction();
    for (const { table, id, value } of changes) {
      if (value === null) await connection.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
      else if (saved[table].get(id) !== value) await connection.query(
        `INSERT INTO ${table} (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`, [id, value]);
    }
    await connection.commit();
    for (const { table, id, value } of changes) {
      if (value === null) saved[table].delete(id); else saved[table].set(id, value);
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

export async function initStorage({ connectionPool } = {}) {
  if (connectionPool) pool = connectionPool;
  cache = loadJson();
  if (!Array.isArray(cache.paper)) cache.paper = [];
  if (!Array.isArray(cache.letters)) cache.letters = [];
  if (!Array.isArray(cache.feedbacks)) cache.feedbacks = [];
  if (mysqlMode()) {
    await ensureTable();
    await mysqlLoad();
    console.log('[DB] MySQL 模式（aicho_muse_letter.letters）');
  } else {
    console.log('[DB] JSON 文件模式', DB_FILE);
  }
  saved = snapshot();
}

export function db() {
  if (!cache) { cache = loadJson(); }
  if (!Array.isArray(cache.feedbacks)) cache.feedbacks = [];
  return cache;
}

export function saveDb(table, row, deleted = false) {
  if (!cache) return Promise.resolve();
  if (!['letters', 'feedbacks', 'paper'].includes(table) || !row?.id) throw new Error('Invalid storage operation');
  const change = { table, id: row.id, value: deleted ? null : JSON.stringify(row) };
  const pending = writes.then(() => persist([change])).catch(error => {
    // Roll back a failed mutation if no newer mutation has replaced it.
    const index = cache[table].findIndex(r => r.id === row.id);
    const current = index < 0 ? null : JSON.stringify(cache[table][index]);
    if (current === change.value) {
      const durable = saved[table].get(row.id);
      if (index >= 0) cache[table].splice(index, 1);
      if (durable) cache[table].push(JSON.parse(durable));
    }
    throw error;
  });
  writes = pending.catch(() => {});
  return pending;
}

export async function closeStorage() {
  await writes;
  if (pool) await pool.end();
}

export async function listLetters(visitor, { page = 1, pageSize = 20, persona = '' } = {}) {
  if (mysqlMode()) {
    const p = await getPool();
    const where = persona ? 'visitor_id = ? AND persona_id = ?' : 'visitor_id = ?';
    const args = persona ? [visitor, persona] : [visitor];
    const [[{ total }]] = await p.query(`SELECT COUNT(*) AS total FROM letters WHERE ${where}`, args);
    const [rows] = await p.query(`SELECT value FROM letters WHERE ${where} ORDER BY created_at_key DESC, id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]);
    return { list: rows.map(r => r.value), total: Number(total) };
  }
  const list = cache.letters.filter(l => l.visitor_id === visitor && (!persona || l.persona?.id === persona))
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  return { list: list.slice((page - 1) * pageSize, page * pageSize), total: list.length };
}

// 分享 token 唯一性
export function shareToken() {
  return crypto.randomBytes(18).toString('base64url');
}
