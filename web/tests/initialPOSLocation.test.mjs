import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPOSLocation, posLocationPreferenceKey } from '../src/components/pos/initialLocation.ts';
const locations=[{id:1,slug:'three-squares-donki'},{id:2,slug:'three-squares-main'},{id:3,slug:'other'}];
test('POS prefers only still-authorized saved locations, otherwise the explicit server default/Main',()=>{
  assert.equal(initialPOSLocation(locations,'3',2),3);
  assert.equal(initialPOSLocation(locations,'99',2),2);
  assert.equal(initialPOSLocation(locations,'invalid',2),2);
  assert.equal(initialPOSLocation(locations,null),2);
  assert.equal(initialPOSLocation(locations.filter(row=>row.id!==2),null,3),3);
  assert.equal(initialPOSLocation([],null,2),undefined);
  assert.notEqual(posLocationPreferenceKey('fictional-a'),posLocationPreferenceKey('fictional-b'));
});
