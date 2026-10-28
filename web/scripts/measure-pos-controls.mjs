import { expect } from './geometry-assertions.mjs';
import { launchGeometryBrowser } from './geometry-browser.mjs';
import { prepareGeometryContext } from './geometry-context.mjs';
import {chromium,webkit} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const base=process.env.POS_FIXTURE_URL??'http://localhost:5391/fixtures/pos-controls.html';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local fixture required');
const out=path.resolve(process.env.UI_EVIDENCE_DIR??'../tmp/pos-controls');mkdirSync(out,{recursive:true});
const session=process.env.DEV_LIFECYCLE_SESSION;
const browser=await launchGeometryBrowser(chromium, );
if(session)execFileSync('dev-lifecycle',['claim','--session',session,'process',String(process.pid),'--reason','POS geometry and dialog acceptance runner']);
const results=[];
async function checkDialog(page){
  const opener=page.getByRole('button',{name:'Choose fixture reader',exact:true});
  await opener.click();const dialog=page.getByRole('dialog',{name:'Select Card Reader'});await dialog.waitFor();
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  await expect.poll(() => dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await expect(opener).toBeFocused();
  await opener.click();await page.getByRole('dialog').getByRole('button',{name:'Connect reader Fixture reader',exact:true}).click();
  await dialog.waitFor({state:'hidden'});await expect(opener).toBeFocused();
  await opener.click();await page.getByRole('button',{name:'Close Select Card Reader'}).click();await dialog.waitFor({state:'hidden'});
  await opener.click();await expect(dialog).toBeVisible();await page.mouse.click(2,2);await dialog.waitFor({state:'hidden'});
  await expect(opener).toBeFocused();
  await opener.click();await expect(dialog).toBeVisible();const box=await dialog.boundingBox();await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(2,2);await page.mouse.up();await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Choose busy fixture reader',exact:true}).click();await dialog.waitFor();await expect(page.getByRole('button',{name:'Close Select Card Reader'})).toBeDisabled();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event('fixture-reader-finished')));await page.getByRole('button',{name:'Close Select Card Reader'}).click();await dialog.waitFor({state:'hidden'});
}
try{
  for(const [width,height]of[[768,1024],[1024,768],[1440,900],[390,844]])for(const touch of[false,true]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch});await prepareGeometryContext(context, base);try{
      const page=await context.newPage();await page.goto(base);await page.getByRole('heading',{name:'POS geometry fixture'}).waitFor();
      const tiles=await page.locator('.pos-product-tile').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{height:r.height,radius:s.borderRadius,padding:s.padding,slots:['title','price','state'].map(name=>{const box=el.querySelector(`.pos-product-tile__${name}`).getBoundingClientRect();return{top:box.top-r.top,height:box.height};})}}));
      assert.equal(tiles.length,4);for(const tile of tiles){assert.ok(Math.abs(tile.height-128)<=1);assert.equal(tile.radius,'12px');assert.equal(tile.padding,'12px');assert.deepEqual(tile.slots.map(slot=>slot.height),[40,20,24]);for(let i=0;i<3;i++)assert.ok(Math.abs(tile.slots[i].top-tiles[0].slots[i].top)<=1);}
      assert.equal(await page.locator('.pos-product-tile').getByRole('button').count(),0);
      const group=page.getByRole('group',{name:'Quantity of Fixture meal',exact:true}),count=group.locator('output');const before=await count.boundingBox();
      const targets=await group.getByRole('button').evaluateAll(nodes=>nodes.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));
      assert.ok(targets.every(t=>t.width===44&&t.height===44));
      await group.getByRole('button',{name:'Increase quantity of Fixture meal',exact:true}).click();await expect(count).toHaveText('10');assert.equal((await count.boundingBox()).width,before.width);
      await page.getByRole('button',{name:'Toggle pending quantity'}).click();await expect(group).toHaveAttribute('aria-busy', 'true');await expect(group.getByRole('button').first()).toBeDisabled();assert.equal((await count.boundingBox()).width,before.width);
      const large=await page.getByRole('group',{name:'Quantity of Large fixture meal'}).getByRole('button').first().boundingBox();assert.equal(large.height,52);assert.equal(large.width,52);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(out,`controls-${width}-${touch?'touch':'fine'}.png`)});
      assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),touch);
      await checkDialog(page);results.push({width,height,touch,tiles,targets,quantity:'9→10; stable pending',dialog:'keyboard, Escape, return, choose, close, backdrop passed'});console.log(`${width} ${touch?'touch':'fine'} passed`);
    }finally{await context.close();}
  }
  const safari=await launchGeometryBrowser(webkit, );try{const context=await safari.newContext({viewport:{width:390,height:844}});await prepareGeometryContext(context, base);const page=await context.newPage();await page.goto(base);await checkDialog(page);results.push({browser:'WebKit',width:390,height:844,dialog:'passed'});}finally{await safari.close();}
  writeFileSync(path.join(out,'geometry.json'),JSON.stringify(results,null,2)+'\n');
}finally{await browser.close();if(session)execFileSync('dev-lifecycle',['release','--session',session,'process',String(process.pid)]);}
