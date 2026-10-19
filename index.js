import { triggers, looksOmegaverse, heuristicMl } from './src/detect.js';
import { measure, ping, listProfiles } from './src/llm.js';
import { buildMessages } from './src/prompt.js';
import { strings, resolveLang, COMPARISONS, ACHIEVEMENTS, QUIPS } from './src/i18n.js';
import { Jar, JAR_SVG, MINI_JAR_SVG, split } from './src/jar.js';
import { submit as submitSealed, boardUrl } from './src/board.js';

const MODULE = 'cumometer';
// Earlier versions kept a raw API key here; it is wiped on load (see init).
const LS_LEGACY_API_KEY = 'cumometer.apiKey';
const LS_USER_KEY = 'cumometer.userKey';

const DEFAULTS = {
    enabled: true,
    showPill: true,
    showComments: true,
    lang: 'auto',
    theme: 'auto',
    liquidGlass: true,
    jarSize: 3000,
    scanUser: false,
    // Connection Manager profile id for the OOC model; empty = regex + offline estimate.
    profileId: '',
    leaderboardUrl: '',
    nickname: '',
    // charKey -> { name, chats: { chatId: ml } }
    chars: {},
};

const ctx = () => SillyTavern.getContext();

// ───────────────────────── storage ─────────────────────────

function settings() {
    const all = ctx().extensionSettings;
    all[MODULE] ??= {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (all[MODULE][k] === undefined) all[MODULE][k] = structuredClone(v);
    }
    return all[MODULE];
}

const save = () => ctx().saveSettingsDebounced();

function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }


function userKey() {
    let k = lsGet(LS_USER_KEY);
    if (!k) {
        k = crypto.randomUUID();
        lsSet(LS_USER_KEY, k);
    }
    return k;
}

function chatMeta() {
    const md = ctx().chatMetadata;
    if (!md) return null;
    md[MODULE] ??= { entries: {}, achievements: [] };
    md[MODULE].entries ??= {};
    md[MODULE].achievements ??= [];
    return md[MODULE];
}

// Entries are keyed by a hash of the message text, so swipes, edits and
// deletions are reflected automatically: only text present in the chat counts.
function hash(text) {
    let h = 0x811c9dc5;
    const s = String(text ?? '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

// ───────────────────────── characters ─────────────────────────

function resolveChar(msg) {
    const c = ctx();
    let ch = null;
    if (msg?.original_avatar) ch = c.characters.find((x) => x.avatar === msg.original_avatar);
    if (!ch && msg?.name) ch = c.characters.find((x) => x.name === msg.name);
    if (!ch && c.characterId !== undefined) ch = c.characters[c.characterId];
    const name = ch?.name || msg?.name || c.name2 || 'Character';
    return { key: ch?.avatar || name, name, data: ch };
}

function cardText(ch) {
    if (!ch) return '';
    const parts = [ch.description, ch.personality, ch.scenario, ch.data?.creator_notes, (ch.tags || ch.data?.tags || []).join(', ')];
    return parts.filter(Boolean).join('\n').slice(0, 2500);
}

// ───────────────────────── accounting ─────────────────────────

function compute() {
    const c = ctx();
    const meta = chatMeta();
    const res = { total: 0, episodes: 0, perChar: {}, last: null };
    if (!meta || !Array.isArray(c.chat)) return res;
    for (const msg of c.chat) {
        const e = meta.entries[hash(msg.mes)];
        if (!e || !(e.ml > 0)) continue;
        res.total += e.ml;
        res.episodes += 1;
        res.perChar[e.char] = (res.perChar[e.char] || 0) + e.ml;
        if (!res.last || (e.ts || 0) > (res.last.ts || 0)) res.last = e;
    }
    return res;
}

function syncCharTotals(stats) {
    const s = settings();
    const chatId = ctx().getCurrentChatId?.();
    if (!chatId) return;
    for (const rec of Object.values(s.chars)) delete rec.chats?.[chatId];
    for (const [key, ml] of Object.entries(stats.perChar)) {
        const rec = (s.chars[key] ??= { name: key, chats: {} });
        rec.name = ctx().characters.find((x) => x.avatar === key)?.name || rec.name;
        rec.chats[chatId] = ml;
    }
    save();
}

const charTotal = (key) => Object.values(settings().chars[key]?.chats || {}).reduce((a, b) => a + b, 0);
const grandTotal = () => Object.keys(settings().chars).reduce((a, k) => a + charTotal(k), 0);

function pruneEntries(meta) {
    const live = new Set(ctx().chat.map((m) => hash(m.mes)));
    for (const k of Object.keys(meta.entries)) if (!live.has(k)) delete meta.entries[k];
}

// ───────────────────────── measuring ─────────────────────────

let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn).catch((e) => console.error('[Cumometer]', e)));

