// The model's reply parser must survive what small models actually return.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReply } from '../src/llm.js';

test('plain object', () => {
    assert.deepEqual(parseReply('{"happened": true, "count": 1, "ml": 4.2, "omegaverse": false, "comment": "ok"}'),
        { happened: true, count: 1, ml: 4.2, omegaverse: false, comment: 'ok' });
});

test('fenced, with prose around', () => {
    const r = parseReply('Sure! Here is the measurement:\n```json\n{"happened": true, "count": 2, "ml": 1840, "omegaverse": true, "comment": "x"}\n```\nHope that helps.');
    assert.equal(r.ml, 1840);
    assert.equal(r.omegaverse, true);
});

test('quoted numbers, units and comma decimals', () => {
    assert.equal(parseReply('{"happened": "true", "count": "1", "ml": "4,5 ml", "omegaverse": "false", "comment": ""}').ml, 4.5);
});

test('happened=false zeroes everything', () => {
    assert.deepEqual(parseReply('{"happened": false, "count": 3, "ml": 50, "omegaverse": false, "comment": "nope"}'),
        { happened: false, count: 0, ml: 0, omegaverse: false, comment: '' });
});

test('happened=true with zero volume is not counted', () => {
    assert.equal(parseReply('{"happened": true, "count": 1, "ml": 0, "omegaverse": false, "comment": "?"}').happened, false);
});

test('count is at least 1 when something happened', () => {
    assert.equal(parseReply('{"happened": true, "count": 0, "ml": 3, "omegaverse": false, "comment": ""}').count, 1);
});

test('takes the last JSON object (draft first, answer last)', () => {
    assert.equal(parseReply('draft {"happened": true, "ml": 1} final {"happened": true, "count": 1, "ml": 6, "omegaverse": false, "comment": ""}').ml, 6);
});

test('trailing comma and single quotes are tolerated', () => {
    assert.equal(parseReply("{'happened': true, 'count': 1, 'ml': 3.3, 'omegaverse': false, 'comment': 'a',}").ml, 3.3);
});

test('garbage returns null so the caller can retry', () => {
    assert.equal(parseReply('I cannot help with that.'), null);
    assert.equal(parseReply(''), null);
});
