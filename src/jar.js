// The jar: an open glass jar filled with milky liquid. When a measurement pushes it
// past capacity, the liquid rises over the rim, runs down the walls, the full jar
// moves to the shelf and a fresh one fills with the remainder.

const Y_EMPTY = 160;
const Y_FULL = 32;
const Y_BRIM = 20;
const MIN_FILM = 0.025;
const SHELF_ICONS = 5;

// Geometry (viewBox 120×172). The glass has real thickness: BODY is the outer surface,
// INSIDE the cavity the liquid is clipped to; the gap between them is the wall and the
// heavy base. Outlines are open at the top so no stroke crosses the mouth under the lip.
const BODY_OPEN = 'M35 18 V30 C35 36 28 39 21 43 C14 47 11 53 11 62 V146 C11 156 18 163 28 163 H92 C102 163 109 156 109 146 V62 C109 53 106 47 99 43 C92 39 85 36 85 30 V18';
const INSIDE_OPEN = 'M37.5 15 V30.5 C37.5 37.5 30.5 41 23.5 45 C17 48.6 13.6 54 13.6 62.5 V144 C13.6 150.5 17.5 155 24 155 H96 C102.5 155 106.4 150.5 106.4 144 V62.5 C106.4 54 103 48.6 96.5 45 C89.5 41 82.5 37.5 82.5 30.5 V15';
const BODY = `${BODY_OPEN} Z`;
const INSIDE = `${INSIDE_OPEN} Z`;
// Shallow, long waves read as a calm heavy liquid rather than a cartoon sea.
const WAVE = 'M0 0 Q20 -2.4 40 0 T80 0 T120 0 T160 0 T200 0 T240 0 T280 0 V200 H0 Z';
const STREAM_L = 'M34 19 V30 C34 36 27 39.5 20 43.5 C13 47.5 10 53 10 62 V146 C10 155 14 160 20 163';
const STREAM_R = 'M86 19 V30 C86 36 93 39.5 100 43.5 C107 47.5 110 53 110 62 V146 C110 155 106 160 100 163';

// Overflow goo: a bulging dome over the lip, slow drips down the front glass that end in
// swollen beads, a drop that stretches under the jar and splats into a lumpy puddle.
// The dome is drawn after the drips so they ooze out from under its sagging edge.
const DOME = 'M30.5 21 C28.5 12 39 4.5 50.5 6.5 C55.5 1.5 66 2.5 69.5 6.8 C80.5 4.6 92.5 11.5 89.8 21.5 C89.4 24.6 87.4 25.6 85.8 24 C83 22.6 78 23.4 74.5 24.6 C71 25.8 69 23 64.5 23.4 C60.5 23.8 58.5 26.6 55 25 C51 23.2 48.5 23.6 45 24.8 C41 26 38 23 34.5 24.4 C32 25.4 30.6 23.6 30.5 21 Z';
const DRIPS = [
    { x: 45, y1: 78, w: 6, r: 4.6, dur: 1.9, delay: 0.15, ph: 0.4 },
    { x: 71, y1: 116, w: 4.6, r: 3.6, dur: 2.3, delay: 0.35, ph: 2.1 },
    { x: 58, y1: 40, w: 7, r: 5.2, dur: 0.9, delay: 0.05, ph: 1.2 },
    { x: 86.5, y1: 56, w: 3.4, r: 2.8, dur: 1.4, delay: 0.6, ph: 3.3 },
];
const DRIP_TOP = 20;
const PUDDLE = 'M10 166 C8 160 24 159 36 161 C44 158 54 161 62 160 C74 157 86 161 96 159 C110 158 115 164 108 168 C100 172 84 169 72 171 C60 173 46 169 34 171 C20 173 11 171 10 166 Z';

const f1 = (n) => Number(n.toFixed(2));

// Catmull-Rom through the points, emitted as cubic segments (no leading M).
function smooth(pts) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
        const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
        d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
}

