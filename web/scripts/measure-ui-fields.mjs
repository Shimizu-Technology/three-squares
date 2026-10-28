import { launchGeometryBrowser } from './geometry-browser.mjs';
import { prepareGeometryContext } from './geometry-context.mjs';
import { chromium, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const base=process.env.UI_FIXTURE_URL||'http://localhost:5593/fixtures/ui-fields.html';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Use an isolated local fixture only');
const out=path.resolve(process.env.UI_EVIDENCE_DIR||'../tmp/ui-fields'),session=process.env.DEV_LIFECYCLE_SESSION;
mkdirSync(out,{recursive:true});if(session)execFileSync('dev-lifecycle',['claim','--session',session,'process',String(process.pid),'--reason','Shared fields geometry and browser descendants']);
let browser;const results=[];
try{for(const engine of ['chromium','webkit']){
 browser=await launchGeometryBrowser({chromium,webkit}[engine],{headless:true});
 for(const [width,height]of [[768,1024],[1024,768],[1440,900],[390,844]])for(const touch of [false,true]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:1});await prepareGeometryContext(context, base);
  try{
   const page=await context.newPage(),activate=loc=>touch?loc.tap():loc.click();await page.goto(base);await page.getByRole('heading',{name:'Shared fields',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
   const coarse=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);assert.equal(coarse,touch);
   const geometry=await page.locator('.ui-field').evaluateAll(nodes=>nodes.map(el=>{const control=el.querySelector('input,select,textarea'),label=el.querySelector('label'),r=control.getBoundingClientRect(),l=label.getBoundingClientRect(),s=getComputedStyle(control);return{tag:control.tagName,label:label.textContent,id:control.id,for:label.htmlFor,height:r.height,width:r.width,gap:r.y-l.bottom,font:s.fontSize,line:s.lineHeight,radius:s.borderRadius,border:s.borderTopWidth,describedBy:control.getAttribute('aria-describedby')}}));
   for(const field of geometry){assert.equal(field.for,field.id);assert.equal(field.gap,4);assert.equal(field.font,touch?'16px':'14px');assert.equal(field.line,touch?'24px':'20px');assert.equal(field.radius,'8px');assert.equal(field.border,'1px');if(field.tag==='TEXTAREA')assert.ok(field.height>=96);else assert.equal(field.height,44);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await activate(page.getByRole('button',{name:'Save fixture',exact:true}));await page.getByText('Enter a device name.',{exact:true}).waitFor();const name=page.getByRole('textbox',{name:'Device name',exact:true});assert.equal(await name.getAttribute('aria-invalid'),'true');
   const descriptions=(await name.getAttribute('aria-describedby')).split(' ');assert.equal(descriptions.length,2);for(const id of descriptions)assert.equal(await page.locator(`[id="${id}"]`).count(),1);
   await name.fill('Fictional Kitchen');await page.getByRole('combobox',{name:'Order alert location',exact:true}).selectOption('south');await page.getByRole('textbox',{name:'Notes',exact:true}).fill('Fictional details');await activate(page.getByRole('button',{name:'Save fixture',exact:true}));await page.getByText('Fictional Kitchen · south · Fictional details',{exact:true}).waitFor();assert.equal(await name.getAttribute('aria-invalid'),null);
   await name.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');const focus=await name.evaluate(el=>{const s=getComputedStyle(el);return{width:s.outlineWidth,offset:s.outlineOffset,style:s.outlineStyle}});assert.deepEqual(focus,{width:'2px',offset:'2px',style:'solid'});
   await activate(page.getByRole('button',{name:'Toggle disabled',exact:true}));for(const control of await page.locator('input,select,textarea').all())assert.equal(await control.isDisabled(),true);await activate(page.getByRole('button',{name:'Toggle disabled',exact:true}));
   await page.screenshot({path:path.join(out,`${engine}-${width}-${touch?'touch':'fine'}.png`)});assert.equal(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches),touch);assert.equal(await name.evaluate(el=>el.getBoundingClientRect().height),44);
   results.push({engine,width,height,touch,geometry,focus,status:'passed'});writeFileSync(path.join(out,'geometry.json'),JSON.stringify(results,null,2));console.log(engine,width,touch?'touch':'fine','fields, labels, help/error, native submit, focus and disabled passed');
  }finally{await context.close();}
 }
 await browser.close();browser=null;
}}finally{await browser?.close();if(session)try{execFileSync('dev-lifecycle',['release','--session',session,'process',String(process.pid)]);}catch{}}
