import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin=process.argv[2]||'http://localhost:5173',output=process.argv[3]||'tmp/ui-operations';
mkdirSync(output,{recursive:true});const records=[];
for(const [engine,factory] of Object.entries({chromium,webkit})){
 const browser=await factory.launch();try{
 for(const [width,height] of [[768,1024],[1024,768],[1440,900],[390,844]])for(const touch of [false,true]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch}),page=await context.newPage();
 try{await page.goto(origin+'/fixtures/ui-operations.html');await page.getByRole('heading',{name:'Operational acceptance'}).waitFor();
 const header=await page.locator('[data-admin-page-header]').boundingBox();assert.equal(header.x,width<640?16:24);
 const brand=page.getByRole('link',{name:'Fictional admin brand',exact:true});const before=await brand.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));await brand.hover();assert.deepEqual(await brand.evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})),before);
 const field=page.getByRole('searchbox',{name:'Order search'});assert.equal((await field.boundingBox()).height,44);
 if(touch)assert.equal(await field.evaluate(e=>getComputedStyle(e).fontSize),'16px');
 assert.equal((await page.getByText('Acknowledged',{exact:true}).boundingBox()).height,24);
 const opener=page.getByRole('button',{name:'Open order',exact:true});await opener.click();const outer=page.getByRole('dialog',{name:'Fictional order',exact:true});await outer.waitFor();
 const actions=outer.locator('.ui-dialog-actions');const body=outer.locator('.overflow-y-auto');assert.ok(await body.evaluate(e=>e.scrollHeight>e.clientHeight && e.clientHeight>=96));
 for(const element of [actions,outer.locator('.ui-dialog-header')]){const r=await element.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height);}
 const nested=outer.getByRole('button',{name:'Open shipment'});await nested.click();const inner=page.getByRole('dialog',{name:'Fictional shipment'});await inner.waitFor();
 assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
 await inner.getByRole('button',{name:'Start pending operation'}).click();await page.keyboard.press('Escape');assert.equal(await inner.isVisible(),true);assert.equal(await inner.getByRole('button',{name:'Close Fictional shipment'}).isDisabled(),true);
 await inner.getByRole('button',{name:'Finish pending operation'}).click();await page.keyboard.press('Escape');await inner.waitFor({state:'hidden'});assert.equal(await nested.evaluate(e=>document.activeElement===e),true);assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
 await page.keyboard.press('Escape');await outer.waitFor({state:'hidden'});assert.equal(await opener.evaluate(e=>document.activeElement===e),true);assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden');
 await opener.click();await page.getByRole('dialog',{name:'Fictional order',exact:true}).getByRole('button',{name:'Close order',exact:true}).click();assert.equal(await opener.evaluate(e=>document.activeElement===e),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await opener.click();await page.screenshot({path:`${output}/${engine}-${width}-${touch?'touch':'fine'}.png`});
 records.push({engine,width,height,touch,status:'passed',headerGutter:header.x});writeFileSync(output+'/measurements.json',JSON.stringify(records,null,2));console.log(engine,width,touch?'touch':'fine','passed');
 }finally{await context.close();}
 }
 }finally{await browser.close();}
}