// A drip is a filled thread, not a stroke, so it can fan out where it leaves the dome,
// pinch, swell again and wobble sideways: uneven thickness is what sells "viscous".
function dripShape({ x, y1, w, r, ph }) {
    const n = 12;
    const L = [], R = [], hi = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = DRIP_TOP + t * (y1 - DRIP_TOP);
        const cx = x + 0.7 * Math.sin(t * Math.PI * 1.6 + ph);
        const k = Math.max(0, (t - 0.6) / 0.4);
        const neck = (w / 2) * (0.58 + 0.42 * (1 - t) ** 2 + 0.12 * Math.sin(t * Math.PI * 2.2 + ph)) + Math.max(0, 0.12 - t) * w * 5;
        // swell into the bead so the end reads as a teardrop, not a lollipop
        const h = neck + (r * 0.84 - neck) * k * k * (3 - 2 * k);
        L.push([cx - h, y]);
        R.push([cx + h, y]);
        if (t > 0.1 && t < 0.85) hi.push([cx - h * 0.38, y]);
    }
    R.reverse();
    return {
        body: `M${f1(L[0][0])} ${f1(L[0][1])}${smooth(L)} L${f1(R[0][0])} ${f1(R[0][1])}${smooth(R)} Z`,
        streak: `M${f1(hi[0][0])} ${f1(hi[0][1])}${smooth(hi)}`,
        end: x + 0.7 * Math.sin(Math.PI * 1.6 + ph),
    };
}

const dripsSvg = DRIPS.map((g) => {
    const s = dripShape(g);
    return `
        <g class="cm-drip" style="--d:${g.dur}s;--dl:${g.delay}s;--L:${g.y1 - DRIP_TOP}">
            <g class="cm-drip-run">
                <path class="cm-drip-body" d="${s.body}"/>
                <path class="cm-drip-streak" d="${s.streak}" stroke-width="${f1(g.w * 0.17)}"/>
            </g>
            <g class="cm-drip-tip">
                <circle class="cm-drip-bead" cx="${f1(s.end)}" cy="${g.y1}" r="${g.r}"/>
                <ellipse class="cm-drip-gloss" cx="${f1(s.end - g.r * 0.36)}" cy="${f1(g.y1 - g.r * 0.4)}" rx="${f1(g.r * 0.34)}" ry="${f1(g.r * 0.22)}" transform="rotate(-35 ${f1(s.end - g.r * 0.36)} ${f1(g.y1 - g.r * 0.4)})"/>
                <path class="cm-drip-rimlight" d="M${f1(s.end + g.r * 0.25)} ${f1(g.y1 + g.r * 0.62)} A${g.r * 0.68} ${g.r * 0.68} 0 0 0 ${f1(s.end + g.r * 0.64)} ${f1(g.y1 + g.r * 0.08)}" stroke-width="${f1(Math.max(0.5, g.r * 0.16))}"/>
            </g>
        </g>`;
}).join('');

// Stops take colours from theme tokens, so one set of gradients serves light and dark.
const stop = (o, c, a = 1) => `<stop offset="${o}" style="stop-color:${c};stop-opacity:${a}"/>`;

