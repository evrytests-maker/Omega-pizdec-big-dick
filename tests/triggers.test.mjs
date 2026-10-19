// Trigger contracts in the ACE-SKILL style: every pattern needs explicit positive,
// negative and near-miss cases, evaluated with JavaScript RegExp semantics.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIGGER_SOURCES, word, triggers, looksOmegaverse } from '../src/detect.js';

const contracts = JSON.parse(readFileSync(new URL('./trigger-contracts.json', import.meta.url), 'utf8'));

test('every trigger has a contract with both kinds of cases', () => {
    for (const id of Object.keys(TRIGGER_SOURCES)) {
        assert.ok(contracts[id], `missing contract for ${id}`);
        assert.ok(contracts[id].match.length > 0, `${id}: no positive case`);
        assert.ok(contracts[id].notMatch.length > 0, `${id}: no negative case`);
    }
    for (const id of Object.keys(contracts)) assert.ok(TRIGGER_SOURCES[id], `orphan contract ${id}`);
});

for (const [id, src] of Object.entries(TRIGGER_SOURCES)) {
    test(`pattern ${id}`, () => {
        const c = contracts[id];
        for (const text of c.match) assert.equal(word(src).test(text), true, `${id} should match: ${text}`);
        for (const text of c.notMatch) assert.equal(word(src).test(text), false, `${id} should not match: ${text}`);
    });
}

test('no pattern matches the empty string', () => {
    for (const [id, src] of Object.entries(TRIGGER_SOURCES)) assert.equal(word(src).test(''), false, id);
});

test('combined trigger set ignores ordinary prose', () => {
    const prose = [
        'He finished his work and came into the room.',
        'Она закончила отчёт, и деньги кончились.',
        'A knot of worry tied itself in her stomach.',
        'Семенов налил чаю и наполнил его бокал.',
    ];
    for (const t of prose) assert.equal(triggers(t), false, t);
});

test('patterns finish quickly on long hostile input', () => {
    const hostile = ('came '.repeat(2000) + 'узел '.repeat(2000) + 'a '.repeat(5000));
    const t0 = performance.now();
    triggers(hostile);
    assert.ok(performance.now() - t0 < 500);
});

test('omegaverse detection', () => {
    assert.equal(looksOmegaverse('An alpha in rut, the omega in heat.'), true);
    assert.equal(looksOmegaverse('Омегаверс AU'), true);
    assert.equal(looksOmegaverse('A knight guards the castle.'), false);
    assert.equal(looksOmegaverse('He is stuck in a rut at work.'), false);
});
