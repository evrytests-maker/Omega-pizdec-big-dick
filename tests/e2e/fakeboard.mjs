// Fake Upstash REST (in-memory) + a tiny Vercel-style adapter around the real handlers.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const kv = new Map(), z = new Map(), h = new Map();
function run([cmd, ...a]) {
  switch (cmd.toUpperCase()) {
    case 'SET': { if (a.includes('NX') && kv.has(a[0])) return null; kv.set(a[0], a[1]); return 'OK'; }
    case 'ZADD': { const s = z.get(a[0]) || new Map(); s.set(a[2], Number(a[1])); z.set(a[0], s); return 1; }
    case 'HSET': { const o = h.get(a[0]) || {}; for (let i = 1; i < a.length; i += 2) o[a[i]] = a[i + 1]; h.set(a[0], o); return 1; }
    case 'HGETALL': return Object.entries(h.get(a[0]) || {}).flat();
    case 'HGET': return (h.get(a[0]) || {})[a[1]] ?? null;
    case 'GET': return kv.get(a[0]) ?? null;
    case 'INCRBYFLOAT': { const v = Number(kv.get(a[0]) || 0) + Number(a[1]); kv.set(a[0], String(v)); return String(v); }
    case 'ZCARD': return (z.get(a[0]) || new Map()).size;
    case 'ZREVRANGE': { const arr = [...(z.get(a[0]) || new Map())].sort((x, y) => y[1] - x[1]).slice(+a[1], +a[2] + 1); return a[3] ? arr.flatMap(([m, s]) => [m, String(s)]) : arr.map(([m]) => m); }
    case 'ZREVRANK': { const arr = [...(z.get(a[0]) || new Map())].sort((x, y) => y[1] - x[1]); const i = arr.findIndex(([m]) => m === a[1]); return i < 0 ? null : i; }
    case 'DEL': kv.delete(a[0]); return 1;
  }
  throw new Error('unsupported ' + cmd);
}
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const body = JSON.parse(b);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/pipeline' ? body.map((c) => ({ result: run(c) })) : { result: run(body) }));
  });
}).listen(5201, '127.0.0.1');

process.env.KV_REST_API_URL = 'http://127.0.0.1:5201';
process.env.KV_REST_API_TOKEN = 't';
const dir = process.argv[2];
const submit = (await import(dir + '/api/submit.js')).default;
const top = (await import(dir + '/api/top.js')).default;
export const reset = () => kv.clear();
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
    const vreq = { method: req.method, query: Object.fromEntries(u.searchParams), body: b ? JSON.parse(b) : undefined };
    const vres = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, json(o) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); }, end() { res.end(); } };
    if (u.pathname === '/api/submit') return submit(vreq, vres);
    if (u.pathname === '/api/top') return top(vreq, vres);
    if (u.pathname === '/__clear_rl') { for (const k of kv.keys()) if (k.startsWith('rl:')) kv.delete(k); return res.end('ok'); }
    // Static files, like Vercel serves the project root.
    const file = path.join(dir, u.pathname === '/' ? 'index.html' : u.pathname);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
    if (file.startsWith(dir) && !file.includes(`${path.sep}api${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      return res.end(fs.readFileSync(file));
    }
    res.statusCode = 404; res.end();
  });
}).listen(5200, '127.0.0.1', () => console.log('board on 5200'));
