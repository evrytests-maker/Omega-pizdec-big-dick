// Sealed submissions: the extension encrypts { nick, ml, owner, ts } to this deployment's
// public key (ephemeral ECDH P-256 → HKDF-SHA256 → AES-256-GCM). Only the server holding
// BOARD_PRIVATE_KEY can read it; proxies, logs and browser extensions see ciphertext.
const { subtle } = globalThis.crypto;
const ALG = { name: 'ECDH', namedCurve: 'P-256' };
const enc = new TextEncoder();

let cached = null;

function privateJwk() {
    const raw = process.env.BOARD_PRIVATE_KEY;
    if (!raw) throw new Error('BOARD_PRIVATE_KEY is not set');
    const jwk = JSON.parse(raw);
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) throw new Error('BOARD_PRIVATE_KEY must be an EC P-256 private JWK');
    return jwk;
}

async function keys() {
    if (cached) return cached;
    const jwk = privateJwk();
    const { kty, crv, x, y } = jwk;
    cached = {
        priv: await subtle.importKey('jwk', { kty, crv, x, y, d: jwk.d }, ALG, false, ['deriveBits']),
        pub: { kty, crv, x, y },
    };
    return cached;
}

export async function publicKey() {
    return (await keys()).pub;
}

const b64 = (s) => Buffer.from(String(s), 'base64url');

export async function open(envelope) {
    if (envelope?.v !== 1 || !envelope.epk || !envelope.iv || !envelope.ct) throw new Error('Bad envelope');
    const { priv } = await keys();
    const epk = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: envelope.epk.x, y: envelope.epk.y }, ALG, false, []);
    const shared = await subtle.deriveBits({ name: 'ECDH', public: epk }, priv, 256);
    const hkdf = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    const aes = await subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('cumometer/v1'), info: enc.encode('submit') },
        hkdf, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64(envelope.iv) }, aes, b64(envelope.ct));
    return JSON.parse(new TextDecoder().decode(plain));
}
