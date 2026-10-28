import { expect, expectHash } from './geometry-assertions.mjs';
import { launchGeometryBrowser } from './geometry-browser.mjs';
import { prepareGeometryContext } from './geometry-context.mjs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Standalone acceptance runner: no server, auth, database or provider startup.
const base = process.env.UI_FIXTURE_URL ?? 'http://localhost:5391/fixtures/ui-controls.html';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use an isolated local fixture only');
const output = path.resolve(process.env.UI_EVIDENCE_DIR ?? '../tmp/ui-controls');
mkdirSync(output, {recursive:true});
const lifecycle = process.env.DEV_LIFECYCLE_SESSION;
const browser = await launchGeometryBrowser(chromium, {headless:true});
if (lifecycle) execFileSync('dev-lifecycle', ['claim','--session',lifecycle,'process',String(process.pid),'--reason','Shared controls geometry runner and its Chromium descendants']);
const luminance = rgb => rgb.map(c => {const x=c/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
const contrast = (foreground, background) => {
  const fg=luminance(foreground.match(/[\d.]+/g).slice(0,3).map(Number));
  const bg=luminance((background==='rgba(0, 0, 0, 0)'?'rgb(248,249,244)':background).match(/[\d.]+/g).slice(0,3).map(Number));
  return (Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
};
const results = [];
try {
  for (const [width,height] of [[768,1024],[1024,768],[1440,900],[390,844]]) {
    for (const touch of [false,true]) {
      const context = await browser.newContext({viewport:{width,height},hasTouch:touch,deviceScaleFactor:1});await prepareGeometryContext(context, base);
      try {
        const page = await context.newPage();
        const activate = locator => touch ? locator.tap() : locator.click();
        await page.goto(base);
        await page.getByRole('heading',{name:'Shared controls',exact:true}).waitFor();
        await page.evaluate(() => document.fonts.ready);
        const coarse = await page.evaluate(() => matchMedia('(pointer:coarse)').matches);
        assert.equal(coarse,touch);
        const geometry = await page.locator('[data-geometry]').evaluateAll(elements => elements.map(el => {
          const s=getComputedStyle(el), r=el.getBoundingClientRect(), icon=el.querySelector('.ui-button__icon'), content=el.querySelector('.ui-button__content');
          return {id:el.dataset.geometry,height:r.height,width:r.width,font:s.fontSize,line:s.lineHeight,weight:s.fontWeight,radius:s.borderRadius,border:s.borderTopWidth,box:s.boxSizing,padding:s.padding,gap:getComputedStyle(content).gap,icon:icon?.getBoundingClientRect().width,color:s.color,background:s.backgroundColor,transform:s.transform};
        }));
        for (const item of geometry) {
          const size=item.id.split('-')[0], expected=size==='lg'?52:(size==='sm'&&!touch?36:44);
          assert.ok(Math.abs(item.height-expected)<=1,JSON.stringify(item));
          if (item.id.endsWith('-icon')) assert.ok(Math.abs(item.width-expected)<=1,JSON.stringify(item));
          item.contrast=contrast(item.color,item.background); assert.ok(item.contrast>=4.5,JSON.stringify(item));
          assert.equal(item.font,size==='lg'?'16px':'14px'); assert.equal(item.line,size==='lg'?'24px':'20px');
          assert.equal(item.weight,'600'); assert.equal(item.radius,'8px'); assert.equal(item.border,'1px'); assert.equal(item.box,'border-box');
          assert.equal(item.gap,'8px'); assert.equal(item.icon,size==='lg'?20:16); assert.equal(item.transform,'none');
        }
        const badges=await page.locator('.ui-status-badge').evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,font:s.fontSize,line:s.lineHeight,weight:s.fontWeight}}));
        for (const badge of badges) assert.deepEqual(badge,{height:24,font:'12px',line:'16px',weight:'600'});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),true);
        await page.screenshot({path:path.join(output,`recipes-${width}-${touch?'touch':'fine'}.png`),fullPage:false});
        const postCapture=await page.locator('[data-geometry="sm-primary"]').evaluate(el => ({height:el.getBoundingClientRect().height,coarse:matchMedia('(pointer:coarse)').matches}));
        assert.equal(postCapture.coarse, touch); assert.equal(postCapture.height,touch?44:36);
        const subject=page.getByTestId('loading-subject'), before=await subject.boundingBox(), short=page.getByTestId('short-loading-subject'), shortBefore=await short.boundingBox();
        await activate(page.getByRole('button',{name:'Toggle loading',exact:true}));
        await expect(subject).toHaveAttribute('aria-busy', 'true');
        const after=await subject.boundingBox(), shortAfter=await short.boundingBox();
        assert.ok(Math.abs(shortBefore.width-shortAfter.width)<=1);
        assert.ok(Math.abs(before.width-after.width)<=1); assert.ok(Math.abs(before.height-after.height)<=1);
        await expect(subject).toBeDisabled();
        await activate(page.getByRole('button',{name:'Toggle loading',exact:true}));
        const primary=page.locator('[data-geometry="md-primary"]');
        await primary.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        await expect(primary).toBeFocused();
        await expect(primary).toHaveCSS('outline-width', '2px');
        const focus=await primary.evaluate(el => {const s=getComputedStyle(el);return {width:s.outlineWidth,offset:s.outlineOffset,style:s.outlineStyle}});
        assert.deepEqual(focus,{width:'2px',offset:'2px',style:'solid'});
        await activate(page.getByRole('link',{name:'Anchor destination',exact:true})); await expectHash(page, '#anchor-target');
        await activate(page.getByRole('link',{name:'Router destination',exact:true})); await expectHash(page, '#router-target');
        const disabledLink=page.getByRole('link',{name:'Disabled link',exact:true});
        assert.equal(await disabledLink.getAttribute('href'),null); assert.equal(await disabledLink.getAttribute('tabindex'),'-1');
        await disabledLink.click({force:true}); await expectHash(page, '#router-target');
        await activate(page.getByRole('link',{name:'Open linked target',exact:true})); await expectHash(page, '#icon-target');
        await page.getByText('Icon target',{exact:true}).waitFor();
        await activate(page.getByRole('button',{name:'Submit fixture',exact:true})); await page.getByText('Form submitted',{exact:true}).waitFor();
        const retry=page.getByRole('region',{name:'Adopted recovery controls'}).getByRole('button',{name:'Retry',exact:true});
        const retryBefore=await retry.boundingBox();
        await activate(retry);
        await expect(retry).toHaveAttribute('aria-busy', 'true'); await expect(retry).toBeDisabled();
        const retryPending=await retry.boundingBox();
        assert.ok(Math.abs(retryBefore.width-retryPending.width)<=1);
        assert.ok(Math.abs(retryBefore.height-retryPending.height)<=1);
        assert.ok(Math.abs(retryBefore.x-retryPending.x)<=1);
        await page.getByText('Example records recovered',{exact:true}).waitFor();
        await activate(page.getByRole('button',{name:'Trigger recoverable error',exact:true}));
        await page.getByRole('heading',{name:'This page could not be loaded',exact:true}).waitFor();
        await page.getByRole('region',{name:'Adopted recovery controls'}).scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,`recovery-${width}-${touch?'touch':'fine'}.png`),fullPage:false});
        await activate(page.getByRole('region',{name:'Adopted recovery controls'}).getByRole('button',{name:'Reload page',exact:true}));
        await page.getByText('Recovery fixture loaded',{exact:true}).waitFor();
        assert.equal(await page.getByRole('heading',{name:'This page could not be loaded',exact:true}).count(),0);
        const choices=page.getByRole('group',{name:'Fixture stages'});
        const choiceGeometry=await choices.getByRole('button').evaluateAll(nodes=>nodes.map(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width})));
        for(const item of choiceGeometry){assert.equal(item.height,44);assert.ok(item.width>=44);}
        await activate(choices.getByRole('button',{name:'Ready',exact:true}));
        await expect(choices.getByRole('button',{name:'Ready',exact:true})).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByTestId('selected-stage')).toHaveText('ready');
        await activate(page.getByRole('link',{name:'View Orders',exact:true}));await expectHash(page, '#tile-target');
        const tiles=await page.locator('.ui-action-tile').evaluateAll(nodes=>nodes.map(el=>el.getBoundingClientRect().height));
        assert.deepEqual(tiles,[112,112]);
        results.push({width,height,touch,coarse,geometry,focus,loading:{before,after,shortBefore,shortAfter,retryBefore,retryPending},scenarios:['A01','A02','A03'],status:'passed'});
        writeFileSync(path.join(output,'geometry.json'),JSON.stringify(results,null,2)+'\n');
        console.log(`${width}x${height} ${touch?'touch':'fine'}: geometry, loading, links, focus, form, retry/reload passed`);
      } finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  if (lifecycle) execFileSync('dev-lifecycle',['release','--session',lifecycle,'process',String(process.pid)]);
}
