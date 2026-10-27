import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../public/admin-push-sw.js', import.meta.url), 'utf8');
function worker(windows = []) {
  const handlers = {};
  const shown = [];
  const opened = [];
  const self = {
    location: {origin:'https://orders.example.com'},
    addEventListener: (type,handler) => {handlers[type]=handler;},
    registration: {showNotification: async (...args)=>{shown.push(args);}},
    clients: {matchAll:async()=>windows,openWindow:async url=>{opened.push(url);}},
  };
  vm.runInNewContext(source, {self,URL});
  const click = async url => {
    let result;
    handlers.notificationclick({notification:{data:{url},close(){}},waitUntil:p=>{result=p;}});
    await result;
  };
  return {handlers,shown,opened,click};
}
test('shows order payloads and recovers from malformed push JSON', async()=>{
  const w=worker();let result;
  w.handlers.push({data:{json:()=>({title:'Order #123',body:'Tamuning'})},waitUntil:p=>{result=p;}});
  await result;
  assert.equal(w.shown[0][0],'Order #123');
  w.handlers.push({data:{json:()=>{throw new Error('bad JSON');}},waitUntil:p=>{result=p;}});
  await result;
  assert.equal(w.shown[1][0],'Three Squares');
});
test('opens a safe order URL and rejects foreign notification destinations', async()=>{
  const w=worker();
  await w.click('/admin/orders?id=123');
  await w.click('https://evil.example/admin/orders');
  assert.deepEqual(w.opened,['https://orders.example.com/admin/orders?id=123','https://orders.example.com/admin/orders']);
});
test('focuses an existing admin window without navigating a storefront window', async()=>{
  let focused=false;let navigated='';
  const w=worker([
    {url:'https://orders.example.com/menu',navigate:async()=>{throw new Error('storefront hijacked');}},
    {url:'https://orders.example.com/admin/devices',navigate:async url=>{navigated=url;return {focus:()=>{focused=true;}};}},
  ]);
  await w.click('/admin/orders?id=123');
  assert.equal(navigated,'https://orders.example.com/admin/orders?id=123');
  assert.equal(focused,true);
  assert.equal(w.opened.length,0);
});
