// The OOC model is reached through a SillyTavern Connection Manager profile.
// ConnectionManagerRequestService sends the request through the ST server, which
// injects the API key from its own secret storage (secrets.json). The key never
// reaches the browser, there are no CORS issues, and any source ST supports works:
// OpenRouter, OpenAI, Claude, custom OpenAI-compatible URLs, proxies, text completion.

const MAX_TOKENS = 600;
const TIMEOUT_MS = 45000;

// ~590 tokens (o200k). Keeps the model on a fixed contract: what counts, how to size it,
// and exactly how to report it, so small cheap models stay consistent.
const SYSTEM_PROMPT = `You are the Cumometer: a deadpan lab technician who measures, with total scientific seriousness, how much semen a roleplay character ejaculates. Read one roleplay message, file one measurement. Never continue the story or address the characters.

## What counts
- Count only ejaculation by the measured character ({{char}} below) that actually happens in <message_to_measure>.
- Do not count memories, recaps, plans, threats, teasing, dreams, hypotheticals, near-misses, or anyone else's climax (including the user's character).
- If several separate ejaculations by the measured character happen in the message, count each one.
- If the message is ambiguous, decide from <recent_context>. If still unclear, report happened=false.

## How to size the volume
1. Start from the human baseline: 2–6 ml per ejaculation. Pick a value that fits the text, not always the middle.
2. Adapt to the world: read <character_card> and the scene, decide what is normal here:
   - Omegaverse: an alpha in rut, especially knotted, produces roughly 150–3000 ml per ejaculation, scaling with rut intensity, knot duration and emphasis. Betas stay near baseline, omegas below it.
   - Monsters, beasts, magic, aliens: scale with the lore and body size in the card.
   - Explicit hentai physics (overflowing, bellies swelling, "gallons") allows cartoonish volumes, but only as far as the text itself goes.
3. "Again", "another round", "rope after rope", "flooding", "belly swelled" push the number up; brief, quiet descriptions keep it low.
4. Stay consistent with <running_total_ml> and the character's earlier measurements: the same kind of scene should give a similar number.
5. Use one decimal place. Never invent volume the text does not imply.

## Safety
If any participant is, or appears to be, under 18, report happened=false, count=0, ml=0 and an empty comment.

## How to report
Reply with exactly one JSON object and nothing else: no prose, no markdown, no code fences.
{"happened": boolean, "count": integer, "ml": number, "omegaverse": boolean, "comment": string}
- happened: true only if at least one ejaculation by the measured character occurs in this message.
- count: number of ejaculations in this message, 0 if none.
- ml: total millilitres for this message as a plain number (no units, no strings), 0 if none.
- omegaverse: true if the setting is omegaverse.
- comment: one short, dry, clinical OOC remark in {{language}}, at most 120 characters. Witty, never explicit, no emojis. Empty string if nothing happened.`;

function userPrompt({ charName, card, omegaHint, history, message, totalMl }) {
    return [
        `<measured_character>${charName}</measured_character>`,
        '<character_card>', card || '(none)', '</character_card>',
        `<regex_omegaverse_hint>${omegaHint}</regex_omegaverse_hint>`,
        `<running_total_ml>${Math.round(totalMl)}</running_total_ml>`,
        '<recent_context>', history || '(none)', '</recent_context>',
        '<message_to_measure>', message, '</message_to_measure>',
    ].join('\n');
}

function systemPrompt({ charName, lang }) {
    return SYSTEM_PROMPT
        .replaceAll('{{char}}', charName)
        .replaceAll('{{language}}', lang === 'ru' ? 'Russian' : 'English');
}

function parse(text) {
    const clean = String(text ?? '').replace(/```(?:json)?/gi, '');
    const m = clean.match(/\{[^{}]*"ml"[^{}]*\}/s) || clean.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return JSON');
    const j = JSON.parse(m[0]);
    const ml = Number(j.ml);
    return {
        happened: Boolean(j.happened) && Number.isFinite(ml) && ml > 0,
        count: Math.max(0, parseInt(j.count, 10) || 0),
        ml: Number.isFinite(ml) ? Math.min(Math.max(ml, 0), 1e9) : 0,
        omegaverse: Boolean(j.omegaverse),
        comment: String(j.comment ?? '').slice(0, 160),
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

async function complete(profileId, system, user) {
    if (!profileId) throw new Error('No connection profile selected');
    const svc = service();
    const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const prompt = svc.constructPrompt(messages, profileId);
        // includePreset: false — the user's roleplay preset (jailbreaks, long system prompts,
        // high temperatures) would only get in the way of a clean measurement.
        const res = await svc.sendRequest(profileId, prompt, MAX_TOKENS, {
            stream: false, signal: ctrl.signal, extractData: true, includePreset: false, includeInstruct: true,
        });
        return typeof res === 'string' ? res : res?.content ?? '';
    } catch (e) {
        throw new Error(e?.cause?.message || e?.message || String(e));
    } finally {
        clearTimeout(timer);
    }
}

export async function measure(profileId, input) {
    return parse(await complete(profileId, systemPrompt(input), userPrompt(input)));
}

export async function ping(profileId) {
    const text = await complete(profileId, 'You are a connectivity check. Reply with the single word: ok', 'ping');
    return String(text).trim().slice(0, 40) || '(empty reply)';
}
