import { jarSvg, miniJars } from './jar.js';

const JAR_ML = 3000; // the extension's default jar: a classic three-litre jar
const REFRESH_MS = 30000;

const T = {
    en: {
        navBoard: 'Leaderboard', navHow: 'How it works', getIt: 'Get the extension',
        live: 'Live', headline: 'Who filled the most jars.',
        lede: 'The public leaderboard of Cumometer, the SillyTavern extension that measures every roleplay with a perfectly straight face.',
        statTotal: 'Spilled in total', statJars: 'Three-litre jars filled', statPlayers: 'Players',
        boardTitle: 'Leaderboard', tabPlayers: 'Players', tabChars: 'Characters', search: 'Search',
        colName: 'Name', colJars: 'Jars', colVolume: 'Volume',
        howTitle: 'How it works.',
        how1t: 'Install', how1: 'Add the extension in SillyTavern: Extensions → Install extension → paste the GitHub link.',
        how2t: 'Roleplay', how2: 'A regex notices the moment, a small OOC model measures it. Omegaverse alphas are measured accordingly.',
        how3t: 'Submit', how3: 'Pick a nickname and press Submit. Your total lands here. That is the only time anything leaves your browser.',
        privacy: 'Only your nickname, your total and your top character are sent, and only when you press Submit. Your key never leaves your browser in readable form.',
        footer: 'Cumometer · made for SillyTavern · not affiliated with anyone sensible.',
        you: (r) => `You are #${r}`, players: (n) => `${n} ${n === 1 ? 'player' : 'players'}`,
        jars: (n) => `${n} ${n === 1 ? 'jar' : 'jars'}`, topChar: 'Top character',
        empty: 'Nothing yet. Be the first to fill a jar.', noMatch: 'No one by that name.',
        error: 'Couldn’t load the leaderboard.', retry: 'Try again',
        updated: (s) => (s < 5 ? 'Updated just now' : `Updated ${s}s ago`),
        ml: 'ml', l: 'L', lang: 'RU',
    },
    ru: {
        navBoard: 'Лидерборд', navHow: 'Как это работает', getIt: 'Установить',
        live: 'В эфире', headline: 'Кто наполнил больше всех банок.',
        lede: 'Публичный лидерборд Cumometer — расширения для SillyTavern, которое с каменным лицом измеряет каждую ролку.',
        statTotal: 'Пролито всего', statJars: 'Трёхлитровых банок', statPlayers: 'Игроков',
        boardTitle: 'Лидерборд', tabPlayers: 'Игроки', tabChars: 'Персонажи', search: 'Поиск',
        colName: 'Имя', colJars: 'Банки', colVolume: 'Объём',
        howTitle: 'Как это работает.',
        how1t: 'Установите', how1: 'В SillyTavern: Extensions → Install extension → вставьте ссылку на GitHub.',
        how2t: 'Играйте', how2: 'Регекс замечает момент, маленькая OOC-модель измеряет. Альфы из омегаверса измеряются соответственно.',
        how3t: 'Отправьте', how3: 'Выберите ник и нажмите «Отправить». Итог появится здесь. Только в этот момент что-то покидает ваш браузер.',
        privacy: 'Отправляются только ник, общий итог и топ-персонаж — и только по нажатию «Отправить». Ваш ключ никогда не уходит из браузера в открытом виде.',
        footer: 'Cumometer · сделано для SillyTavern · ни с кем приличным не связано.',
        you: (r) => `Вы на #${r} месте`, players: (n) => `${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`,
        jars: (n) => `${n} ${plural(n, 'банка', 'банки', 'банок')}`, topChar: 'Топ-персонаж',
        empty: 'Пока пусто. Наполните первую банку.', noMatch: 'Никого с таким именем.',
        error: 'Не удалось загрузить лидерборд.', retry: 'Повторить',
        updated: (s) => (s < 5 ? 'Обновлено только что' : `Обновлено ${s} с назад`),
        ml: 'мл', l: 'л', lang: 'EN',
    },
};

