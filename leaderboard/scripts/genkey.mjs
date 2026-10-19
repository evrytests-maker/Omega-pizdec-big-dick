// Generates the leaderboard's key pair. Paste the printed line into Vercel →
// Settings → Environment Variables as BOARD_PRIVATE_KEY. Keep it secret.
const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const { kty, crv, x, y, d } = jwk;
console.log(JSON.stringify({ kty, crv, x, y, d }));
