// Regex triggers and the offline fallback estimator.
// Boundaries follow ACE-SKILL (references/keys-and-regex.md): JS \b does not
// understand Cyrillic, so both edges use Unicode letter/number lookarounds.
// Case-insensitive on purpose: prose capitalises at sentence start.
// Every pattern has positive, negative and near-miss cases in tests/trigger-contracts.json.

const L = '[\\p{L}\\p{N}_]';
const word = (s) => new RegExp(`(?<!${L})(?:${s})`, 'iu');

const PRON_EN = '(?:her|him|you|me|them)';
const PRON_RU = '(?:её|ее|его|тебя|меня|их)';
const END = `(?!${L})`;
const NOT_PLACE = '(?!\\s+(?:house|room|home|car|office|apartment|flat|tent|place))';

export const TRIGGER_SOURCES = {
    // English
    'en.cum': `cum(?:s|ming|med)?${END}(?!\\s+laude)`,
    'en.ejaculate': 'ejaculat',
    'en.came': `came\\s+(?:inside\\s+${PRON_EN}${END}${NOT_PLACE}|all\\s+over\\s+${PRON_EN}|deep\\s+inside|hard${END}(?!\\s+(?:times?|news|way|work|choice)))`,
    'en.climax': `climax(?:es|ed|ing)?\\s+(?:deep\\s+)?inside\\s+${PRON_EN}`,
    'en.spurt': `spurt(?:s|ed|ing)?\\s+(?:inside|into|deep|thick|rope)`,
    'en.semen': `semen${END}`,
    'en.spunk': `spunk${END}`,
    'en.jizz': 'jizz',
    'en.creampie': 'cream-?pie',
    'en.seed': `(?:his|hot|thick|alpha'?s?)\\s+seed${END}`,
    'en.fill': `(?:fill|pump|flood)(?:s|ed|ing)?\\s+${PRON_EN}\\s+(?:up${END}(?!\\s+(?:a|the|with\\s+(?:tea|coffee|food|water|gas)))|full\\s+of\\s+(?:cum|seed)|with\\s+(?:his\\s+)?(?:cum|seed))`,
    'en.load': `(?:shoot|shot|shoots|shooting|blow|blew|blows|dump|dumped|dumps|empt\\p{L}*|unload\\p{L}*)\\s+(?:his|their|its|a)\\s+(?:hot\\s+|thick\\s+|heavy\\s+)?load${END}`,
    'en.knot': `(?:(?:his|their|the|alpha'?s?)\\s+knot(?:\\s+\\p{L}+)?\\s+(?:swell|lock|pop|push|slid|catch|tie|inflat|expand)|knot(?:ted|ting|s)\\s+${PRON_EN}${END}(?!\\s+(?:hair|scarf|rope|tie)))`,
    'en.release': `releas(?:e|es|ed|ing)\\s+(?:his\\s+seed|deep\\s+inside|inside\\s+${PRON_EN}${END}${NOT_PLACE})`,
    // Russian
    'ru.konchit': `кончи(?:л|ла|ли|ть|т|в|м|те|шь)?${END}`,
    'ru.konchat': `конча(?:ет|ют|ю|я|ешь|ть)${END}`,
    'ru.izlit': `изли(?:л|ла|лся|лась|лось|вает|вается|вая|ваясь|ть|ться)${END}`,
    'ru.sperm': `сперм(?:а|ы|е|у|ой|ою)${END}`,
    'ru.semya': `сем(?:я|ени|енем)${END}`,
    'ru.ejac': 'эякул',
    'ru.malafya': 'малаф',
    'ru.creampie': 'кремпа',
    'ru.fill': `(?:наполн|залив|зали)\\p{L}*\\s+${PRON_RU}\\s+(?:до\\s+кра[её]в|до\\s+отказа|изнутри|собой|сем|сперм)`,
    'ru.knot': `(?:узел|узл(?:ом|а|е))(?:\\s+\\p{L}+){0,2}\\s+(?:набух|разбух|раздул|вош[её]л|заблок|запер|сцеп|увелич|внутри)|сцепил(?:ись|ся|ась)\\s+узлом`,
};

const TRIGGERS = Object.values(TRIGGER_SOURCES).map(word);

const OMEGAVERSE = [
    'omega\\s?verse',
    'омегаверс',
    `knot(?:s|ted|ting)?${END}`,
    `rut${END}`,
    'течк',
    `гон(?:е|а)?${END}`,
    `узл(?:ом|а|е)${END}|узел${END}`,
].map(word);

const ALPHA_OMEGA = word('alpha|omega|альф|омег');
export { word };

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