let apiWarned = false;

async function processIndex(i, { force = false } = {}) {
    const s = settings();
    if (!s.enabled) return;
    const c = ctx();
    const msg = c.chat?.[i];
    if (!msg || msg.is_system) return;
    if (msg.is_user && !s.scanUser) return;

    const meta = chatMeta();
    const text = msg.mes;
    const h = hash(text);
    if (!force && meta.entries[h] !== undefined) return;
    if (!triggers(text)) {
        delete meta.entries[h];
        return;
    }

    const chatId = c.getCurrentChatId?.();
    const lang = resolveLang(s.lang);
    const ch = resolveChar(msg);
    const card = cardText(ch.data);
    const history = c.chat.slice(Math.max(0, i - 4), i)
        .map((m) => `${m.name}: ${String(m.mes).slice(0, 600)}`).join('\n\n');
    const omegaHint = looksOmegaverse(card + '\n' + history + '\n' + text);

    let res = null;
    if (s.profileId) {
        try {
            const chid = ch.data ? c.characters.indexOf(ch.data) : undefined;
            const messages = await buildMessages({ index: i, chid: chid >= 0 ? chid : undefined, charName: ch.name, totalMl: compute().total, omegaHint, lang });
            res = await measure(s.profileId, messages);
        } catch (e) {
            console.warn('[Cumometer] OOC model failed:', e);
            if (!apiWarned) {
                apiWarned = true;
                toastr.warning(String(e.message || e).slice(0, 140), strings(lang).apiFail);
            }
        }
    }
    if (!res) {
        const pool = QUIPS[lang];
        res = {
            happened: true,
            ml: heuristicMl(text, { omega: omegaHint }),
            comment: pool[Math.floor(Math.random() * pool.length)],
        };
    }

    // The chat may have been switched while we were waiting on the model.
    if (ctx().getCurrentChatId?.() !== chatId) return;

    chatMeta().entries[h] = res.happened
        ? { ml: Math.round(res.ml * 10) / 10, note: res.comment, char: ch.key, ts: Date.now() }
        : { ml: 0, char: ch.key };
    await ctx().saveMetadata();
    refresh();
    if (res.happened && !force) announce(res.ml, res.comment);
}

async function recountChat() {
    const meta = chatMeta();
    if (!meta) return;
    const L = strings(resolveLang(settings().lang));
    toastr.info(L.recounting);
    meta.entries = {};
    const n = ctx().chat.length;
    for (let i = 0; i < n; i++) await processIndex(i, { force: true });
    pruneEntries(meta);
    await ctx().saveMetadata();
    refresh();
}

async function resetChat() {
    const L = strings(resolveLang(settings().lang));
    if (!confirm(L.resetConfirm)) return;
    const meta = chatMeta();
    if (!meta) return;
    meta.entries = {};
    meta.achievements = [];
    await ctx().saveMetadata();
    refresh();
}

// ───────────────────────── formatting ─────────────────────────

function fmt(ml, L) {
    const n = (v, d) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: Number.isInteger(v) ? 0 : d });
    if (ml < 1000) return { value: n(ml, ml < 10 ? 1 : 0), unit: L.unitMl };
    const l = ml / 1000;
    return { value: n(l, l < 100 ? 2 : 0), unit: L.unitL };
}

const fmtStr = (ml, L) => { const f = fmt(ml, L); return `${f.value} ${f.unit}`; };

function compare(ml, lang) {
    if (ml <= 0) return '';
    let pick = COMPARISONS[0];
    for (const c of COMPARISONS) if (ml >= c.ml) pick = c;
    const ratio = ml / pick.ml;
    return `≈ ${ratio.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${pick[lang]}`;
}

// ───────────────────────── UI ─────────────────────────

let root = null;
let jar = null;
let jarChatId = null;
let shownTotal = 0;
let animFrame = 0;
let toastTimer = 0;

