// The separate small OOC model. Two wire formats cover almost every provider:
//  - "openai":    any OpenAI-compatible /chat/completions (OpenAI, OpenRouter, Groq,
//                 DeepSeek, Together, Mistral, local llama.cpp / Ollama / LM Studio …)
//  - "anthropic": Anthropic Messages API
// Base URL is user-editable, so proxies and self-hosted gateways work too.

const TIMEOUT_MS = 30000;

function systemPrompt({ charName, lang, absurdity }) {
    const language = lang === 'ru' ? 'Russian' : 'English';
    return [
        `You are the Cumometer: a deadpan, slightly unhinged lab technician who measures, with total scientific seriousness, how much ${charName} ejaculated in one roleplay message.`,
        '',
        'Rules:',
        `1. Count only ejaculation by ${charName} that actually happens in THIS message. Memories, plans, threats, teasing, and other characters do not count.`,
        '2. Baseline human: 2-6 ml per ejaculation. Multiple rounds add up.',
        '3. Adapt to the story\'s lore: species, magic, monsters, superpowers, hentai physics. Read the character card and the scene, then decide what is "normal" in this world.',
        '4. Omegaverse: an alpha in rut, especially while knotting, produces absurd volumes, from roughly 150 ml up to several litres. Scale it with rut intensity, knot duration, and how hard the text leans into it. Betas sit near the human baseline. Omegas sit below it.',
        '5. Stay consistent with the running total and earlier measurements in this chat.',
        `6. Absurdity level ${absurdity}/10. Higher levels allow cartoonish exaggeration when the text supports it. Never invent volume the text does not imply.`,
        '7. If any participant is, or appears to be, under 18, return happened=false, ml=0 and an empty comment.',
        '',
        `The comment is one short, dry OOC remark in ${language}, at most 120 characters. Clinical, witty, never explicit.`,
        'Reply with JSON only, no prose:',
        '{"happened": boolean, "count": integer, "ml": number, "omegaverse": boolean, "comment": string}',
    ].join('\n');
}

function userPrompt({ card, omegaHint, history, message, totalMl }) {
    return [
        '<character_card>', card || '(none)', '</character_card>',
        `<regex_omegaverse_hint>${omegaHint}</regex_omegaverse_hint>`,
        `<running_total_ml>${Math.round(totalMl)}</running_total_ml>`,
        '<recent_context>', history || '(none)', '</recent_context>',
        '<message_to_measure>', message, '</message_to_measure>',
    ].join('\n');
}

function parse(text) {
    const m = String(text ?? '').match(/\{[\s\S]*\}/);
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

async function post(url, headers, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        if (!res.ok) {
            const detail = (await res.text().catch(() => '')).slice(0, 200);
            throw new Error(`HTTP ${res.status} ${detail}`);
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

const trimSlash = (s) => String(s || '').trim().replace(/\/+$/, '');

async function complete({ provider, baseUrl, model, apiKey }, system, user) {
    if (provider === 'anthropic') {
        const data = await post(`${trimSlash(baseUrl)}/messages`, {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        }, {
            model,
            max_tokens: 300,
            system,
            messages: [{ role: 'user', content: user }],
        });
        return data?.content?.map((c) => c.text ?? '').join('') ?? '';
    }
    const data = await post(`${trimSlash(baseUrl)}/chat/completions`, apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, {
        model,
        temperature: 0.8,
        max_tokens: 300,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    });
    return data?.choices?.[0]?.message?.content ?? '';
}

export async function measure(conn, input) {
    const text = await complete(conn, systemPrompt(input), userPrompt(input));
    return parse(text);
}

export async function ping(conn) {
    const text = await complete(conn, 'Reply with the single word: ok', 'ping');
    return String(text).trim().slice(0, 40);
}
