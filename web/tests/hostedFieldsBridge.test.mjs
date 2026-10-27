import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulatedHostedFieldsBridge } from '../src/components/payment/simulation/SimulatedHostedFieldsBridge.ts';
for (const mode of ['token', 'hosted']) {
  test(`${mode} bridge emits only one financial execution path`, async () => {
    let instrumentEvents = 0;
    let hostExecutions = 0;
    let completionEvents = 0;
    const bridge = new SimulatedHostedFieldsBridge(() => 'opaque-fixture', async () => { hostExecutions++; return {hint:true}; });
    bridge.mount({}, {sessionId:'owned', identityId:'local', mode}, {
      ready() {}, validation() {}, instrumentReady(handle) { assert.equal(handle,'opaque-fixture'); instrumentEvents++; },
      completed() { completionEvents++; }, cancelled() {}, error() {},
    });
    await bridge.submit();
    assert.equal(instrumentEvents, mode === 'token' ? 1 : 0);
    assert.equal(hostExecutions, mode === 'hosted' ? 1 : 0);
    assert.equal(completionEvents, mode === 'hosted' ? 1 : 0);
    bridge.destroy();
    await assert.rejects(() => bridge.submit(), /not ready/);
  });
}
