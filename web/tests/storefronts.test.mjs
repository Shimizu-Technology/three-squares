import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorefrontEnabledMap, inferStorefrontFromLink, isStorefrontManagedPathEnabled } from '../src/utils/storefronts.ts';

test('storefront loading/failure and missing Cookie settings fail closed', () => {
  for (const config of [undefined, null]) {
    assert.deepEqual(getStorefrontEnabledMap(config), {three_squares:false, latte_stone:false, catering:false});
  }
  assert.equal(getStorefrontEnabledMap({}).latte_stone, false);
  assert.equal(getStorefrontEnabledMap({enable_storefront_latte_stone:true}).latte_stone, true);
});

test('Cookie entry and collection links obey the same storefront toggle', () => {
  for (const path of ['/shop/latte-stone-cookies','/products?business_line=latte_stone','/collections/cookies','/collections?collection=mini-cookies']) {
    assert.equal(inferStorefrontFromLink(path), 'latte_stone');
    assert.equal(isStorefrontManagedPathEnabled({enable_storefront_latte_stone:false}, path), false);
  }
  assert.equal(isStorefrontManagedPathEnabled(null, '/about'), true);
});
