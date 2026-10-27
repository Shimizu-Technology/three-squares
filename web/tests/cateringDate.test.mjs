import test from 'node:test';
import assert from 'node:assert/strict';
import { minCateringEventDate } from '../src/utils/cateringDate.ts';

test('catering date minimum follows Guam calendar across a UTC boundary', () => {
  assert.equal(minCateringEventDate(new Date('2026-10-27T13:59:59Z')), '2026-10-30');
  assert.equal(minCateringEventDate(new Date('2026-10-27T14:00:00Z')), '2026-10-31');
});
