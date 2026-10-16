const test = require('node:test');
const assert = require('node:assert/strict');
const { diffLines, summarizeDiff } = require('../src/diff');

test('diff marks added and removed lines', () => {
  const result = diffLines('alpha\nbeta', 'alpha\ngamma');
  assert.deepEqual(result, [
    { type: 'same', text: 'alpha' },
    { type: 'removed', text: 'beta' },
    { type: 'added', text: 'gamma' }
  ]);
  assert.equal(summarizeDiff(result), '1 line(s) added, 1 line(s) removed');
});

test('diff handles empty input', () => {
  assert.deepEqual(diffLines('', 'hello'), [
    { type: 'removed', text: '' },
    { type: 'added', text: 'hello' }
  ]);
});
