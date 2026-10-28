import { launchGeometryBrowser } from './geometry-browser.mjs';
import { prepareGeometryContext } from './geometry-context.mjs';
import {chromium, webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
const origin = process.argv[2] || 'http://localhost:5173';
const output = process.argv[3] || 'tmp/ui-admin';
mkdirSync(output,{recursive:true});
const records=[];
for(const [engine, factory] of Object.entries({chromium,webkit})) {
  const browser=await launchGeometryBrowser(factory, );
  try {
    for(const [width,height] of [[768,1024],[1024,768],[1440,900],[390,844]]) for(const touch of [false,true]) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:touch});await prepareGeometryContext(context, origin);
      const page=await context.newPage();
      const activate=locator=>touch?locator.tap():locator.click();
      try {
        await page.goto(origin+'/fixtures/ui-admin.html');
        await page.getByRole('heading',{name:'Admin control acceptance'}).waitFor();
        await page.evaluate(()=>document.fonts.ready);
        const targets=await page.locator('[data-ui-control="switch"], [data-ui-control="file"], [data-ui-control="check"], summary[data-ui-control], nav[aria-label="Pagination"] button').evaluateAll(elements=>elements.filter(el=>el.getBoundingClientRect().height).map(el=>{
          const r=el.getBoundingClientRect();return {name:el.getAttribute('aria-label') || el.textContent.trim(),height:r.height,width:r.width};
        }));
        for(const target of targets)assert.ok(target.height>=44 && target.width>=44, JSON.stringify(target));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const menu=page.locator('summary[aria-label="More actions for fictional lunch"]');
        await menu.focus();await page.keyboard.press('Enter');
        await page.getByRole('button',{name:'Duplicate',exact:true}).waitFor({state:'visible'});
        await page.keyboard.press(engine === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');assert.equal(await page.getByRole('button',{name:'Duplicate',exact:true}).evaluate(el=>document.activeElement===el),true);
        await page.keyboard.press(engine === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');assert.equal(await page.getByRole('button',{name:'Archive',exact:true}).evaluate(el=>document.activeElement===el),true);
        await page.keyboard.press(engine === 'webkit' && process.platform === 'darwin' ? 'Alt+Shift+Tab' : 'Shift+Tab');assert.equal(await page.getByRole('button',{name:'Duplicate',exact:true}).evaluate(el=>document.activeElement===el),true);
        await page.keyboard.press('Escape');assert.equal(await menu.evaluate(el=>document.activeElement===el && !el.parentElement.open),true);
        await activate(menu);await activate(page.getByRole('button',{name:'Archive',exact:true}));
        await page.getByText('Command: Archive',{exact:true}).waitFor();assert.equal(await menu.evaluate(el=>document.activeElement===el && !el.parentElement.open),true);
        await activate(menu);await activate(page.getByRole('button',{name:'Outside target',exact:true}));assert.equal(await menu.evaluate(el=>el.parentElement.open),false);
        await activate(page.getByRole('switch',{name:'Ordering enabled',exact:true}));assert.equal(await page.getByRole('switch',{name:'Ordering enabled',exact:true}).getAttribute('aria-checked'),'true');
        await page.getByLabel('Featured fictional lunch',{exact:true}).check();assert.equal(await page.getByLabel('Featured fictional lunch',{exact:true}).isChecked(),true);
        await page.getByLabel('Choose Menu CSV',{exact:true}).setInputFiles({name:'fictional-menu.csv',mimeType:'text/csv',buffer:Buffer.from('name,price\nLunch,12.00')});await page.getByText('Command: fictional-menu.csv',{exact:true}).waitFor();
        await activate(page.getByRole('button',{name:'Page 51',exact:true}));assert.equal(await page.getByRole('button',{name:'Page 51',exact:true}).getAttribute('aria-current'),'page');
        await activate(page.locator('summary[data-ui-control="disclosure"]'));await page.getByText('Shipping details remain inside the native disclosure.').waitFor({state:'visible'});
        const edge=page.locator('summary[aria-label="More actions near screen edge"]');await activate(edge);
        await page.getByRole('button',{name:'Bottom command',exact:true}).waitFor();
        const bounds=await edge.locator('..').locator('.ui-action-menu__commands').boundingBox();
        assert.ok(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width && bounds.y+bounds.height<=height,JSON.stringify(bounds));
        await page.keyboard.press('Escape');
        await page.screenshot({path:`${output}/${engine}-${width}-${touch?'touch':'fine'}.png`});
        records.push({engine,width,height,touch,targets,status:'passed'});writeFileSync(output+'/measurements.json',JSON.stringify(records,null,2));
        console.log(engine,width,touch?'touch':'fine','passed');
      } finally {await context.close();}
    }
  } finally {await browser.close();}
}
