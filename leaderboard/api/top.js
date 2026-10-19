import { redis, pipeline } from '../lib/redis.js';
import { cors, idFromKey, hashToObject } from '../lib/http.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
        const flat = await redis('ZREVRANGE', 'lb', '0', String(limit - 1), 'WITHSCORES');
        const ids = [];
        for (let i = 0; i < flat.length; i += 2) ids.push(flat[i]);

        const users = ids.length ? await pipeline(ids.map((id) => ['HGETALL', `u:${id}`])) : [];
        const meId = idFromKey(req.query.me);
        const rows = ids.map((id, i) => {
            const u = hashToObject(users[i]);
            return {
                rank: i + 1,
                nick: u.nick || 'anon',
                ml: Number(flat[i * 2 + 1]) || 0,
                topChar: u.top || '',
                topCharMl: Number(u.topMl) || 0,
                me: meId === id || undefined,
            };
        });

        let me = null;
        if (meId) {
            const r = await redis('ZREVRANK', 'lb', meId);
            if (r !== null) me = { rank: r + 1 };
        }

        res.setHeader('Cache-Control', meId ? 'no-store' : 's-maxage=30, stale-while-revalidate=60');
        return res.status(200).json({ rows, me });
    } catch (e) {
        return res.status(500).json({ error: String(e.message || e) });
    }
}
