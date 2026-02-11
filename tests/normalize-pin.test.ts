import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePin } from '../src/utils/pinNormalize';

test('normalizePin accepts 6-digit PINs as-is', () => {
  assert.equal(normalizePin('654321'), '654321');
});

test('normalizePin rejects other values', () => {
  assert.throws(() => normalizePin('1234'), /PIN must be 6 digits/);
  assert.throws(() => normalizePin('123'), /PIN must be 6 digits/);
  assert.throws(() => normalizePin('12345'), /PIN must be 6 digits/);
  assert.throws(() => normalizePin('abcd'), /PIN must be 6 digits/);
});
