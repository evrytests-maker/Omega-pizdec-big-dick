import { publicKey } from '../lib/crypto.js';
import { cors } from '../lib/http.js';

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.status(200).json({ v: 1, key: await publicKey() });
    } catch (e) {
        return res.status(503).json({ error: String(e.message || e) });
    }
}
