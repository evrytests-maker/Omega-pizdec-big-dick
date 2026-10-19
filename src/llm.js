// The measuring model is reached through a SillyTavern Connection Manager profile.
// ConnectionManagerRequestService sends the request through the ST server, which
// injects the API key from its own secret storage (secrets.json). The key never
// reaches the browser, there are no CORS issues, and any source ST supports works:
// OpenRouter, OpenAI, Claude, custom OpenAI-compatible URLs, proxies, text completion.

const MAX_TOKENS = 600;
const TIMEOUT_MS = 45000;

const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')));

// Tolerant reader: small models wrap JSON in prose or fences, quote numbers or add units.
function parse(text) {
    const clean = String(text ?? '').replace(/```(?:json)?/gi, '');
    const candidates = clean.match(/\{[^{}]*\}/g) || [];
    const raw = candidates.reverse().find((c) => /["']?(?:omega-pizdec|ml|happened)["']?\s*:/.test(c));
    if (!raw) return null;
    let j;
    try {
        j = JSON.parse(raw);
    } catch {
        try {
            j = JSON.parse(raw.replace(/,\s*\}/, '}').replace(/'/g, '"'));
        } catch {
            return null;
        }
    }
    // "omega-pizdec" is the lore-scaled volume; older replies may still say "ml".
    const omega = num(j['omega-pizdec'] ?? j.omega_pizdec ?? j.omega ?? j.ml);
    let base = num(j.base);
    const happened = (j.happened === true || j.happened === 'true') && Number.isFinite(omega) && omega > 0;
    // A missing realistic figure falls back to a typical human volume rather than zero.
    if (!Number.isFinite(base) || base <= 0) base = Math.min(omega, 5);
    return {
        happened,
        count: happened ? Math.max(1, parseInt(j.count, 10) || 1) : 0,
        ml: happened ? Math.min(omega, 1e9) : 0,
        base: happened ? Math.min(base, omega, 1e9) : 0,
    };
}

function service() {
    const svc = SillyTavern.getContext().ConnectionManagerRequestService;
    if (!svc) throw new Error('Connection Manager is not available in this SillyTavern version');
    return svc;
}

/** Profiles the request service can use, or null when Connection Manager is disabled. */
export function listProfiles() {
    try {
        return service().getSupportedProfiles();
    } catch {
        return null;
    }
}

async function complete(profileId, messages) {
    if (!profileId) throw new Error('No connection profile selected');
    const svc = service();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const prompt = svc.constructPrompt(messages, profileId);
        // includePreset: false: the measurement uses its own rules instead of the roleplay preset.
        const res = await svc.sendRequest(profileId, prompt, MAX_TOKENS, {
            stream: false, signal: ctrl.signal, extractData: true, includePreset: false, includeInstruct: true,
        });
        return typeof res === 'string' ? { content: res, reasoning: '' } : { content: res?.content ?? '', reasoning: res?.reasoning ?? '' };
    } catch (e) {
        throw new Error(e?.cause?.message || e?.message || String(e));
    } finally {
        clearTimeout(timer);
    }
}

/** @param {{role: string, content: string}[]} messages built by prompt.js */
export async function measure(profileId, messages) {
    let out = await complete(profileId, messages);
    // Reasoning models sometimes leave the answer inside their thinking block.
    let res = parse(out.content) ?? parse(out.reasoning);
    if (res) return res;
    // One corrective retry before giving up to the offline estimate.
    out = await complete(profileId, [
        ...messages,
        { role: 'assistant', content: String(out.content).slice(0, 400) || '(no answer)' },
        { role: 'user', content: 'That was not a valid answer. Reply with exactly one JSON object in the required format and nothing else.' },
    ]);
    res = parse(out.content) ?? parse(out.reasoning);
    if (res) return res;
    throw new Error('Model did not return valid JSON');
}

export async function ping(profileId) {
    const { content: text } = await complete(profileId, [
        { role: 'system', content: 'You are a connectivity check. Reply with the single word: ok' },
        { role: 'user', content: 'ping' },
    ]);
    return String(text).trim().slice(0, 40) || '(empty reply)';
}

export { parse as parseReply };
