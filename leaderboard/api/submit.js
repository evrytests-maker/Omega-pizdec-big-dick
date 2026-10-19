import { redis, pipeline } from '../lib/redis.js';
import { cors, idFromOwner } from '../lib/http.js';
import { open } from '../lib/crypto.js';

const MAX_ML = 1e12;
const MAX_SKEW_MS = 10 * 60 * 1000;

const cleanNick = (s) => String(s ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    let msg;
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
        msg = await open(body);
    } catch {
        return res.status(400).json({ error: 'Could not decrypt the submission' });
    }

    try {
        const id = idFromOwner(msg.owner);
        if (!id) return res.status(400).json({ error: 'Bad owner' });

        const ml = Number(msg.ml);
        if (!Number.isFinite(ml) || ml < 0 || ml > MAX_ML) return res.status(400).json({ error: 'Bad volume' });

        const ts = Number(msg.ts);
        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return res.status(400).json({ error: 'Clock skew too large' });

        const nick = cleanNick(msg.nick) || `anon-${id.slice(0, 4)}`;

        const ok = await redis('SET', `rl:${id}`, '1', 'NX', 'EX', '30');
        if (ok !== 'OK') return res.status(429).json({ error: 'Too fast, try again in 30 s' });

        const [prevMl, prevNick, prevTs] = await pipeline([
            ['HGET', `u:${id}`, 'ml'],
            ['HGET', `u:${id}`, 'nick'],
            ['HGET', `u:${id}`, 'ts'],
        ]);
        // A captured envelope can't be replayed over a newer result.
        if (prevTs && ts <= Number(prevTs)) return res.status(409).json({ error: 'Stale submission' });

        // A nickname belongs to whoever claimed it first.
        const nickKey = `nick:${nick.toLowerCase()}`;
        const claimed = await redis('SET', nickKey, id, 'NX');
        if (claimed !== 'OK' && (await redis('GET', nickKey)) !== id) {
            await redis('DEL', `rl:${id}`);
            return res.status(409).json({ error: 'Nickname is taken', code: 'nick_taken' });
        }
        const cmds = [
            ['ZADD', 'lb', String(ml), id],
            ['HSET', `u:${id}`, 'nick', nick, 'ml', String(ml), 'ts', String(ts)],
            ['INCRBYFLOAT', 'stats:total', String(ml - (Number(prevMl) || 0))],
            ['ZREVRANK', 'lb', id],
        ];
        if (prevNick && prevNick.toLowerCase() !== nick.toLowerCase()) cmds.push(['DEL', `nick:${prevNick.toLowerCase()}`]);
        const out = await pipeline(cmds);
        return res.status(200).json({ ok: true, rank: (out[3] ?? 0) + 1 });
    } catch (e) {
        return res.status(500).json({ error: String(e.message || e) });
    }
}
