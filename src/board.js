// Leaderboard client. A submission is sealed to the server's public key, so only the
// leaderboard deployment can read it. It carries both volumes (omega-pizdec and base), the nickname, a timestamp
// against replays, and `owner`: SHA-256 of the local key, which proves the nickname is
// yours without the key itself ever leaving the browser.
// WebCrypto's subtle API exists only in secure contexts (https or localhost). SillyTavern opened
// over plain http on a LAN address has none, so callers check this before submitting.
export const canSeal = () => Boolean(globalThis.crypto?.subtle);
const ALG = { name: 'ECDH', namedCurve: 'P-256' };
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const origin = (url) => String(url || '').trim().replace(/\/+$/, '');

async function sha256hex(text) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Private proof of ownership: travels only inside the sealed submission. */
export const ownerHash = (localKey) => sha256hex(localKey);

/** Public player id (what the server stores): safe for links, useless for submitting. */
export async function publicId(localKey) {
    return (await sha256hex(await ownerHash(localKey))).slice(0, 32);
}

async function seal(serverJwk, payload) {
    const { subtle } = crypto;
    const server = await subtle.importKey('jwk', serverJwk, ALG, false, []);
    const eph = await subtle.generateKey(ALG, true, ['deriveBits']);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: server }, eph.privateKey, 256);
    const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    const aes = await subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cumometer/v1'), info: enc.encode('submit') },
        hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(payload)));
    const { x, y } = await subtle.exportKey('jwk', eph.publicKey);
    return { v: 1, epk: { x, y }, iv: b64url(iv), ct: b64url(ct) };
}

export async function submit(url, { nick, omega, base, localKey }) {
    if (!canSeal()) {
        const err = new Error('Encryption is unavailable: open SillyTavern over https or localhost');
        err.code = 'insecure';
        throw err;
    }
    const keyRes = await fetch(`${origin(url)}/api/key`);
    const keyJson = await keyRes.json().catch(() => ({}));
    if (!keyRes.ok || !keyJson.key) throw new Error(keyJson.error || `HTTP ${keyRes.status}`);

    const envelope = await seal(keyJson.key, { nick, omega, base, owner: await ownerHash(localKey), ts: Date.now() });
    const res = await fetch(`${origin(url)}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `HTTP ${res.status}`);
        err.code = data.code;
        throw err;
    }
    return data;
}

export async function boardUrl(url, localKey) {
    return canSeal() ? `${origin(url)}/?me=${await publicId(localKey)}` : origin(url);
}
