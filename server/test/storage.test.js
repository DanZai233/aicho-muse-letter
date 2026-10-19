import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// A deterministic driver verifies transaction boundaries and incremental writes.
// Real MySQL DDL is checked separately during deployment.
test('MySQL writes only changed rows, commits before resolving, and rolls back failures', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'muse-storage-test-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  process.env.DATA_DIR = dataDir;
  process.env.MYSQL_HOST = 'test-driver';
  const durable = new Map([['existing', { id: 'existing', visitor_id: 'owner', persona: { id: 'preset' }, created_at: '2026-01-01', status: 'done' }]]);
  const paperRows = new Map();
  const queries = [];
  let pending, fail = false, commits = 0, rollbacks = 0;
  const connection = {
    async beginTransaction() { pending = new Map(durable); },
    async query(sql, args) {
      queries.push({ sql, args });
      if (fail) throw new Error('database unavailable');
      if (sql.startsWith('INSERT INTO letters')) pending.set(args[0], JSON.parse(args[1]));
      if (sql.startsWith('INSERT INTO paper')) paperRows.set(args[0], JSON.parse(args[1]));
      if (sql.startsWith('DELETE FROM letters')) pending.delete(args[0]);
      return [[]];
    },
    async commit() { durable.clear(); for (const row of pending) durable.set(...row); commits++; },
    async rollback() { rollbacks++; },
    release() {},
  };
  const pool = {
    async getConnection() { return connection; },
    async query(sql, args) {
      queries.push({ sql, args });
      if (sql === 'SHOW COLUMNS FROM letters') return [[{ Field: 'id' }, { Field: 'value' }]];
      if (sql === 'SHOW INDEX FROM letters') return [[]];
      if (sql === 'SELECT id, value FROM letters') return [[...durable].map(([id, value]) => ({ id, value }))];
      return [[]];
    }, async end() {},
  };
  const { initStorage, db, saveDb, closeStorage } = await import('../src/db.js');
  await initStorage({ connectionPool: pool });
  assert.ok(queries.some(q => q.sql.startsWith('CREATE INDEX mailbox')));
  assert.ok(queries.some(q => q.sql.startsWith('CREATE INDEX conversation')));
  queries.length = 0;
  const letter = { id: 'new', visitor_id: 'owner', status: 'replying' };
  db().letters.push(letter);
  await saveDb('letters', letter);
  assert.equal(commits, 1); assert.equal(durable.get('new').status, 'replying');
  assert.equal(queries.filter(q => q.sql.startsWith('INSERT')).length, 1);
  assert.ok(!queries.some(q => q.args?.[0] === 'existing'));
  // Failed updates must not leave a success state in the memory cache.
  fail = true; letter.status = 'done';
  await assert.rejects(saveDb('letters', letter), /database unavailable/);
  assert.equal(rollbacks, 1); assert.equal(durable.get('new').status, 'replying');
  assert.equal(db().letters.find(l => l.id === 'new').status, 'replying');
  fail = false;
  const current = db().letters.find(l => l.id === 'new');
  current.status = 'error'; await saveDb('letters', current);
  assert.equal(durable.get('new').status, 'error');
  db().letters = db().letters.filter(l => l.id !== 'new');
  await saveDb('letters', current, true);
  assert.ok(!durable.has('new')); assert.ok(durable.has('existing'));
  const postoffice={id:'postoffice',profiles:[{id:'user'}],letters:[],routes:[],reports:[]};
  db().paper.push(postoffice);await saveDb('paper',postoffice);
  assert.equal(paperRows.get('postoffice').profiles[0].id,'user');
  fail=true;postoffice.profiles.push({id:'failed'});
  await assert.rejects(saveDb('paper',postoffice),/database unavailable/);
  assert.equal(db().paper[0].profiles.length,1);
  assert.equal(paperRows.get('postoffice').profiles.length,1);
  fail=false;
  await closeStorage();
});
