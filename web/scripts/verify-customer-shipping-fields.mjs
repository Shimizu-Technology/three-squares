import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import{mkdirSync,writeFileSync}from'node:fs';import{execFileSync}from'node:child_process';import path from'node:path';
const db=process.env.CUSTOMER_DEMO_DB,base=process.env.CUSTOMER_BASE_URL??'http://localhost:5691',session=process.env.DEV_LIFECYCLE_SESSION;
if(!db||!/^tsq_uniform_c_.*demo$/.test(db)||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Owned local demo required');
const output=path.resolve(process.env.UI_EVIDENCE_DIR??'../tmp/shipping-fields');mkdirSync(output,{recursive:true});const results=[];
const sql=q=>execFileSync('psql',['-X','-A','-t','-d',db,'-c',q],{encoding:'utf8'}).trim();
const original=sql("SELECT allow_shipping FROM products WHERE slug='french-toast-only'");assert.ok(['t','f'].includes(original));
if(session)execFileSync('dev-lifecycle',['claim','--session',session,'process',String(process.pid),'--reason','Shipping fields browser descendants']);
try{
 sql("UPDATE products SET allow_shipping=true WHERE slug='french-toast-only'");
 for(const[engine,type]of[['chromium',chromium],['webkit',webkit]]){const browser=await type.launch();try{
  for(const[width,height]of[[768,1024],[1024,768],[1440,900],[390,844]])for(const touch of[false,true]){const c=await browser.newContext({viewport:{width,height},hasTouch:touch}),p=await c.newPage(),label=`${engine}-${width}-${touch?'touch':'fine'}`;try{
   await p.goto(`${base}/products/french-toast-only`);await p.getByRole('button',{name:/Three Squares Main/}).click();await p.getByRole('button',{name:'Add to Cart',exact:true}).click();await p.getByRole('button',{name:'Secure Checkout',exact:true}).click();const ship=p.getByRole('button',{name:'Ship to Address',exact:true});await ship.click();await expect(ship).toHaveAttribute('aria-pressed','true');
   const scope=p.getByRole('region',{name:'Shipping details'});await scope.locator('#street1').waitFor();const geometry=await scope.locator('.ui-input,.ui-select').evaluateAll(els=>els.map(el=>({id:el.id,label:el.labels?.[0]?.textContent,height:el.getBoundingClientRect().height,font:getComputedStyle(el).fontSize,tag:el.tagName})));
   assert.equal(geometry.length,6);for(const field of geometry){assert.ok(field.id&&field.label);assert.equal(field.height,44);assert.equal(field.font,touch?'16px':'14px');}assert.equal(geometry.find(x=>x.id==='country').tag,'SELECT');
   if(touch){
    await p.locator('#street1').fill('123 Example Way');await p.locator('#city').fill('Fictional City');await p.locator('#state').fill('GU');await p.locator('#zip').fill('96913');await p.locator('#country').selectOption('GU');const calculate=p.getByRole('button',{name:'Calculate Shipping Rates',exact:true});
    await p.route('**/api/v1/shipping/**',route=>route.fulfill({status:500,json:{error:'Fictional rates unavailable'}}));await calculate.click();await expect(p.getByText('Fictional rates unavailable',{exact:true})).toBeVisible();await expect(p.locator('#street1')).toHaveValue('123 Example Way');await p.unroute('**/api/v1/shipping/**');
    await p.route('**/api/v1/shipping/**',async route=>{await new Promise(r=>setTimeout(r,800));await route.fulfill({status:200,json:{total_weight_oz:16,rates:[{carrier:'Fictional Post',service:'Ground',rate_cents:500,delivery_days:3},{carrier:'Fictional Post',service:'Express',rate_cents:1000,delivery_days:1}]}});});
    const before=await calculate.boundingBox();await calculate.click();await expect(calculate).toBeDisabled();assert.deepEqual(await calculate.boundingBox(),before);const ground=p.getByRole('button',{name:/Fictional Post - Ground/}),express=p.getByRole('button',{name:/Fictional Post - Express/});await expect(ground).toHaveAttribute('aria-pressed','true');await express.click();await expect(express).toHaveAttribute('aria-pressed','true');await expect(ground).toHaveAttribute('aria-pressed','false');assert.equal((await express.boundingBox()).height,52);await expect(p.getByText('Estimated delivery: 1 business days',{exact:true})).toBeVisible();
   }
   await scope.scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:path.join(output,`shipping-${label}.png`)});results.push({engine,width,height,touch,geometry,status:'passed',rates:touch?'Local response fixture: failure, pending retry, selection; no provider request':'not_run'});writeFileSync(path.join(output,'shipping-fields.json'),JSON.stringify(results,null,2)+'\n');console.log(`${label}: shipping geometry${touch?', retained address and local rate retry/selection':''} passed`);
  }catch(error){await p.screenshot({path:path.join(output,`shipping-failure-${label}.png`)});throw error;}finally{await c.close();}}
 }finally{await browser.close();}}
}finally{sql(`UPDATE products SET allow_shipping=${original==='t'} WHERE slug='french-toast-only'`);if(session)execFileSync('dev-lifecycle',['release','--session',session,'process',String(process.pid)]);}