function plural(n, one, few, many) {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
}

const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let lang = store.get('cm.lang') || (/^(ru|uk|be)/i.test(navigator.language) ? 'ru' : 'en');
let view = 'players';
let query = '';
let data = null;
let loadedAt = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The extension opens this page with ?me=<key> so your row can be highlighted.
// Keep it locally and drop it from the address bar so it doesn't end up in screenshots.
(function captureMe() {
    const url = new URL(location.href);
    const me = url.searchParams.get('me');
    if (me) {
        store.set('cm.me', me);
        url.searchParams.delete('me');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
})();

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function vol(ml) {
    const t = T[lang];
    if (ml < 1000) return { n: ml.toLocaleString(lang, { maximumFractionDigits: ml < 10 ? 1 : 0 }), u: t.ml };
    const l = ml / 1000;
    return { n: l.toLocaleString(lang, { maximumFractionDigits: l < 100 ? 2 : l < 1000 ? 1 : 0 }), u: t.l };
}
const volStr = (ml) => { const v = vol(ml); return `${v.n} ${v.u}`; };

function hue(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 360;
}

function avatar(name) {
    const initial = esc([...String(name).trim()][0]?.toUpperCase() || '?');
    const h = hue(name);
    return `<span class="avatar" style="--h:${h}">${initial}</span>`;
}

// ── i18n ──
function applyLang() {
    const t = T[lang];
    document.documentElement.lang = lang;
    $$('[data-t]').forEach((el) => { el.textContent = t[el.dataset.t]; });
    $$('[data-t-placeholder]').forEach((el) => { el.placeholder = t[el.dataset.tPlaceholder]; });
    $('.lang').textContent = t.lang;
    if (data) render();
}

// ── stats ──
function countUp(el, to, format) {
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (reduceMotion || from === to) { el.textContent = format(to); return; }
    const t0 = performance.now();
    const step = (now) => {
        const p = Math.min(1, (now - t0) / 1200);
        el.textContent = format(from + (to - from) * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function renderStats() {
    const { totalMl, players } = data.stats;
    const v = vol(totalMl);
    const big = totalMl >= 1000;
    countUp($('[data-stat="total"]'), big ? totalMl / 1000 : totalMl,
        (x) => x.toLocaleString(lang, { maximumFractionDigits: big && x < 100 ? 1 : 0 }));
    $('[data-stat="totalUnit"]').textContent = v.u;
    countUp($('[data-stat="jars"]'), Math.floor(totalMl / JAR_ML), (x) => Math.round(x).toLocaleString(lang));
    countUp($('[data-stat="players"]'), players, (x) => Math.round(x).toLocaleString(lang));

    const jars = Math.floor(totalMl / JAR_ML);
    $('.hero-jar').innerHTML = jarSvg(jars ? 1 : totalMl / JAR_ML, { overflow: jars > 0 });

    const you = $('.you');
    you.hidden = !data.me;
    if (data.me) you.textContent = T[lang].you(data.me.rank);
}

// ── board ──
function entries() {
    if (view === 'players') {
        return data.rows.map((r) => ({
            key: r.nick, name: r.nick, ml: r.ml, me: r.me,
            sub: r.topChar ? `${r.topChar} · ${volStr(r.topCharMl)}` : '',
        }));
    }
    const byChar = new Map();
    for (const r of data.rows) {
        if (!r.topChar) continue;
        const k = r.topChar.trim().toLowerCase();
        const e = byChar.get(k) || { key: k, name: r.topChar.trim(), ml: 0, players: 0 };
        e.ml += r.topCharMl;
        e.players += 1;
        byChar.set(k, e);
    }
    return [...byChar.values()]
        .sort((a, b) => b.ml - a.ml)
        .map((e) => ({ ...e, sub: T[lang].players(e.players) }));
}

function jarsCell(ml) {
    const full = Math.floor(ml / JAR_ML);
    const part = (ml % JAR_ML) / JAR_ML;
    return `${miniJars(full)}<i class="mini mini--part" style="--f:${Math.max(part, ml > 0 ? 0.06 : 0)}"></i>`;
}

function podium(list) {
    const top = list.slice(0, 3);
    if (!top.length) return '';
    const order = [top[1], top[0], top[2]].filter(Boolean);
    return order.map((e) => {
        const rank = list.indexOf(e) + 1;
        const jars = Math.floor(e.ml / JAR_ML);
        const v = vol(e.ml);
        return `
        <article class="place place--${rank}${e.me ? ' is-me' : ''}">
            <div class="place-jar">${jarSvg(jars ? 1 : e.ml / JAR_ML, { overflow: jars > 0, wave: !reduceMotion, label: volStr(e.ml) })}</div>
            <span class="place-rank">${rank}</span>
            <h3 class="place-name">${esc(e.name)}</h3>
            <p class="place-sub">${esc(e.sub)}</p>
            <p class="place-vol"><span>${v.n}</span> ${v.u}</p>
            <p class="place-jars">${T[lang].jars(jars)}</p>
        </article>`;
    }).join('');
}

function row(e, rank) {
    const v = vol(e.ml);
    return `
    <div class="row${e.me ? ' is-me' : ''}" role="row">
        <span class="rank" role="cell">${rank}</span>
        <span class="who" role="cell">${avatar(e.name)}<span class="who-text"><b>${esc(e.name)}</b><small>${esc(e.sub)}</small></span></span>
        <span class="col-jars" role="cell">${jarsCell(e.ml)}</span>
        <span class="col-vol" role="cell"><b>${v.n}</b> ${v.u}</span>
    </div>`;
}

function renderBoard() {
    const t = T[lang];
    const list = entries();
    const q = query.trim().toLowerCase();
    const searching = q.length > 0;
    const shown = searching ? list.filter((e) => e.name.toLowerCase().includes(q) || e.sub.toLowerCase().includes(q)) : list;

    $('.podium').innerHTML = searching ? '' : podium(list);
    $('.podium').hidden = searching || !list.length;

    const rest = searching ? shown : list.slice(3);
    const rows = $('.rows');
    if (!list.length) rows.innerHTML = `<p class="empty">${t.empty}</p>`;
    else if (!shown.length) rows.innerHTML = `<p class="empty">${t.noMatch}</p>`;
    else rows.innerHTML = rest.map((e) => row(e, list.indexOf(e) + 1)).join('');
    $('.table').hidden = list.length > 0 && rest.length === 0 && !searching;
}

function render() {
    renderStats();
    renderBoard();
    tick();
}

function tick() {
    if (!loadedAt) return;
    $('.updated').textContent = T[lang].updated(Math.round((Date.now() - loadedAt) / 1000));
}

async function load() {
    const me = store.get('cm.me');
    try {
        const res = await fetch(`/api/top?limit=100${me ? `&me=${encodeURIComponent(me)}` : ''}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        data = { rows: json.rows || [], me: json.me, stats: json.stats || { players: (json.rows || []).length, totalMl: 0 } };
        loadedAt = Date.now();
        document.body.classList.remove('is-error');
        render();
    } catch {
        if (data) return; // keep showing the last good board
        document.body.classList.add('is-error');
        $('.rows').innerHTML = `<p class="empty">${T[lang].error} <button type="button" class="link retry">${T[lang].retry}</button></p>`;
        $('.retry')?.addEventListener('click', load);
    }
}

// ── wire up ──
applyLang();
$('.lang').addEventListener('click', () => {
    lang = lang === 'ru' ? 'en' : 'ru';
    store.set('cm.lang', lang);
    applyLang();
});
$$('.segmented [data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    $$('.segmented [data-view]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $('.segmented').dataset.active = view;
    if (data) renderBoard();
}));
$('.search input').addEventListener('input', (e) => {
    query = e.target.value;
    if (data) renderBoard();
});
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 8), { passive: true });

load();
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
setInterval(tick, 5000);
