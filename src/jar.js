// The jar: an open glass jar filled with milky liquid. When a measurement pushes it
// past capacity, the liquid rises over the rim, runs down the walls, the full jar
// moves to the shelf and a fresh one fills with the remainder.

const Y_EMPTY = 162;
const Y_FULL = 30;
const Y_BRIM = 20;
const MIN_FILM = 0.025;
const SHELF_ICONS = 5;

const WAVE = 'M0 0 Q15 -5 30 0 T60 0 T90 0 T120 0 T150 0 T180 0 T210 0 T240 0 V200 H0 Z';
const BODY = 'M36 22 h48 v6 c0 6 6 9 12 13 c8 5 12 12 12 22 v82 c0 10 -7 17 -17 17 h-62 c-10 0 -17 -7 -17 -17 v-82 c0 -10 4 -17 12 -22 c6 -4 12 -7 12 -13 z';
const INSIDE = 'M39 25 h42 v3 c0 7 6 10 12 14 c7 4 10 10 10 19 v82 c0 8 -6 13 -13 13 h-60 c-7 0 -13 -5 -13 -13 v-82 c0 -9 3 -15 10 -19 c6 -4 12 -7 12 -14 z';
const STREAM_L = 'M35 21 c0 6 -6 9 -12 13 c-8 5 -13 12 -13 22 v84 c0 9 4 15 10 18';
const STREAM_R = 'M85 21 c0 6 6 9 12 13 c8 5 13 12 13 22 v84 c0 9 -4 15 -10 18';

// Overflow goo: a bulging dome over the rim, slow drips down the front glass that end in
// swollen beads, a drop that stretches under the jar and splats into a lumpy puddle.
const DOME = 'M30 23 C29 12 41 4 52 6 C56 2 66 3 69 7 C80 5 92 12 90 23 Z';
const DRIPS = [
    { d: 'M45 24 C44 38 47 56 45 76', w: 6, bead: [45, 78, 4.6], dur: 1.9, delay: 0.15 },
    { d: 'M71 24 C72 44 69 78 71 114', w: 4.6, bead: [71, 116, 3.6], dur: 2.3, delay: 0.35 },
    { d: 'M58 24 C58 29 59 33 58 37', w: 7, bead: [58, 40, 5.2], dur: 0.9, delay: 0.05 },
    { d: 'M86 26 C88 34 85 44 87 54', w: 3.4, bead: [87, 56, 2.8], dur: 1.4, delay: 0.6 },
];
const PUDDLE = 'M10 166 C8 160 24 159 36 161 C44 158 54 161 62 160 C74 157 86 161 96 159 C110 158 115 164 108 168 C100 172 84 169 72 171 C60 173 46 169 34 171 C20 173 11 171 10 166 Z';

const dripsSvg = DRIPS.map((g, i) => `
        <g class="cm-drip" style="--d:${g.dur}s;--dl:${g.delay}s">
            <path class="cm-drip-line" d="${g.d}" pathLength="100" stroke-width="${g.w}"/>
            <path class="cm-drip-core" d="${g.d}" pathLength="100" stroke-width="${(g.w * 0.38).toFixed(1)}"/>
            <circle class="cm-drip-bead" cx="${g.bead[0]}" cy="${g.bead[1]}" r="${g.bead[2]}"/>
            <circle class="cm-drip-gloss" cx="${g.bead[0] - g.bead[2] * 0.35}" cy="${g.bead[1] - g.bead[2] * 0.35}" r="${(g.bead[2] * 0.3).toFixed(1)}"/>
        </g>`).join('');

export const JAR_SVG = `
<svg class="cm-jar-svg" viewBox="0 0 120 172" aria-hidden="true">
    <defs>
        <clipPath id="cm-jar-clip"><path d="${INSIDE}"/></clipPath>
        <linearGradient id="cm-milk-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--cm-milk-top)"/>
            <stop offset="1" stop-color="var(--cm-milk-bottom)"/>
        </linearGradient>
    </defs>
    <ellipse class="cm-jar-shadow" cx="60" cy="165" rx="44" ry="3.5"/>
    <g class="cm-goo-puddle">
        <path class="cm-goo-fill" d="${PUDDLE}"/>
        <ellipse class="cm-goo-shine" cx="40" cy="164" rx="12" ry="1.4"/>
        <ellipse class="cm-goo-shine" cx="82" cy="163" rx="7" ry="1"/>
    </g>
    <ellipse class="cm-goo-splash" cx="34" cy="166" rx="9" ry="2.4"/>
    <path class="cm-jar-glass" d="${BODY}"/>
    <g clip-path="url(#cm-jar-clip)">
        <g class="cm-jar-level">
            <path class="cm-wave cm-wave-back" d="${WAVE}"/>
            <path class="cm-wave cm-wave-front" d="${WAVE}" fill="url(#cm-milk-grad)"/>
        </g>
    </g>
    <path class="cm-jar-stream" d="${STREAM_L}" pathLength="100"/>
    <path class="cm-jar-stream cm-jar-stream-r" d="${STREAM_R}" pathLength="100"/>
    <path class="cm-jar-outline" d="${BODY}"/>
    <rect class="cm-jar-rim" x="32" y="17" width="56" height="7" rx="3.5"/>
    <rect class="cm-jar-shine" x="21" y="54" width="5" height="84" rx="2.5"/>
    <rect class="cm-jar-shine cm-jar-shine-sm" x="95" y="62" width="3" height="40" rx="1.5"/>
    <g class="cm-goo-dome">
        <path class="cm-goo-fill" d="${DOME}"/>
        <ellipse class="cm-goo-shine" cx="47" cy="11" rx="8" ry="2"/>
        <circle class="cm-goo-shine" cx="70" cy="10" r="1.3"/>
    </g>
    <g class="cm-goo-drips">${dripsSvg}
    </g>
    <g class="cm-goo-hang">
        <path class="cm-goo-fill cm-goo-string" d="M31 160 C30 163 33 163 32 166 C31 168 35 168 34 160 Z"/>
        <circle class="cm-goo-fill cm-goo-fall" cx="33" cy="166" r="2.6"/>
    </g>
</svg>`;

export const MINI_JAR_SVG = `
<svg class="cm-mini-jar" viewBox="0 0 12 16" aria-hidden="true">
    <defs><clipPath id="cm-mini-clip"><path d="M3.6 2.6h4.8v.5c0 .9 2.2 1.3 2.2 3v6.9c0 1-.8 1.8-1.8 1.8H3.2c-1 0-1.8-.8-1.8-1.8V6.1c0-1.7 2.2-2.1 2.2-3z"/></clipPath></defs>
    <rect class="cm-mini-fill" x="0" y="16" width="12" height="16" clip-path="url(#cm-mini-clip)"/>
    <path class="cm-mini-glass" d="M3.6 2.6h4.8v.5c0 .9 2.2 1.3 2.2 3v6.9c0 1-.8 1.8-1.8 1.8H3.2c-1 0-1.8-.8-1.8-1.8V6.1c0-1.7 2.2-2.1 2.2-3z"/>
    <rect class="cm-mini-rim" x="3" y="1.2" width="6" height="1.6" rx=".8"/>
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
