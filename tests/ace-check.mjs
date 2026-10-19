// Cross-checks every trigger contract with the ACE-SKILL CLI.
// Usage: node tests/ace-check.mjs /path/to/ace-skill   (after `npm ci` there)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRIGGER_SOURCES, word } from '../src/detect.js';

const ace = process.argv[2];
if (!ace) {
    console.error('Usage: node tests/ace-check.mjs <ace-skill dir>');
    process.exit(2);
}
const contracts = JSON.parse(readFileSync(new URL('./trigger-contracts.json', import.meta.url), 'utf8'));

let failed = 0;
for (const [id, src] of Object.entries(TRIGGER_SOURCES)) {
    const re = word(src);
    const args = [join(ace, 'scripts/ace.mjs'), 'key', '--json', '--key', `/${re.source}/${re.flags}`];
    for (const t of contracts[id].match) args.push('--should-match', t);
    for (const t of contracts[id].notMatch) args.push('--should-not-match', t);
    let out;
    try {
        out = JSON.parse(execFileSync('node', args, { encoding: 'utf8' }));
    } catch (e) {
        out = JSON.parse(e.stdout || '{}');
    }
    const cases = out.data?.cases || out.cases || [];
    const bad = cases.filter((c) => !c.pass);
    if (out.status !== 'PASS' || bad.length) failed++;
    console.log(`${out.status === 'PASS' ? 'PASS' : 'FAIL'}  ${id}  (${cases.length} cases)${bad.map((c) => `\n      ✕ ${c.kind}: ${c.text}`).join('')}`);
}
console.log(failed ? `\n${failed} pattern(s) failed` : '\nAll patterns PASS under ACE');
process.exit(failed ? 1 : 0);