function applyTheme() {
    if (!root) return;
    const s = settings();
    root.dataset.theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : '';
    root.classList.toggle('cm-liquid', Boolean(s.liquidGlass));
}

// Liquid Glass refraction: a displacement map bends whatever sits behind the surface.
// Chromium applies SVG filters inside backdrop-filter; elsewhere CSS falls back to frosted glass.
const LIQUID_FILTER = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    <filter id="cm-liquid-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise"/>
        <feGaussianBlur in="noise" stdDeviation="2.5" result="soft"/>
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
</svg>`;

function trackSpecular(el) {
    el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--cm-mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty('--cm-my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
    el.addEventListener('pointerleave', () => {
        el.style.removeProperty('--cm-mx');
        el.style.removeProperty('--cm-my');
    });
}

function buildPill() {
    root = document.createElement('div');
    root.id = 'cm-root';
    root.innerHTML = `${LIQUID_FILTER}
        <button class="cm-pill" type="button" aria-expanded="false">
            <span class="cm-drop">${MINI_JAR_SVG}</span>
            <span class="cm-pill-value">0</span><span class="cm-pill-unit"></span>
        </button>
        <div class="cm-toast" role="status" aria-live="polite">
            <div class="cm-toast-delta"></div>
            <div class="cm-toast-note"></div>
        </div>
        <div class="cm-card" hidden>
            <div class="cm-top">
                <div class="cm-top-text">
                    <div class="cm-eyebrow cm-l-thisChat"></div>
                    <div class="cm-hero"><span class="cm-hero-value">0</span><span class="cm-hero-unit"></span></div>
                    <div class="cm-compare"></div>
                    <div class="cm-jar-meta"></div>
                    <div class="cm-jar-shelf" hidden></div>
                </div>
                <div class="cm-jar-stage">${JAR_SVG}</div>
            </div>
            <div class="cm-ach"></div>
            <dl class="cm-rows">
                <div><dt class="cm-l-allTime"></dt><dd class="cm-all"></dd></div>
                <div><dt class="cm-l-episodes"></dt><dd class="cm-eps"></dd></div>
            </dl>
            <div class="cm-last"></div>
            <div class="cm-actions">
                <button type="button" class="cm-btn cm-recount"></button>
                <button type="button" class="cm-btn cm-reset"></button>
                <button type="button" class="cm-btn cm-btn-primary cm-submit"></button>
            </div>
        </div>`;
    document.body.appendChild(root);
    jar = new Jar(root.querySelector('.cm-jar-stage'), root.querySelector('.cm-jar-shelf'));

    const pill = root.querySelector('.cm-pill');
    const card = root.querySelector('.cm-card');
    trackSpecular(pill);
    trackSpecular(card);
    pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = card.hidden;
        card.hidden = !open;
        pill.setAttribute('aria-expanded', String(open));
        root.classList.toggle('cm-open', open);
        if (open) hideToast();
    });
    document.addEventListener('click', (e) => {
        if (!card.hidden && !root.contains(e.target)) {
            card.hidden = true;
            pill.setAttribute('aria-expanded', 'false');
            root.classList.remove('cm-open');
        }
    });
    root.querySelector('.cm-recount').addEventListener('click', () => enqueue(recountChat));
    root.querySelector('.cm-reset').addEventListener('click', () => enqueue(resetChat));
    root.querySelector('.cm-submit').addEventListener('click', submitLeaderboard);
    applyTheme();
}

function animateTo(target, L) {
    cancelAnimationFrame(animFrame);
    const from = shownTotal;
    const start = performance.now();
    const dur = 900;
    const valueEl = root.querySelectorAll('.cm-pill-value, .cm-hero-value');
    const unitEl = root.querySelectorAll('.cm-pill-unit, .cm-hero-unit');
    const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        shownTotal = from + (target - from) * eased;
        const f = fmt(shownTotal, L);
        valueEl.forEach((el) => (el.textContent = f.value));
        unitEl.forEach((el) => (el.textContent = f.unit));
        if (p < 1) animFrame = requestAnimationFrame(step);
    };
    animFrame = requestAnimationFrame(step);
}

function refresh() {
    const s = settings();
    if (!root) return;
    root.style.display = s.enabled && s.showPill && ctx().getCurrentChatId?.() ? '' : 'none';
    applyTheme();

    const lang = resolveLang(s.lang);
    const L = strings(lang);
    const stats = compute();
    syncCharTotals(stats);

    for (const k of ['thisChat', 'allTime', 'episodes']) {
        root.querySelectorAll(`.cm-l-${k}`).forEach((el) => (el.textContent = L[k]));
    }
    root.querySelector('.cm-recount').textContent = L.recount;
    root.querySelector('.cm-reset').textContent = L.reset;
    root.querySelector('.cm-submit').textContent = L.submit;
    root.querySelector('.cm-submit').hidden = !s.leaderboardUrl;

    animateTo(stats.total, L);
    root.querySelector('.cm-compare').textContent = stats.total > 0 ? compare(stats.total, lang) : L.nothing;

    const main = resolveChar(ctx().chat?.findLast?.((m) => !m.is_user) || null);
    root.querySelector('.cm-l-allTime').textContent = `${L.allTime} · ${main.name}`;
    root.querySelector('.cm-all').textContent = fmtStr(charTotal(main.key), L);
    root.querySelector('.cm-eps').textContent = String(stats.episodes);

    // Jar: animate only within one chat; switching chats snaps to the new level.
    const capacity = Number(s.jarSize) || DEFAULTS.jarSize;
    const chatId = ctx().getCurrentChatId?.() || null;
    jar.set(stats.total, capacity, { animate: chatId === jarChatId });
    jarChatId = chatId;
    const part = split(stats.total, capacity);
    root.querySelector('.cm-jar-meta').textContent = `${L.jar} ${part.jars + 1} · ${fmtStr(part.rest, L)} / ${fmtStr(capacity, L)}`;
    const mini = root.querySelector('.cm-mini-fill');
    mini.setAttribute('y', String(15.6 - (part.frac > 0 ? Math.max(part.frac, 0.08) : 0) * 13));

    const next = ACHIEVEMENTS.find((a) => a.ml > stats.total);
    const prev = [...ACHIEVEMENTS].reverse().find((a) => a.ml <= stats.total);
    root.querySelector('.cm-ach').textContent = next
        ? `${prev ? prev[lang] + ' · ' : ''}${L.next}: ${next[lang]} (${fmtStr(next.ml, L)})`
        : prev?.[lang] || '';

    const lastEl = root.querySelector('.cm-last');
    lastEl.hidden = !(stats.last && s.showComments && stats.last.note);
    if (stats.last) lastEl.innerHTML = `<span class="cm-last-delta">+${fmtStr(stats.last.ml, L)}</span> ${escapeHtml(stats.last.note || '')}`;

    checkAchievements(stats.total, lang);
}

function checkAchievements(total, lang) {
    const meta = chatMeta();
    if (!meta) return;
    const L = strings(lang);
    const fresh = ACHIEVEMENTS.filter((a) => total >= a.ml && !meta.achievements.includes(a.ml));
    if (!fresh.length) return;
    meta.achievements.push(...fresh.map((a) => a.ml));
    // Several thresholds can fall at once (one omegaverse knot is worth a lot); show only the top one.
    toastr.success(fresh[fresh.length - 1][lang], L.achievement, { timeOut: 4000 });
    ctx().saveMetadata();
}

function announce(ml, comment) {
    const s = settings();
    if (!root || !s.showPill || root.classList.contains('cm-open')) return;
    const L = strings(resolveLang(s.lang));
    const capacity = Number(s.jarSize) || DEFAULTS.jarSize;
    const total = compute().total;
    const filled = Math.floor(total / capacity);
    const overflowed = filled > Math.floor((total - ml) / capacity);
    root.querySelector('.cm-toast-delta').textContent = `+${fmtStr(ml, L)}${overflowed ? ` · ${L.jarFull(filled)}` : ''}`;
    const note = root.querySelector('.cm-toast-note');
    note.textContent = s.showComments ? comment || '' : '';
    note.hidden = !note.textContent;
    root.classList.add('cm-toasting');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6500);
}

function hideToast() {
    root?.classList.remove('cm-toasting');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ───────────────────────── leaderboard ─────────────────────────

async function submitLeaderboard() {
    const s = settings();
    const L = strings(resolveLang(s.lang));
    if (!s.leaderboardUrl) return toastr.warning(L.noBoard);
    const nick = (s.nickname || '').trim() || `anon-${userKey().slice(0, 4)}`;
    const ml = Math.round(grandTotal() * 10) / 10;
    if (!confirm(L.submitConfirm(nick, fmtStr(ml, L)))) return;
    try {
        const data = await submitSealed(s.leaderboardUrl, { nick, ml, localKey: userKey() });
        toastr.success(L.submitted(data.rank), L.board);
    } catch (e) {
        toastr.error(e.code === 'nick_taken' ? L.nickTaken : String(e.message || e), L.board);
    }
}

// ───────────────────────── settings panel ─────────────────────────

// iOS-style grouped settings. Colours derive from the active SillyTavern theme
// (--SmartThemeBodyColor), so the panel looks native on any theme.
function renderSettings() {
    const s = settings();
    const L = strings(resolveLang(s.lang));
    const esc = escapeHtml;
    const profiles = listProfiles();
    // A deleted profile must not keep sending requests.
    if (profiles && s.profileId && !profiles.some((p) => p.id === s.profileId)) {
        s.profileId = '';
        save();
    }

    const toggle = (k, label) => `
        <label class="cm-s-row">
            <span class="cm-s-label">${label}</span>
            <input type="checkbox" class="cm-s-switch" data-k="${k}" ${s[k] ? 'checked' : ''}>
        </label>`;
    const seg = (k, label, options, num = false) => `
        <div class="cm-s-row cm-s-row--seg">
            <span class="cm-s-label">${label}</span>
            <div class="cm-s-seg" data-k="${k}" ${num ? 'data-num' : ''} role="radiogroup">
                ${options.map(([v, t]) => `<button type="button" role="radio" data-v="${v}" aria-checked="${String(s[k]) === String(v)}">${t}</button>`).join('')}
            </div>
        </div>`;
    const field = (k, label, { type = 'text', placeholder = '', value = s[k], cls = '', max = '' } = {}) => `
        <label class="cm-s-row">
            <span class="cm-s-label">${label}</span>
            <input class="cm-s-input ${cls}" type="${type}" ${k ? `data-k="${k}"` : ''} value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" ${max ? `maxlength="${max}"` : ''} autocomplete="off" spellcheck="false">
        </label>`;
    const group = (title, rows, footer = '') => `
        <section class="cm-s-group">
            ${title ? `<h4 class="cm-s-title">${title}</h4>` : ''}
            <div class="cm-s-card">${rows}</div>
            ${footer ? `<p class="cm-s-foot">${footer}</p>` : ''}
        </section>`;

    const html = `
    <div class="cm-settings inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Cumometer</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="cm-s">
                <div class="cm-s-hero">
                    <div class="cm-s-icon">${MINI_JAR_SVG}</div>
                    <div>
                        <div class="cm-s-name">Cumometer</div>
                        <div class="cm-s-sub">${L.sTagline}</div>
                    </div>
                    <input type="checkbox" class="cm-s-switch" data-k="enabled" ${s.enabled ? 'checked' : ''} aria-label="${L.sEnabled}">
                </div>

                ${group(L.sDisplay, `
                    ${toggle('showPill', L.sPill)}
                    ${toggle('showComments', L.sComments)}
                    ${toggle('liquidGlass', L.sGlass)}
                    ${seg('theme', L.sTheme, [['auto', L.auto], ['light', L.light], ['dark', L.dark]])}
                    ${seg('lang', L.sLang, [['auto', L.auto], ['en', 'EN'], ['ru', 'RU']])}
                    ${seg('jarSize', L.sJar, [500, 1000, 3000, 10000].map((v) => [v, fmtStr(v, L)]), true)}
                `)}

                ${group(L.sModel, profiles === null ? `
                    <div class="cm-s-row"><span class="cm-s-label cm-s-dim">${L.sCmOff}</span></div>
                ` : `
                    <label class="cm-s-row">
                        <span class="cm-s-label">${L.sProfile}</span>
                        <span class="cm-s-menu">
                            <select class="cm-s-select" data-k="profileId">
                                <option value="">${L.sProfileNone}</option>
                                ${profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === s.profileId ? 'selected' : ''}>${esc(p.name || p.id)}${p.model ? ` · ${esc(p.model)}` : ''}</option>`).join('')}
                            </select>
                        </span>
                    </label>
                    <button type="button" class="cm-s-row cm-s-action cm-test" ${s.profileId ? '' : 'disabled'}>
                        <span>${L.sTest}</span><span class="cm-test-out" aria-live="polite"></span>
                    </button>
                `, profiles === null ? '' : L.sProfileHint)}

                ${group(L.sMeasure, `
                    ${toggle('scanUser', L.sScanUser)}
                `)}

                ${group(L.sBoard, `
                    ${field('nickname', L.sNick, { placeholder: 'anon', max: 24 })}
                    ${field('leaderboardUrl', L.sBoardUrl, { type: 'url', placeholder: 'https://….vercel.app' })}
                    <div class="cm-s-row cm-s-buttons">
                        <button type="button" class="cm-s-btn cm-s-btn--primary cm-submit-s">${L.sSubmit}</button>
                        <button type="button" class="cm-s-btn cm-open-board">${L.sOpen}</button>
                    </div>
                `, L.sBoardHint)}
            </div>
        </div>
    </div>`;

    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    const wasOpen = host.querySelector('.cm-settings .inline-drawer-content')?.style.display === 'block';
    host.querySelector('.cm-settings')?.remove();
    host.insertAdjacentHTML('beforeend', html);
    const panel = host.querySelector('.cm-settings');
    if (wasOpen) {
        panel.querySelector('.inline-drawer-content').style.display = 'block';
        panel.querySelector('.inline-drawer-icon').classList.replace('down', 'up');
    }

    const commit = (k) => {
        save();
        if (k === 'lang' || k === 'profileId') renderSettings();
        refresh();
    };

    panel.querySelectorAll('input[data-k], select[data-k]').forEach((el) => {
        el.addEventListener('change', () => {
            s[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim();
            commit(el.dataset.k);
        });
    });
    panel.querySelectorAll('.cm-s-seg').forEach((segEl) => {
        segEl.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-v]');
            if (!b) return;
            const k = segEl.dataset.k;
            s[k] = segEl.dataset.num !== undefined ? Number(b.dataset.v) : b.dataset.v;
            segEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
            commit(k);
        });
    });
    panel.querySelector('.cm-test')?.addEventListener('click', async () => {
        const out = panel.querySelector('.cm-test-out');
        out.className = 'cm-test-out is-busy';
        out.textContent = '…';
        try {
            const r = await ping(s.profileId);
            out.className = 'cm-test-out is-ok';
            out.textContent = `✓ ${r}`;
        } catch (e) {
            out.className = 'cm-test-out is-err';
            out.textContent = `✕ ${String(e.message || e).slice(0, 80)}`;
        }
    });
    panel.querySelector('.cm-submit-s').addEventListener('click', submitLeaderboard);
    panel.querySelector('.cm-open-board').addEventListener('click', async () => {
        if (s.leaderboardUrl) window.open(await boardUrl(s.leaderboardUrl, userKey()), '_blank', 'noopener');
    });
}

