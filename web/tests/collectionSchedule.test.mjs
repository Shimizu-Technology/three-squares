import test from 'node:test';
import assert from 'node:assert/strict';
import { fromGuamDateInput, toGuamDateInput, formatGuamDate } from '../src/utils/collectionSchedule.ts';

test('Guam midnight retains its local date across UTC and operator time zones', () => {
  for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Guam']) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = zone;
      assert.equal(toGuamDateInput('2026-12-24T14:00:00Z'), '2026-12-25T00:00');
      assert.equal(fromGuamDateInput('2026-12-25T00:00'), '2026-12-25T00:00:00+10:00');
      assert.match(formatGuamDate('2026-12-24T14:00:00Z'), /Dec 25, 2026.*12:00 AM.*Guam time/);
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
});

test('optional bounds remain empty, and invalid calendar values cannot silently roll forward', () => {
  assert.equal(fromGuamDateInput(''), null);
  assert.equal(toGuamDateInput(null), '');
  for (const value of ['2026-02-30T08:00', '2026-13-01T08:00', '2026-11-26T25:00', '2026-11-26']) {
    assert.throws(() => fromGuamDateInput(value), /valid Guam date/);
  }
});


test('editing unrelated fields preserves sub-minute boundaries until an operator changes the time', () => {
  const original = '2026-11-26T20:00:45.123+10:00';
  assert.equal(fromGuamDateInput(toGuamDateInput(original), original), original);
  assert.equal(fromGuamDateInput('2026-11-26T20:01', original), '2026-11-26T20:01:00+10:00');
  assert.equal(fromGuamDateInput('', original), null);
});