export const JAR_SVG = `
<svg class="cm-jar-svg" viewBox="0 0 120 172" aria-hidden="true">
    <defs>
        <clipPath id="cm-jar-clip"><path d="${INSIDE}"/></clipPath>
        <linearGradient id="cm-milk-grad" gradientUnits="userSpaceOnUse" x1="0" y1="-2" x2="0" y2="120">
            ${stop(0, 'var(--cm-milk-surface)')}${stop(0.07, 'var(--cm-milk-top)')}${stop(1, 'var(--cm-milk-bottom)')}
        </linearGradient>
        <linearGradient id="cm-milk-side" gradientUnits="userSpaceOnUse" x1="13.6" y1="0" x2="106.4" y2="0">
            ${stop(0, 'var(--cm-milk-deep)', 0.42)}${stop(0.06, 'var(--cm-milk-deep)', 0.2)}${stop(0.16, 'var(--cm-milk-deep)', 0.07)}${stop(0.32, 'var(--cm-milk-deep)', 0)}${stop(0.62, 'var(--cm-milk-deep)', 0)}${stop(0.8, 'var(--cm-milk-deep)', 0.09)}${stop(0.93, 'var(--cm-milk-deep)', 0.24)}${stop(1, 'var(--cm-milk-deep)', 0.46)}
        </linearGradient>
        <linearGradient id="cm-glass-body" gradientUnits="userSpaceOnUse" x1="11" y1="0" x2="109" y2="0">
            ${stop(0, 'var(--cm-glass-tint)', 1)}${stop(0.14, 'var(--cm-glass-tint)', 0.45)}${stop(0.5, 'var(--cm-glass-tint)', 0.2)}${stop(0.86, 'var(--cm-glass-tint)', 0.5)}${stop(1, 'var(--cm-glass-tint)', 1)}
        </linearGradient>
        <linearGradient id="cm-glass-wall" gradientUnits="userSpaceOnUse" x1="11" y1="0" x2="109" y2="0">
            ${stop(0, 'var(--cm-glass-hi)', 0.4)}${stop(0.035, 'var(--cm-glass-edge)', 0.55)}${stop(0.5, 'var(--cm-glass-edge)', 0.5)}${stop(0.96, 'var(--cm-glass-edge)', 0.85)}${stop(1, 'var(--cm-glass-edge)', 1)}
        </linearGradient>
        <radialGradient id="cm-glass-back">
            ${stop(0, 'var(--cm-glass-hi)', 0.1)}${stop(0.6, 'var(--cm-glass-hi)', 0.05)}${stop(1, 'var(--cm-glass-hi)', 0)}
        </radialGradient>
        <linearGradient id="cm-glass-lip" x1="0" y1="0" x2="0" y2="1">
            ${stop(0, 'var(--cm-glass-hi)', 0.75)}${stop(0.3, 'var(--cm-glass-tint)', 0.6)}${stop(0.72, 'var(--cm-glass-edge)', 0.75)}${stop(1, 'var(--cm-glass-hi)', 0.35)}
        </linearGradient>
        <linearGradient id="cm-jar-spec" gradientUnits="userSpaceOnUse" x1="0" y1="46" x2="0" y2="146">
            ${stop(0, 'var(--cm-glass-hi)', 0)}${stop(0.12, 'var(--cm-glass-hi)', 0.95)}${stop(0.55, 'var(--cm-glass-hi)', 0.55)}${stop(1, 'var(--cm-glass-hi)', 0)}
        </linearGradient>
        <radialGradient id="cm-jar-shadow-grad">
            ${stop(0, 'var(--cm-jar-shadow)', 1)}${stop(0.55, 'var(--cm-jar-shadow)', 0.45)}${stop(1, 'var(--cm-jar-shadow)', 0)}
        </radialGradient>
        <radialGradient id="cm-goo-vol" cx="0.4" cy="0.32" r="0.78" fx="0.34" fy="0.24">
            ${stop(0, 'var(--cm-goo-hi)')}${stop(0.45, 'var(--cm-goo)')}${stop(1, 'var(--cm-goo-shade)')}
        </radialGradient>
        <linearGradient id="cm-goo-thread" x1="0" y1="0" x2="1" y2="0">
            ${stop(0, 'var(--cm-goo-shade)')}${stop(0.28, 'var(--cm-goo-hi)')}${stop(0.55, 'var(--cm-goo)')}${stop(1, 'var(--cm-goo-shade)')}
        </linearGradient>
    </defs>
    <ellipse class="cm-jar-shadow" cx="60" cy="164" rx="54" ry="6" fill="url(#cm-jar-shadow-grad)"/>
    <ellipse class="cm-jar-shadow cm-jar-shadow-core" cx="60" cy="163.2" rx="44" ry="2.2" fill="url(#cm-jar-shadow-grad)"/>
    <g class="cm-goo-puddle">
        <path class="cm-goo-fill" d="${PUDDLE}"/>
        <path class="cm-goo-lip" d="M14 165.5 C22 162.4 34 163.2 44 162.6 C56 162 70 161.4 82 161.6 C92 161 102 160.8 108 163.4"/>
        <ellipse class="cm-goo-shine" cx="34" cy="163.6" rx="11" ry="1.3"/>
        <ellipse class="cm-goo-shine" cx="88" cy="162.8" rx="7" ry="0.9"/>
        <circle class="cm-goo-bubble" cx="20" cy="166.5" r="1.1"/>
        <circle class="cm-goo-bubble" cx="101" cy="164.8" r="0.8"/>
    </g>
    <ellipse class="cm-goo-splash" cx="34" cy="166" rx="9" ry="2.4"/>
    <path class="cm-jar-glass" d="${BODY}" fill="url(#cm-glass-body)"/>
    <ellipse class="cm-jar-backlight" cx="80" cy="100" rx="10" ry="48" fill="url(#cm-glass-back)"/>
    <g clip-path="url(#cm-jar-clip)">
        <g class="cm-jar-level">
            <path class="cm-wave cm-wave-back" d="${WAVE}"/>
            <path class="cm-wave cm-wave-front" d="${WAVE}" fill="url(#cm-milk-grad)"/>
            <rect class="cm-milk-shade" x="0" y="1.2" width="120" height="200" fill="url(#cm-milk-side)"/>
            <path class="cm-milk-meniscus" d="M12 -4.8 C13.4 -1.6 15.4 0.2 23 1.2 H12 Z M108 -4.8 C106.6 -1.6 104.6 0.2 97 1.2 H108 Z"/>
            <ellipse class="cm-milk-glint" cx="42" cy="-0.7" rx="15" ry="0.6"/>
            <ellipse class="cm-milk-glint cm-milk-glint-sm" cx="78" cy="-0.6" rx="5" ry="0.4"/>
        </g>
    </g>
    <path class="cm-jar-wall" d="${BODY} ${INSIDE}" fill-rule="evenodd" fill="url(#cm-glass-wall)"/>
    <path class="cm-jar-base" d="M15.5 150.5 C19 156.6 101 156.6 104.5 150.5"/>
    <path class="cm-jar-lens" d="M23 159.6 C40 161.5 80 161.5 97 159.6"/>
    <path class="cm-jar-inner" d="${INSIDE_OPEN}"/>
    <path class="cm-jar-outline" d="${BODY_OPEN}"/>
    <path class="cm-jar-thread" d="M35 22.2 C48 24.4 72 25 85 22.8"/>
    <path class="cm-jar-thread" d="M35 26.4 C48 28.6 72 29.2 85 27"/>
    <path class="cm-jar-thread-hi" d="M35.6 21.2 C48 23.3 72 23.9 84.4 21.8"/>
    <path class="cm-jar-thread-hi" d="M35.6 25.4 C48 27.5 72 28.1 84.4 26"/>
    <rect class="cm-jar-rim" x="32.5" y="11.5" width="55" height="7.5" rx="3.75" fill="url(#cm-glass-lip)"/>
    <path class="cm-jar-mouth" d="M35.2 13.8 C46 15.9 74 15.9 84.8 13.8"/>
    <path class="cm-jar-rim-hi" d="M35.6 16.6 C38 17.2 41 17.5 44 17.6"/>
    <path class="cm-jar-shine" d="M20.4 56 C18.9 62 18.6 70 18.6 80 V130 C18.6 135 19.3 138.6 20.5 141 C21.8 138.6 22.4 135 22.4 130 V78 C22.4 68 22 61 20.4 56 Z" fill="url(#cm-jar-spec)"/>
    <path class="cm-jar-shine-line" d="M26.2 72 V118"/>
    <path class="cm-jar-shine cm-jar-shine-sm" d="M101.2 70 C102.3 76 102.3 120 101.2 128 C100.2 120 100.2 76 101.2 70 Z" fill="url(#cm-jar-spec)"/>
    <path class="cm-jar-shoulder-hi" d="M23.4 45.2 C28.6 42 34 38.8 36.4 33.6"/>
    <path class="cm-jar-shoulder-hi cm-jar-shoulder-hi-r" d="M91.5 42.8 C95.6 45 99.4 47.6 101.6 51.6"/>
    <path class="cm-jar-stream cm-jar-stream-shade" d="${STREAM_L}" pathLength="100"/>
    <path class="cm-jar-stream" d="${STREAM_L}" pathLength="100"/>
    <path class="cm-jar-stream cm-jar-stream-hi" d="${STREAM_L}" pathLength="100" transform="translate(-0.7 0)"/>
    <path class="cm-jar-stream cm-jar-stream-r cm-jar-stream-shade" d="${STREAM_R}" pathLength="100"/>
    <path class="cm-jar-stream cm-jar-stream-r" d="${STREAM_R}" pathLength="100"/>
    <path class="cm-jar-stream cm-jar-stream-r cm-jar-stream-hi" d="${STREAM_R}" pathLength="100" transform="translate(-0.7 0)"/>
    <g class="cm-goo-drips">${dripsSvg}
    </g>
    <g class="cm-goo-dome">
        <path class="cm-goo-fill" d="${DOME}"/>
        <path class="cm-goo-lip" d="M33 20.8 C40 22.6 48 21.6 56 22.8 C64 23.6 74 21.4 87.6 21.2"/>
        <ellipse class="cm-goo-shine" cx="46" cy="11.2" rx="8.5" ry="2.1" transform="rotate(-12 46 11.2)"/>
        <circle class="cm-goo-shine cm-goo-spec" cx="69.6" cy="9.6" r="1.25"/>
        <circle class="cm-goo-bubble" cx="77" cy="14.5" r="1.6"/>
        <circle class="cm-goo-bubble" cx="59" cy="9.2" r="0.9"/>
        <circle class="cm-goo-bubble" cx="38.4" cy="17" r="1.1"/>
    </g>
    <g class="cm-goo-hang">
        <path class="cm-goo-fill cm-goo-string" d="M31 160 C30 163 33 163 32 166 C31 168 35 168 34 160 Z"/>
        <circle class="cm-goo-fill cm-goo-fall" cx="33" cy="166" r="2.6"/>
    </g>
</svg>`;

