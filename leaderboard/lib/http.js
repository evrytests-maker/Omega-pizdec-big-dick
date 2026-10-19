import { createHash } from 'node:crypto';

export function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// `owner` is SHA-256 of the user's local key, computed in the browser; the key itself never
// leaves it. We store a hash of that again, so a database leak can't be replayed as a submission.
export function idFromOwner(owner) {
    if (typeof owner !== 'string' || !/^[0-9a-f]{64}$/.test(owner)) return null;
    return createHash('sha256').update(owner).digest('hex').slice(0, 32);
}

export function hashToObject(flat) {
    const o = {};
    for (let i = 0; i + 1 < (flat?.length || 0); i += 2) o[flat[i]] = flat[i + 1];
    return o;
}
