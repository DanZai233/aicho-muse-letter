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

// 管理查询（需 FEEDBACK_ADMIN_TOKEN；?status=new 只看未处理）
router.get('/feedback', (req, res) => {
  if (!ADMIN_TOKEN || req.query.token !== ADMIN_TOKEN) {
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
  if (!ADMIN_TOKEN || req.query.token !== ADMIN_TOKEN) {
    return res.status(403).json({ code: 40301, message: '无权访问' });
  }
  const fb = db().feedbacks.find(f => f.id === req.params.id);
  if (!fb) return res.status(404).json({ code: 40401, message: '反馈不存在' });
  fb.status = req.body?.status === 'done' ? 'done' : 'new';
  fb.updated_at = new Date().toISOString();
  saveDb();
  res.json({ code: 0, data: { id: fb.id, status: fb.status } });
});

export default router;
