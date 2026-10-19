import { redis, pipeline } from '../lib/redis.js';
import { cors, idFromKey } from '../lib/http.js';

const MAX_ML = 1e12;

const cleanText = (s, max) => String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        const id = idFromKey(body.userKey);
        if (!id) return res.status(400).json({ error: 'Bad user key' });

        const ml = Number(body.ml);
        if (!Number.isFinite(ml) || ml < 0 || ml > MAX_ML) return res.status(400).json({ error: 'Bad volume' });
        const topCharMl = Math.min(Math.max(Number(body.topCharMl) || 0, 0), ml);

        const nickname = cleanText(body.nickname, 24) || `anon-${id.slice(0, 4)}`;
        const topChar = cleanText(body.topChar, 48);

        // One submission per 30 s per user.
        const ok = await redis('SET', `rl:${id}`, '1', 'NX', 'EX', '30');
        if (ok !== 'OK') return res.status(429).json({ error: 'Too fast, try again in 30 s' });

        // Keep a running grand total so the site can show it without scanning every player.
        const prev = Number(await redis('HGET', `u:${id}`, 'ml')) || 0;
        const [, , rank] = await pipeline([
            ['ZADD', 'lb', String(ml), id],
            ['HSET', `u:${id}`, 'nick', nickname, 'ml', String(ml), 'top', topChar, 'topMl', String(topCharMl), 'ts', String(Date.now())],
            ['ZREVRANK', 'lb', id],
            ['INCRBYFLOAT', 'stats:total', String(ml - prev)],
        ]);
        return res.status(200).json({ ok: true, rank: (rank ?? 0) + 1 });
    } catch (e) {
        return res.status(500).json({ error: String(e.message || e) });
    }
}
