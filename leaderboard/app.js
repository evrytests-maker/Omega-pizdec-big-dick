const REFRESH_MS = 30000;

const T = {
    en: {
        title: 'Leaderboard',
        summary: (v, n) => `${v} spilled by ${n} ${n === 1 ? 'player' : 'players'}`,
        search: 'Search',
        empty: 'No one yet.',
        noMatch: 'No one by that name.',
        error: 'Couldn’t load the leaderboard.',
        updated: (s) => (s < 5 ? 'Updated just now' : `Updated ${s} s ago`),
        ml: 'ml', l: 'L', lang: 'RU',
    },
    ru: {
        title: 'Лидерборд',
        summary: (v, n) => `${v} пролито, ${n} ${plural(n, 'игрок', 'игрока', 'игроков')}`,
        search: 'Поиск',
        empty: 'Пока никого.',
        noMatch: 'Никого с таким именем.',
        error: 'Не удалось загрузить лидерборд.',
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
let query = '';
let data = null;
let loadedAt = 0;

// The extension opens this page with ?me=<fingerprint> so your row is highlighted.
// Keep it locally and drop it from the address bar.
(function captureMe() {
    const url = new URL(location.href);
    const me = url.searchParams.get('me');
    if (me) {
        store.set('cm.me', me);
        url.searchParams.delete('me');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
})();

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function vol(ml) {
    const t = T[lang];
    if (ml < 1000) return `${ml.toLocaleString(lang, { maximumFractionDigits: ml < 10 ? 1 : 0 })} ${t.ml}`;
    const l = ml / 1000;
    return `${l.toLocaleString(lang, { maximumFractionDigits: l < 100 ? 2 : l < 1000 ? 1 : 0 })} ${t.l}`;
}

function render() {
    const t = T[lang];
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t[el.dataset.t]; });
    $('.lang').textContent = t.lang;
    $('.search').placeholder = t.search;
    tick();
    if (!data) return;

    $('.summary').textContent = t.summary(vol(data.stats.totalMl), data.stats.players);

    const q = query.trim().toLowerCase();
    const rows = q ? data.rows.filter((r) => r.nick.toLowerCase().includes(q)) : data.rows;
    $('.list').innerHTML = rows.map((r) => `
        <li class="${r.rank <= 3 ? `top top-${r.rank}` : ''}${r.me ? ' me' : ''}">
            <span class="rank">${r.rank}</span>
            <span class="nick">${esc(r.nick)}</span>
            <span class="vol">${vol(r.ml)}</span>
        </li>`).join('');
    $('.note').textContent = !data.rows.length ? t.empty : !rows.length ? t.noMatch : '';
}

function tick() {
    $('.updated').textContent = loadedAt ? T[lang].updated(Math.round((Date.now() - loadedAt) / 1000)) : '';
}

async function load() {
    const me = store.get('cm.me');
    try {
        const res = await fetch(`/api/top?limit=100${me ? `&me=${encodeURIComponent(me)}` : ''}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        data = { rows: json.rows || [], me: json.me, stats: json.stats || { players: 0, totalMl: 0 } };
        loadedAt = Date.now();
    } catch {
        if (!data) $('.note').textContent = T[lang].error;
        return;
    }
    render();
}

$('.lang').addEventListener('click', () => {
    lang = lang === 'ru' ? 'en' : 'ru';
    store.set('cm.lang', lang);
    render();
});
$('.search').addEventListener('input', (e) => {
    query = e.target.value;
    render();
});

render();
load();
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
setInterval(tick, 5000);
