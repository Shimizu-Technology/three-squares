import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorePhone, getStorePhoneTel } from '../src/utils/storeContact.ts';

test('normalizes Guam local and full phone numbers without changing their destination', () => {
  for (const phone of ['646-2652', '(671) 646-2652', '1 (671) 646-2652', '+1 (671) 646-2652']) {
    assert.equal(getStorePhoneTel(phone), 'tel:+16716462652');
  }
  assert.equal(getStorePhoneTel('+81 3 1234 5678'), 'tel:+81312345678');
  assert.equal(getStorePhoneTel('555'), 'tel:555');
});

test('replaces only empty or inherited demo contacts', () => {
  for (const phone of ['', undefined, '+1 (671) 777-1234']) assert.equal(getStorePhone(phone), '(671) 646-2652');
  assert.equal(getStorePhone('646-2652'), '646-2652');
  assert.equal(getStorePhone('(671) 555-0199'), '(671) 555-0199');
});
