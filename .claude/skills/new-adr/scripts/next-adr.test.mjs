import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAdrNumber } from './next-adr.mjs';

test('empty directory → 0001', () => {
  assert.equal(nextAdrNumber([]), '0001');
});

test('continues from the max, zero-padded to 4 digits', () => {
  assert.equal(nextAdrNumber(['0001-a.md', '0009-b.md', '0010-c.md']), '0011');
});

test('ignores non-ADR entries (README, template, dotfiles)', () => {
  assert.equal(nextAdrNumber(['README.md', 'adr-template.md', '.keep', '0003-x.md']), '0004');
});

test('continues past a gap — does not fill it (gapless = monotonic)', () => {
  assert.equal(nextAdrNumber(['0001-a.md', '0005-b.md']), '0006');
});

test('crosses the 0099 → 0100 boundary', () => {
  assert.equal(nextAdrNumber(['0099-x.md']), '0100');
});

test('order of entries does not matter', () => {
  assert.equal(nextAdrNumber(['0010-c.md', '0002-a.md', '0007-b.md']), '0011');
});