const MINI_BODY = 'M3.9 3.3h4.2v.6c0 .8 2.5 1.2 2.5 3v6.1c0 1-.8 1.8-1.8 1.8H3.2c-1 0-1.8-.8-1.8-1.8V6.9c0-1.8 2.5-2.2 2.5-3z';

// At 12×16 only the silhouette, a lip and one highlight survive; the rest would be mush.
export const MINI_JAR_SVG = `
<svg class="cm-mini-jar" viewBox="0 0 12 16" aria-hidden="true">
    <defs>
        <clipPath id="cm-mini-clip"><path d="${MINI_BODY}"/></clipPath>
        <linearGradient id="cm-mini-milk" x1="0" y1="0" x2="1" y2="0">
            ${stop(0, 'var(--cm-milk-bottom)')}${stop(0.4, 'var(--cm-milk-top)')}${stop(1, 'var(--cm-milk-bottom)')}
        </linearGradient>
    </defs>
    <path class="cm-mini-body" d="${MINI_BODY}"/>
    <rect class="cm-mini-fill" x="0" y="16" width="12" height="16" clip-path="url(#cm-mini-clip)"/>
    <path class="cm-mini-glass" d="${MINI_BODY}"/>
    <path class="cm-mini-shine" d="M3.1 7.4v4.6"/>
    <rect class="cm-mini-rim" x="3.2" y="1.3" width="5.6" height="2.2" rx="1.1"/>
</svg>`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function split(total, capacity) {
    const jars = Math.floor(total / capacity);
    const rest = total - jars * capacity;
    return { jars, rest, frac: rest / capacity };
}

