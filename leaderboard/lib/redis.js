// Minimal Upstash Redis REST client (Vercel Marketplace → Upstash Redis sets these env vars).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function call(path, body) {
    if (!URL_ || !TOKEN) throw new Error('Redis is not configured');
    const res = await fetch(`${URL_}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
    return res.json();
}

export async function redis(...cmd) {
    const { result, error } = await call('', cmd);
    if (error) throw new Error(error);
    return result;
}

export async function pipeline(cmds) {
    const out = await call('/pipeline', cmds);
    return out.map((r) => {
        if (r.error) throw new Error(r.error);
        return r.result;
    });
}
