import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const base = process.env.CUSTOMER_BASE_URL ?? 'http://localhost:5691';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local demo only');
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? '../tmp/customer-actions');
mkdirSync(output, {recursive:true});
const session=process.env.DEV_LIFECYCLE_SESSION, results=[];
if(session)execFileSync('dev-lifecycle',['claim','--session',session,'process',String(process.pid),'--reason','Customer CTA browser descendants']);
const geometry=locator=>locator.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {width:r.width,height:r.height,y:r.y,bottom:r.bottom,font:s.fontSize,line:s.lineHeight,radius:s.borderRadius,border:s.borderWidth,tag:el.tagName,href:el.getAttribute('href')};});
try {
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  if(process.env.CUSTOMER_QA_ENGINE && process.env.CUSTOMER_QA_ENGINE!==engine)continue;
  const browser=await type.launch();
  try {
   for(const [width,height] of [[768,1024],[1024,768],[1440,900],[390,844],...(engine==='webkit'?[[375,812]]:[])])for(const touch of [false,true]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:'reduce'});
    const page=await context.newPage(), label=`${engine}-${width}-${touch?'touch':'fine'}`;
    try{
     await page.goto(base);
     const hero=page.locator('section').first(), pair=hero.locator('.ui-button');
     await expect(pair).toHaveCount(2);
     const heroGeometry=await Promise.all([geometry(pair.nth(0)),geometry(pair.nth(1))]);
     for(const item of heroGeometry){assert.equal(item.height,52);assert.equal(item.font,'16px');assert.equal(item.line,'24px');assert.equal(item.radius,'8px');assert.equal(item.border,'1px');assert.equal(item.tag,'A');}
     // macOS WebKit uses Option+Tab to include links in keyboard traversal.
     const tab=engine==='webkit'?'Alt+Tab':'Tab', back=engine==='webkit'?'Alt+Shift+Tab':'Shift+Tab';
     await pair.nth(1).focus();await page.keyboard.press(back);await expect(pair.nth(0)).toBeFocused();await page.keyboard.press(tab);await expect(pair.nth(1)).toBeFocused();
     assert.equal(await pair.nth(1).evaluate(el=>getComputedStyle(el).outlineWidth),'2px');
     await page.screenshot({path:path.join(output,`home-${label}.png`)});
     await page.goto(`${base}/locations`);
     const frames=page.locator('[data-customer-card="location"]');await expect(frames).toHaveCount(2);
     await frames.first().scrollIntoViewIfNeeded();
     const locations=await frames.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),m=el.querySelector('.customer-card__media').getBoundingClientRect(),action=el.querySelector('a.ui-button').getBoundingClientRect();return {tag:el.tagName,y:r.y,bottom:r.bottom,mediaWidth:m.width,mediaHeight:m.height,actionBottom:action.bottom};}));
     for(const item of locations){assert.equal(item.tag,'ARTICLE');assert.ok(Math.abs(item.mediaWidth/item.mediaHeight-4/3)<0.01);}
     if(width>=1024)assert.ok(Math.abs(locations[0].actionBottom-locations[1].actionBottom)<=1,JSON.stringify(locations));
     for(const el of await page.locator('a[data-ui-navigation]:visible, a.ui-button:visible').all()){const g=await geometry(el);assert.ok(g.height>=44&&g.width>=44,JSON.stringify(g));assert.equal(g.tag,'A');}
     await page.evaluate(()=>scrollTo(0,0));
     await page.screenshot({path:path.join(output,`locations-${label}.png`),fullPage:true});
     const nav=page.locator('nav.public-nav');await page.evaluate(()=>scrollTo(0,0));
     if(width<1024){
      const toggle=nav.getByRole('button',{name:'Toggle menu',exact:true});assert.equal((await geometry(toggle)).height,44);await toggle.click();
      const shop=nav.getByRole('button',{name:'Shop',exact:true});assert.equal((await geometry(shop)).height,44);
      const id=await shop.getAttribute('aria-controls');assert.ok(await page.locator(`[id="${id}"]`).count());
      await expect(shop).toHaveAttribute('aria-expanded','false');await shop.click();await expect(shop).toHaveAttribute('aria-expanded','true');
      await nav.getByRole('link',{name:'All Products',exact:true}).click();await expect(page).toHaveURL(/\/products$/);
      await expect(shop).not.toBeVisible();
     }else{
      await nav.getByRole('link',{name:'Catering',exact:true}).click();await expect(page).toHaveURL(/\/catering$/);
     }
     await page.goto(`${base}/catering`);const quote=page.getByRole('button',{name:'Request a quote',exact:true}).first();assert.equal((await geometry(quote)).height,52);await quote.click();
     await expect(page.getByRole('dialog',{name:'Request a Catering Quote'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
     await page.goto(`${base}/account`);const signIn=page.getByRole('button',{name:'Sign In',exact:true});await expect(signIn).toBeVisible();assert.equal((await geometry(signIn)).height,44);
     await page.goto(`${base}/orders`);const history=page.getByRole('button',{name:'Sign in for order history',exact:true});await expect(history).toBeVisible();assert.equal((await geometry(history)).height,44);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     results.push({engine,width,height,touch,hero:heroGeometry,locations,status:'passed'});
     writeFileSync(path.join(output,'actions.json'),JSON.stringify(results,null,2)+'\n');console.log(`${label}: hero, locations, native navigation, inquiry entry, signed-out account/history passed`);
    }catch(error){await page.screenshot({path:path.join(output,`failure-${label}.png`)});throw error;}finally{await context.close();}
   }
  }finally{await browser.close();}
 }
}finally{if(session)execFileSync('dev-lifecycle',['release','--session',session,'process',String(process.pid)]);}
