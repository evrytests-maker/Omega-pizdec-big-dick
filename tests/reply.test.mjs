// The model's reply parser must survive what small models actually return.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReply } from '../src/llm.js';

test('both scales, exactly the four contract keys', () => {
    assert.deepEqual(parseReply('{"happened": true, "count": 2, "base": 7.5, "omega-pizdec": 1840}'),
        { happened: true, count: 2, ml: 1840, base: 7.5 });
});

test('fenced, with prose around', () => {
    const r = parseReply('Sure! Here is the measurement:\n```json\n{"happened": true, "count": 1, "base": 4, "omega-pizdec": 900}\n```\nHope that helps.');
    assert.equal(r.ml, 900);
    assert.equal(r.base, 4);
});

test('quoted numbers, units and comma decimals', () => {
    const r = parseReply('{"happened": "true", "count": "1", "base": "4,5 ml", "omega-pizdec": "12,5 ml"}');
    assert.equal(r.base, 4.5);
    assert.equal(r.ml, 12.5);
});

test('legacy "ml" key still reads as omega-pizdec', () => {
    assert.equal(parseReply('{"happened": true, "count": 1, "ml": 4.2}').ml, 4.2);
});

test('missing base falls back to a human volume, never above omega-pizdec', () => {
    assert.equal(parseReply('{"happened": true, "count": 1, "omega-pizdec": 1840}').base, 5);
    assert.equal(parseReply('{"happened": true, "count": 1, "omega-pizdec": 3}').base, 3);
});

test('base is capped by omega-pizdec', () => {
    assert.equal(parseReply('{"happened": true, "count": 1, "base": 50, "omega-pizdec": 6}').base, 6);
});

test('happened=false zeroes everything', () => {
    assert.deepEqual(parseReply('{"happened": false, "count": 3, "base": 5, "omega-pizdec": 50}'),
        { happened: false, count: 0, ml: 0, base: 0 });
});

test('happened=true with zero volume is not counted', () => {
    assert.equal(parseReply('{"happened": true, "count": 1, "base": 0, "omega-pizdec": 0}').happened, false);
});

test('count is at least 1 when something happened', () => {
    assert.equal(parseReply('{"happened": true, "count": 0, "base": 3, "omega-pizdec": 3}').count, 1);
});

test('takes the last JSON object (draft first, answer last)', () => {
    assert.equal(parseReply('draft {"happened": true, "omega-pizdec": 1} final {"happened": true, "count": 1, "base": 4, "omega-pizdec": 6}').ml, 6);
});

test('trailing comma and single quotes are tolerated', () => {
    assert.equal(parseReply("{'happened': true, 'count': 1, 'base': 3.3, 'omega-pizdec': 3.3,}").ml, 3.3);
});

test('garbage returns null so the caller can retry', () => {
    assert.equal(parseReply('I cannot help with that.'), null);
    assert.equal(parseReply(''), null);
});

test('extra keys from chatty models are ignored', () => {
    assert.deepEqual(parseReply('{"happened": true, "count": 1, "base": 4, "omega-pizdec": 4, "comment": "lol", "omegaverse": false}'),
        { happened: true, count: 1, ml: 4, base: 4 });
});

test('thousands separators are not read as decimals', () => {
    const r = (v) => parseReply(`{"happened": true, "count": 1, "base": 5, "omega-pizdec": ${JSON.stringify(v)}}`).ml;
    assert.equal(r('1,840'), 1840);
    assert.equal(r('1 840 ml'), 1840);
    assert.equal(r('1,840.5'), 1840.5);
    assert.equal(r('12,5'), 12.5);
    assert.equal(r('2 500,5 мл'), 2500.5);
});