// ───────────────────────── boot ─────────────────────────

(function init() {
    const { eventSource, event_types } = ctx();
    settings();
    userKey();
    try { localStorage.removeItem(LS_LEGACY_API_KEY); } catch { /* private mode */ }
    buildPill();
    renderSettings();
    for (const ev of ['CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_DELETED', 'CONNECTION_PROFILE_UPDATED']) {
        if (event_types[ev]) eventSource.on(event_types[ev], () => renderSettings());
    }

    // Refresh even when the text was measured before: a repeated reply still counts again.
    const onMessage = (id) => enqueue(async () => {
        await processIndex(Number(id));
        refresh();
    });
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessage);
    eventSource.on(event_types.MESSAGE_EDITED, onMessage);
    for (const ev of [event_types.MESSAGE_SWIPED, event_types.MESSAGE_DELETED, event_types.CHAT_CHANGED]) {
        eventSource.on(ev, () => enqueue(async () => {
            shownTotal = ev === event_types.CHAT_CHANGED ? 0 : shownTotal;
            refresh();
        }));
    }
    // Deleted chats and characters must stop counting toward all-time totals.
    const forgetChat = (chatId) => {
        for (const rec of Object.values(settings().chars)) delete rec.chats?.[chatId];
        save();
        refresh();
    };
    eventSource.on(event_types.CHAT_DELETED, forgetChat);
    eventSource.on(event_types.GROUP_CHAT_DELETED, forgetChat);
    eventSource.on(event_types.CHARACTER_DELETED, (data) => {
        const avatar = data?.character?.avatar;
        if (avatar) delete settings().chars[avatar];
        save();
    });
    refresh();
})();
