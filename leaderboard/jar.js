// Site jar: same silhouette as the extension's jar, static and cheap enough to draw
// dozens of times. `frac` 0..1 sets the level; `overflow` adds a dome and drips for #1.

const BODY = 'M35 18 V30 C35 36 28 39 21 43 C14 47 11 53 11 62 V146 C11 156 18 163 28 163 H92 C102 163 109 156 109 146 V62 C109 53 106 47 99 43 C92 39 85 36 85 30 V18 Z';
const INSIDE = 'M37.5 15 V30.5 C37.5 37.5 30.5 41 23.5 45 C17 48.6 13.6 54 13.6 62.5 V144 C13.6 150.5 17.5 155 24 155 H96 C102.5 155 106.4 150.5 106.4 144 V62.5 C106.4 54 103 48.6 96.5 45 C89.5 41 82.5 37.5 82.5 30.5 V15 Z';
const WAVE = 'M0 0 Q20 -2.4 40 0 T80 0 T120 0 T160 0 T200 0 T240 0 T280 0 V200 H0 Z';
const DOME = 'M30.5 21 C28.5 12 39 4.5 50.5 6.5 C55.5 1.5 66 2.5 69.5 6.8 C80.5 4.6 92.5 11.5 89.8 21.5 C89.4 24.6 87.4 25.6 85.8 24 C83 22.6 78 23.4 74.5 24.6 C71 25.8 69 23 64.5 23.4 C60.5 23.8 58.5 26.6 55 25 C51 23.2 48.5 23.6 45 24.8 C41 26 38 23 34.5 24.4 C32 25.4 30.6 23.6 30.5 21 Z';
const DRIPS = [
    'M44 22 C43.4 34 46 48 44.6 60 C44.2 64 41 66 41 70 A4.2 4.2 0 0 0 49.4 70 C49.4 66 46.4 64 46.8 60 C48 48 47.4 34 48 22 Z',
    'M70 22 C70.6 40 69 64 70.2 86 C70.4 90 67.8 92 67.8 95.4 A3.4 3.4 0 0 0 74.6 95.4 C74.6 92 72.2 90 72.4 86 C73.4 64 73 40 73 22 Z',
    'M56 22 C56 26 57.4 29 56.4 32 A4.6 4.6 0 1 0 63.4 32 C62.4 29 63.6 26 63.6 22 Z',
];

const Y_EMPTY = 160;
const Y_FULL = 32;

let seq = 0;

export function jarSvg(frac, { overflow = false, wave = true, label = '' } = {}) {
    const id = `j${++seq}`;
    const f = Math.max(0, Math.min(1, frac));
    const y = Y_EMPTY - f * (Y_EMPTY - Y_FULL);
    return `
<svg class="jar${overflow ? ' jar--over' : ''}" viewBox="0 0 120 172" role="img" aria-label="${label}">
    <defs>
        <clipPath id="${id}c"><path d="${INSIDE}"/></clipPath>
        <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="milk-top"/>
            <stop offset="1" class="milk-bottom"/>
        </linearGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" class="shade-edge"/>
            <stop offset="0.22" class="shade-clear"/>
            <stop offset="0.78" class="shade-clear"/>
            <stop offset="1" class="shade-edge"/>
        </linearGradient>
        <radialGradient id="${id}g" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" class="goo-hi"/>
            <stop offset="1" class="goo-lo"/>
        </radialGradient>
    </defs>
    <ellipse class="jar-shadow" cx="60" cy="166" rx="46" ry="3.6"/>
    <path class="jar-back" d="${BODY}"/>
    <g clip-path="url(#${id}c)">
        <g class="jar-level" style="--y:${y}px">
            <path class="jar-wave jar-wave--back${wave ? '' : ' still'}" d="${WAVE}"/>
            <path class="jar-wave${wave ? '' : ' still'}" d="${WAVE}" fill="url(#${id}m)"/>
            <rect x="0" y="0" width="120" height="200" fill="url(#${id}s)"/>
            <rect class="jar-surface" x="0" y="-1.2" width="120" height="2.4" rx="1.2"/>
        </g>
    </g>
    <path class="jar-glass" d="${BODY}"/>
    <path class="jar-inner" d="${INSIDE}"/>
    <rect class="jar-lip" x="31" y="13" width="58" height="8" rx="4"/>
    <path class="jar-thread" d="M35 25.5 H85 M35 29.5 H85"/>
    <path class="jar-shine" d="M19 66 C17 82 17 118 19.5 140 C20 143.5 23.6 143.4 23.4 140 C21.6 118 21.6 84 23.6 67 C24 63.8 19.5 62.8 19 66 Z"/>
    <path class="jar-shine jar-shine--sm" d="M98 72 C99.4 84 99.4 100 98.4 110 C98.2 112 100.6 112.2 100.8 110 C101.8 100 101.8 84 100.4 72 C100.2 70 97.8 70 98 72 Z"/>
    ${overflow ? `<g class="jar-goo" fill="url(#${id}g)">${DRIPS.map((d) => `<path d="${d}"/>`).join('')}<path d="${DOME}"/><ellipse class="goo-gloss" cx="47" cy="11" rx="7" ry="1.8"/></g>` : ''}
</svg>`;
}

export function miniJars(count, max = 5) {
    const n = Math.min(count, max);
    let html = '';
    for (let i = 0; i < n; i++) html += '<i class="mini"></i>';
    if (count > max) html += `<b class="mini-more">+${count - max}</b>`;
    return html;
}
