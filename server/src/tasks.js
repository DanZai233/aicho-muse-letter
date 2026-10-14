// Bounded upstream work: waiting jobs do not consume upstream connections.
export function createQueue({ concurrency = 3, capacity = 50, waitMs = 30000 } = {}) {
  let active = 0;
  const waiting = [];
  function drain() {
    while (active < concurrency && waiting.length) {
      const { task, resolve, reject, timer } = waiting.shift();
      clearTimeout(timer);
      active++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
    }
  }
  return task => new Promise((resolve, reject) => {
    if (waiting.length >= capacity) return reject(Object.assign(new Error('当前请求较多，请稍后再试'), { status: 503 }));
    const job = { task, resolve, reject };
    job.timer = setTimeout(() => {
      const index = waiting.indexOf(job);
      if (index >= 0) {
        waiting.splice(index, 1);
        reject(Object.assign(new Error('等待生成超时，请稍后再试'), { status: 503 }));
      }
    }, waitMs);
    job.timer.unref();
    waiting.push(job);
    drain();
  });
}
export const upstreamQueue = createQueue({
  concurrency: Math.max(1, Number(process.env.GENERATION_CONCURRENCY) || 3),
  capacity: Math.max(1, Number(process.env.GENERATION_QUEUE_SIZE) || 50),
});

export function createRateLimiter({ limit = 30, windowMs = 3600000, now = Date.now } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    if (req.method !== 'POST' || !/^\/(letters|share|feedback)(\/|$)/.test(req.path)) return next();
    const time = now();
    // Bound memory without retaining expired IP/visitor identifiers.
    for (const [key, bucket] of buckets) if (bucket.until <= time) buckets.delete(key);
    const visitor = String(req.headers['x-visitor-id'] || '').slice(0, 128);
    const keys = ['ip:' + req.ip, ...(visitor ? ['visitor:' + visitor] : [])];
    const exhausted = keys.map(k => buckets.get(k)).find(b => b && b.count >= limit);
    if (exhausted) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((exhausted.until - time) / 1000))));
      return res.status(429).json({ code: 42901, message: '操作太频繁，请稍后再试' });
    }
    if (buckets.size > 10000) return res.status(503).json({ code: 50301, message: '当前请求较多，请稍后再试' });
    for (const key of keys) {
      const bucket = buckets.get(key) || { count: 0, until: time + windowMs };
      bucket.count++;
      buckets.set(key, bucket);
    }
    next();
  };
}
