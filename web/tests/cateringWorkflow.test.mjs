import test from 'node:test';
import assert from 'node:assert/strict';
import { CATERING_STATUS, cateringEventDate, mergeCateringDraft, validQuoteAmount } from '../src/components/admin/catering/cateringWorkflow.ts';

test('quote amounts accept exact positive decimals within the saved amount range', () => {
  for (const amount of ['0.01', '12', '12.3', '1200.25', '99999999.99']) assert.equal(validQuoteAmount(amount), true, amount);
  for (const amount of ['', '0', '0.00', '-12', '1e3', 'NaN', 'Infinity', '12.345', '12x', '1,000', '.50', '100000000', ' 12']) assert.equal(validQuoteAmount(amount), false, amount);
});

test('fresh reads replace untouched fields but retain each edited field independently', () => {
  const saved = { admin_notes: 'New server note', quoted_amount: 1234.5 };
  assert.deepEqual(mergeCateringDraft(undefined, saved), { quote: '1234.50', notes: saved.admin_notes, quoteDirty: false, notesDirty: false });
  assert.deepEqual(mergeCateringDraft({ quote: '900', notes: 'Old server note', quoteDirty: true, notesDirty: false }, saved), { quote: '900', notes: saved.admin_notes, quoteDirty: true, notesDirty: false });
  assert.deepEqual(mergeCateringDraft({ quote: '900', notes: 'My new follow-up', quoteDirty: false, notesDirty: true }, saved), { quote: '1234.50', notes: 'My new follow-up', quoteDirty: false, notesDirty: true });
  assert.deepEqual(mergeCateringDraft({ quote: '900', notes: 'My new follow-up', quoteDirty: true, notesDirty: true }, saved), { quote: '900', notes: 'My new follow-up', quoteDirty: true, notesDirty: true });
});

test('a cleared draft note and unknown/legacy quote remain truthful', () => {
  assert.equal(mergeCateringDraft({ quote: '', notes: '', quoteDirty: false, notesDirty: true }, { admin_notes: 'Old note', quoted_amount: null }).notes, '');
  assert.equal(mergeCateringDraft(undefined, {}).quote, '');
  assert.equal(CATERING_STATUS.quoted, 'Quote recorded');
  assert.equal(cateringEventDate('2027-01-01'), 'Jan 1, 2027');
});
