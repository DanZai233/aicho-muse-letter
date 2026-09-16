// 反馈：提交、管理查询（管理员 token 保护）
import { Router } from 'express';
import { db, saveDb, uuid } from '../db.js';

const router = Router();

const ADMIN_TOKEN = process.env.FEEDBACK_ADMIN_TOKEN || '';
const FEEDBACK_TYPES = ['功能建议', '问题反馈', '希望新增角色', '其他'];

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket?.remoteAddress || '';
}

function sanitize(s, max) {
  return String(s || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

// 提交反馈（匿名访客）
router.post('/feedback', (req, res) => {
  const { type, content, contact } = req.body || {};
  const c = sanitize(content, 2000);
  if (c.length < 2) return res.status(400).json({ code: 40001, message: '反馈内容太短了' });
  const t = FEEDBACK_TYPES.includes(type) ? type : '其他';
  const fb = {
    id: uuid(),
    type: t,
    content: c,
    contact: sanitize(contact, 200),
    visitor_id: String(req.headers['x-visitor-id'] || req.query.visitor || '').trim() || null,
    source: {
      ip: clientIp(req),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      created_at: new Date().toISOString(),
    },
    status: 'new',
    created_at: new Date().toISOString(),
  };
  db().feedbacks.push(fb);
  saveDb();
  res.json({ code: 0, data: { id: fb.id, status: fb.status } });
});

function adminOk(req) {
  const q = String(req.query.token || '');
  const h = String(req.headers['x-admin-token'] || '');
  return !!(ADMIN_TOKEN && (q === ADMIN_TOKEN || h === ADMIN_TOKEN));
}

// 写信统计（需 FEEDBACK_ADMIN_TOKEN）：每日写信量 + 汇总（近 days 天，默认 14）
router.get('/stats/letters', (req, res) => {
  if (!adminOk(req)) {
    return res.status(403).json({ code: 40301, message: '无权访问（服务端未配置或 token 错误）' });
  }
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
  const letters = db().letters || [];
  const byDay = {};
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = 0;
  }
  let total = 0;
  let done = 0;
  for (const l of letters) {
    const key = String(l.created_at || '').slice(0, 10);
    if (byDay[key] !== undefined) {
      byDay[key]++;
      total++;
      if (l.status === 'done') done++;
    }
  }
  const trend = Object.entries(byDay).map(([date, count]) => ({ date, count }));
  res.json({ code: 0, data: { days, total, done, trend } });
});

// 管理查询（需 FEEDBACK_ADMIN_TOKEN；?status=new 只看未处理）
router.get('/feedback', (req, res) => {
  if (!adminOk(req)) {
    return res.status(403).json({ code: 40301, message: '无权访问（服务端未配置或 token 错误）' });
  }
  const status = String(req.query.status || '').trim();
  let list = db().feedbacks.slice();
  if (status) list = list.filter(f => f.status === status);
  list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({ code: 0, data: { list: list.slice(0, limit).map(f => ({ ...f, source: undefined })), total: list.length } });
});

// 标记已处理（管理员）
router.patch('/feedback/:id', (req, res) => {
  if (!adminOk(req)) {
    return res.status(403).json({ code: 40301, message: '无权访问' });
  }
  const fb = db().feedbacks.find(f => f.id === req.params.id);
  if (!fb) return res.status(404).json({ code: 40401, message: '反馈不存在' });
  fb.status = req.body?.status === 'done' ? 'done' : 'new';
  fb.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { id: fb.id, status: fb.status } });
});

// 信件管理（需 FEEDBACK_ADMIN_TOKEN）：列出全部信件，含分享链接
router.get('/admin/letters', (req, res) => {
  if (!adminOk(req)) {
    return res.status(403).json({ code: 40301, message: '无权访问（服务端未配置或 token 错误）' });
  }
  const status = String(req.query.status || '').trim();
  const shared = String(req.query.shared || '').trim();
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = (db().letters || []).slice();
  if (status) list = list.filter(l => l.status === status);
  if (shared === '1') list = list.filter(l => !!l.share_token);
  if (q) {
    list = list.filter(l => [l.pen_name, l.persona?.name, l.letter_content]
      .filter(Boolean).join(' ').toLowerCase().includes(q));
  }
  list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const total = list.length;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size) || 20));
  const start = (page - 1) * pageSize;
  res.json({
    code: 0,
    data: {
      total, page, page_size: pageSize,
      list: list.slice(start, start + pageSize).map(l => ({
        id: l.id,
        pen_name: l.pen_name || '',
        persona_name: l.persona?.name || '',
        persona_tagline: l.persona?.tagline || '',
        voice_name: l.persona?.voice_name || '',
        status: l.status,
        error: l.error || null,
        reply_count: Array.isArray(l.reply) ? l.reply.length : 0,
        letter_preview: String(l.letter_content || '').replace(/\s+/g, ' ').slice(0, 80),
        share_token: l.share_token || null,
        share_path: l.share_token ? '/l/' + l.share_token : null,
        created_at: l.created_at,
      })),
    },
  });
});

// 单封信详情（需 FEEDBACK_ADMIN_TOKEN）：完整原文 + 回信 + 分享链接
router.get('/admin/letters/:id', (req, res) => {
  if (!adminOk(req)) {
    return res.status(403).json({ code: 40301, message: '无权访问' });
  }
  const l = (db().letters || []).find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ code: 40401, message: '信件不存在' });
  res.json({
    code: 0,
    data: {
      letter: {
        id: l.id,
        pen_name: l.pen_name || '',
        persona: l.persona || null,
        letter_content: l.letter_content || '',
        signature: l.signature || '',
        reply: l.reply || [],
        status: l.status,
        error: l.error || null,
        share_token: l.share_token || null,
        share_path: l.share_token ? '/l/' + l.share_token : null,
        visitor_id: l.visitor_id || null,
        source: l.source ? { ip: l.source.ip, created_at: l.source.created_at } : null,
        created_at: l.created_at,
        updated_at: l.updated_at,
      },
    },
  });
});

export default router;
