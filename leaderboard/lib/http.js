import { createHash } from 'node:crypto';

export function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// The raw user key never touches storage; only its hash is used as the id.
export function idFromKey(key) {
    if (typeof key !== 'string' || key.length < 16 || key.length > 128) return null;
    return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

export function hashToObject(flat) {
    const o = {};
    for (let i = 0; i + 1 < (flat?.length || 0); i += 2) o[flat[i]] = flat[i + 1];
    return o;
}