export class Jar {
    constructor(stage, shelf) {
        this.stage = stage;
        this.level = stage.querySelector('.cm-jar-level');
        this.shelf = shelf;
        this.shown = null;
        this.chain = Promise.resolve();
    }

    setLevel(frac, instant = false, brim = false) {
        const y = brim ? Y_BRIM : Y_EMPTY - Math.min(1, frac) * (Y_EMPTY - Y_FULL);
        this.level.style.transition = instant ? 'none' : '';
        this.level.style.transform = `translateY(${y}px)`;
        if (instant) void this.level.getBoundingClientRect();
    }

    renderShelf(jars) {
        const n = Math.min(jars, SHELF_ICONS);
        this.shelf.innerHTML = Array.from({ length: n }, () => '<span class="cm-shelf-jar"></span>').join('') +
            (jars > SHELF_ICONS ? `<span class="cm-shelf-more">+${jars - SHELF_ICONS}</span>` : '');
        this.shelf.hidden = jars === 0;
    }

    apply(total, capacity, instant) {
        const { jars, frac } = split(total, capacity);
        this.renderShelf(jars);
        this.setLevel(total > 0 && frac > 0 ? Math.max(frac, MIN_FILM) : 0, instant);
        this.shown = { total, capacity };
    }

    /** Animate from what is on screen to `total`. Calls are serialized. */
    set(total, capacity, { animate = true } = {}) {
        this.chain = this.chain.then(() => this.run(total, capacity, animate)).catch(() => {});
        return this.chain;
    }

    async run(total, capacity, animate) {
        const prev = this.shown;
        if (!animate || !prev || prev.capacity !== capacity || total <= prev.total) {
            this.apply(total, capacity, !animate || !prev || prev.capacity !== capacity);
            return;
        }
        const a = split(prev.total, capacity);
        const b = split(total, capacity);
        if (b.jars === a.jars) {
            this.apply(total, capacity, false);
            return;
        }

        // Overflow: fill past the rim, spill down the walls, shelve the jar, start a new one.
        this.setLevel(1, false, true);
        await wait(650);
        this.stage.classList.add('cm-overflowing');
        await wait(2700);
        this.stage.classList.add('cm-jar-swap');
        await wait(320);
        this.renderShelf(b.jars);
        this.setLevel(0, true);
        // Sticky residue lingers on the glass and the shelf for a moment.
        this.stage.classList.remove('cm-overflowing', 'cm-jar-swap');
        this.stage.classList.add('cm-residue');
        clearTimeout(this.residueTimer);
        this.residueTimer = setTimeout(() => this.stage.classList.remove('cm-residue'), 4200);
        await wait(60);
        this.setLevel(b.frac > 0 ? Math.max(b.frac, MIN_FILM) : 0);
        this.shown = { total, capacity };
        await wait(900);
    }
}
