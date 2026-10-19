// Regex triggers and the offline fallback estimator.
// JS \b does not understand Cyrillic, so boundaries use Unicode letter lookarounds.

const word = (s) => new RegExp(`(?<!\\p{L})(?:${s})`, 'iu');

const TRIGGERS = [
    // English
    'cum(?:s|ming|med)?(?!\\p{L})',
    'ejaculat',
    'came\\s+(?:inside|in\\s+(?:her|him|you|me|them)|all\\s+over|deep|hard)',
    'climax(?:es|ed|ing)?\\s+(?:inside|deep)',
    'spurt',
    'semen',
    'spunk',
    'jizz',
    'creampie',
    'cream(?:s|ed|ing)?\\s+(?:her|him|you|me|them|inside)',
    'seed(?:\\s+\\p{L}+){0,3}\\s+(?:fill|spill|pump|flood|paint|coat)',
    '(?:fill|pump|flood)(?:s|ed|ing)?\\s+(?:her|him|you|me|them)\\s+(?:up|full|with)',
    'shoot(?:s|ing)?\\s+(?:his|her|their|a)?\\s*load',
    'loads?\\s+(?:inside|into|deep)',
    'knot(?:s|ted|ting)?(?!\\p{L})',
    'releas(?:e|es|ed|ing)\\s+(?:inside|deep|his\\s+seed)',
    // Russian
    'кончи(?:л|ла|ли|ть|т|в|м|те|шь)?(?!\\p{L})',
    'конча(?:ет|ют|ю|я|ешь|ть)',
    'изли(?:л|ла|лся|лось|вает|вая|ть)',
    'сперм',
    'семен(?:ем|и)',
    'сем(?:я|ени)(?!\\p{L})',
    'эякул',
    'малаф',
    'кремпа',
    'наполн\\p{L}*\\s+(?:её|ее|его|тебя|меня|их)',
    'залива(?:ет|я|л)\\s+(?:её|ее|его|тебя|меня|их)',
    'узл(?:ом|а|е)(?!\\p{L})|узел(?!\\p{L})',
].map(word);

const OMEGAVERSE = [
    'omega\\s?verse',
    'омегаверс',
    'knot(?:s|ted|ting)?(?!\\p{L})',
    'rut(?!\\p{L})',
    'течк',
    'гон(?:е|а)?(?!\\p{L})',
    'узл(?:ом|а|е)(?!\\p{L})|узел(?!\\p{L})',
].map(word);

const ALPHA_OMEGA = word('alpha|omega|альф|омег');

const INTENSITY = word(
    'flood|gallon|bucket|overflow|bulg|inflat|endless|torrent|gush|rope after rope|' +
    'литр|ведр|поток|переполн|раздул|бесконечн|фонтан|хлещ|обильн|струями|живот округл',
);

const ROUNDS = /again|another round|second time|снова|ещё раз|еще раз|второй раз|опять/giu;

function clean(text) {
    return String(text ?? '').replace(/<[^>]+>/g, ' ');
}

export function triggers(text) {
    const t = clean(text);
    return TRIGGERS.some((re) => re.test(t));
}

/** True when the card or recent story looks like omegaverse. */
export function looksOmegaverse(text) {
    const t = clean(text);
    if (word('omega\\s?verse|омегаверс').test(t)) return true;
    const hits = OMEGAVERSE.filter((re) => re.test(t)).length;
    return hits >= 1 && ALPHA_OMEGA.test(t);
}

const rand = (a, b) => a + Math.random() * (b - a);

/** Offline estimate used when no model is configured or the call failed. */
export function heuristicMl(text, { omega = false, absurdity = 5 } = {}) {
    const t = clean(text);
    const rounds = 1 + Math.min(3, (t.match(ROUNDS) || []).length);
    let intensity = 1;
    for (const m of t.matchAll(new RegExp(INTENSITY.source, 'giu'))) {
        if (m) intensity = Math.min(intensity * 1.8, 12);
    }
    let ml = rand(2, 6) * rounds;
    if (omega) {
        ml *= rand(40, 250);
        if (word('knot|узл|узел').test(t)) ml *= 1.5;
    }
    ml *= Math.pow(intensity, 0.5 + absurdity / 10);
    return Math.round(ml * 10) / 10;
}
