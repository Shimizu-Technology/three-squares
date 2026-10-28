import {chromium,webkit,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const base=process.env.CUSTOMER_BASE_URL??'http://localhost:5691',api=process.env.CUSTOMER_API_URL??'http://localhost:3601';
for(const url of[base,api])if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local demo only');
// Match the task-owned launcher ledger before creating any retained orders.
const db = process.env.CUSTOMER_DEMO_DB;
if (!db || !/^tsq_uniform_c_.*demo$/.test(db)) throw new Error("Explicit owned tsq_uniform_c_*demo DB required");
const ledger = JSON.parse(readFileSync(new URL('../../tmp/demo/pids.json', import.meta.url), 'utf8'));
assert.equal(ledger.database, db, "Demo launcher must use the explicitly owned DB");
assert.ok(process.env.DEV_LIFECYCLE_SESSION, "Lifecycle session required");
process.kill(ledger.supervisor.pid, 0);
const apiProcess = ledger.children.find(child => child.label === 'api');
assert.ok(apiProcess, "Owned API process required");
const apiCommand = execFileSync('ps', ['-p', String(apiProcess.pid), '-o', 'command='], {encoding:'utf8'});
assert.ok(apiCommand.includes(new URL(api).port), "API URL must match the task's launcher");
const listener = execFileSync('lsof', ['-a', '-p', String(apiProcess.pid), '-iTCP:' + new URL(api).port, '-sTCP:LISTEN', '-t'], {encoding:'utf8'}).trim();
assert.equal(listener, String(apiProcess.pid), "Task API must own the requested port");
const output=path.resolve(process.env.UI_EVIDENCE_DIR??'../tmp/customer-forms');mkdirSync(output,{recursive:true});
const session=process.env.DEV_LIFECYCLE_SESSION,run=Date.now(),results=[];
if(session)execFileSync('dev-lifecycle',['claim','--session',session,'process',String(process.pid),'--reason','Customer forms browser descendants']);
async function measure(scope,touch){
 const data=await scope.locator('.ui-field .ui-input,.ui-field .ui-select,.ui-field .ui-textarea').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {id:el.id,tag:el.tagName,type:el.type,width:r.width,height:r.height,font:s.fontSize,line:s.lineHeight,resize:s.resize,label:el.labels?.[0]?.textContent,required:el.required,described:el.getAttribute('aria-describedby'),validDescriptions:(el.getAttribute('aria-describedby')??'').split(/\s+/).filter(Boolean).every(id=>!!document.getElementById(id))};}));
 assert.ok(data.length>0);for(const item of data){assert.ok(item.id&&item.label,JSON.stringify(item));assert.ok(item.width>0);assert.equal(item.font,touch?'16px':'14px');assert.equal(item.line,touch?'24px':'20px');assert.ok(item.validDescriptions);if(item.tag==='TEXTAREA'){assert.ok(item.height>=96);assert.equal(item.resize,'vertical');}else assert.equal(item.height,44,JSON.stringify(item));}return data;
}
const rect=async l=>{await l.evaluate(()=>document.fonts.ready.then(()=>undefined));return l.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));};
const allowedOrigins = new Set([new URL(base).origin,new URL(api).origin]);
const localOnly = route => allowedOrigins.has(new URL(route.request().url()).origin) ? route.continue() : route.abort();
async function protectWrites(page){await page.waitForFunction(()=>!window.Clerk || window.Clerk.loaded);await page.route('**/*',localOnly);}
async function checkout(page){await page.goto(`${base}/products/cheeseburger`);const main=page.getByRole('button',{name:/Three Squares Main/});await main.waitFor();await main.click();const add=page.getByRole('button',{name:'Add to Cart',exact:true});await expect(add).toBeEnabled();await add.click();await page.getByRole('button',{name:'Secure Checkout',exact:true}).click();await page.locator('#phone').waitFor();}
try{
 for(const[engine,type]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch();try{
   for(const[width,height]of[[768,1024],[1024,768],[1440,900],[390,844],...(engine==='webkit'?[[375,812]]:[])])for(const touch of[false,true]){
    if(process.env.CUSTOMER_QA_ENGINE&&engine!==process.env.CUSTOMER_QA_ENGINE)continue;
    if(process.env.CUSTOMER_QA_WIDTH&&width!==Number(process.env.CUSTOMER_QA_WIDTH))continue;
    if(process.env.CUSTOMER_QA_TOUCH==='1'&&!touch)continue;
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,serviceWorkers:'block'}),page=await context.newPage(),label=`${engine}-${width}-${touch?'touch':'fine'}`,email=`forms-${run}-${label}@example.test`;
    const item={engine,width,height,touch,email,status:'passed'};
    await context.route(url=>url.pathname.startsWith('/api/')&&url.origin!==new URL(api).origin,route=>route.abort());
    try{
     await page.goto(`${base}/catering?inquiry=true`);const dialog=page.getByRole('dialog',{name:'Request a Catering Quote'});await expect(dialog).toBeVisible();item.catering=await measure(dialog,touch);await page.screenshot({path:path.join(output,`catering-${label}.png`)});
     const submit=dialog.getByRole('button',{name:'Submit Inquiry',exact:true});assert.equal((await rect(submit)).height,52);
     if(touch){
      let posts=0;await page.route('**/api/v1/catering',async route=>{posts++;await route.fulfill({status:422,json:{errors:['Fictional inquiry service failure']}});});
      await submit.click();assert.equal(posts,0);await expect(dialog.locator('#catering-contact-name')).toBeFocused();
      await dialog.getByLabel(/^Name(?: \*)?$/).fill('Fictional Inquiry');await dialog.getByLabel(/^Email(?: \*)?$/).fill(email);await dialog.getByLabel(/^Event Type(?: \*)?$/).selectOption('corporate');await dialog.getByLabel(/^Number of Guests(?: \*)?$/).fill('15');
      const date=dialog.getByLabel(/^Event Date(?: \*)?$/),min=await date.getAttribute('min'),future=new Date(`${min}T00:00:00Z`);future.setUTCDate(future.getUTCDate()+7);await date.fill(future.toISOString().slice(0,10));
      assert.equal(await date.getAttribute('aria-describedby'),'catering-event-date-help');
      await submit.click();const error=dialog.getByRole('alert');await expect(error).toHaveText('Fictional inquiry service failure');await expect(error).toBeFocused();await expect(dialog.getByLabel(/^Name(?: \*)?$/)).toHaveValue('Fictional Inquiry');assert.equal(posts,1);await page.unroute('**/api/v1/catering');
      await page.route('**/api/v1/catering',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,800));await route.fulfill({response});});
      const before=await rect(submit),saved=page.waitForResponse(r=>r.url()===`${api}/api/v1/catering`&&r.status()===201);await submit.click();await expect(submit).toBeDisabled();assert.deepEqual(await rect(submit),before);
      await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();item.inquiry=(await(await saved).json()).inquiry;
      await page.getByRole('button',{name:/Request a quote/i}).first().click();await expect(page.getByRole('heading',{name:'Thank You!',exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByRole('status')).toBeFocused();await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
      await page.unroute('**/api/v1/catering');
     }
     await page.goto(`${base}/contact`);await page.locator('#message').waitFor();item.contact=await measure(page,touch);await page.locator('#message').scrollIntoViewIfNeeded();
     if(touch){
      const send=page.getByRole('button',{name:'Send Message',exact:true});let posts=0;await page.route('**/api/v1/contact',async route=>{posts++;await route.fulfill({status:500,json:{errors:['Fictional contact service failure']}});});
      await send.click();assert.equal(posts,0);await page.getByLabel(/^Your Name(?: \*)?$/).fill('Fictional Contact');await page.getByLabel(/^Email Address(?: \*)?$/).fill(email);await page.getByLabel(/^Subject(?: \*)?$/).selectOption('general');await page.getByLabel(/^Message(?: \*)?$/).fill('Fictional fixture message for UI acceptance.');await send.click();
      const error=page.getByRole('alert');await expect(error).toHaveText('Fictional contact service failure');await expect(error).toBeFocused();await expect(page.getByLabel(/^Message(?: \*)?$/)).toHaveValue('Fictional fixture message for UI acceptance.');assert.equal(posts,1);await page.unroute('**/api/v1/contact');
      await page.route('**/api/v1/contact',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,800));await route.fulfill({response});});
      const before=await rect(send);await send.click();await expect(send).toBeDisabled();assert.deepEqual(await rect(send),before);await expect(page.getByRole('heading',{name:'Mahalo for reaching out!',exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Mahalo for reaching out!'})).toBeFocused();
      await page.getByRole('button',{name:'Send another message',exact:true}).click();await expect(page.getByLabel(/^Your Name(?: \*)?$/)).toHaveValue('');await page.unroute('**/api/v1/contact');item.contactSaved=true;
     }
     await page.screenshot({path:path.join(output,`contact-${label}.png`)});
     await checkout(page);item.checkout=await measure(page,touch);
     if(touch){
      const pay=page.getByRole('button',{name:'Pay $12.95',exact:true});await expect(pay).toBeDisabled();await page.getByLabel(/^Full Name(?: \*)?$/).fill('Fictional Customer');await page.getByLabel(/^Email(?: \*)?$/).fill(email);await page.getByLabel(/^Phone(?: \*)?$/).fill('6715550100');await page.getByLabel(/^Additional notes(?: \*)?$/).fill('Fictional pickup note.');
      await page.getByRole('button',{name:'+ Special instructions',exact:true}).click();await page.getByLabel(/^Instructions for Cheeseburger(?: \*)?$/).fill('Fictional sauce on side');assert.equal((await rect(page.getByRole('button',{name:'Remove special instructions',exact:true}))).height,44);
      const recovery=width===390||width===375||width===1440;await page.getByLabel(/Card outcome/).selectOption(recovery?'timeout_before_dispatch':'approve');const review=page.getByRole('checkbox',{name:/I have reviewed my items/});await review.check();assert.ok(await review.evaluate(el=>el.closest('label').getBoundingClientRect().height>=44));await expect(pay).toBeEnabled();assert.equal((await rect(pay)).height,52);
      await page.screenshot({path:path.join(output,`checkout-${label}.png`),fullPage:true});await protectWrites(page);await pay.click();
      if(recovery){
       const pending=page.locator('[role="status"]').filter({hasText:/Your order .* is saved/});await expect(pending).toBeVisible({timeout:30000});await page.unroute('**/*',localOnly);await page.reload();const check=page.getByRole('button',{name:'Check payment status',exact:true});await expect(check).toBeVisible();assert.equal((await rect(check)).height,44);await check.click();
       await page.getByLabel(/Card outcome/).selectOption('approve');await page.getByRole('checkbox',{name:/I have reviewed the saved order total/}).check();const retry=page.getByRole('button',{name:'Retry card payment for this saved order',exact:true});await expect(retry).toBeEnabled();assert.equal((await rect(retry)).height,44);await protectWrites(page);await retry.click();item.recovered=true;
      }
      await page.waitForURL(/\/orders\/\d+/,{timeout:30000});const id=Number(new URL(page.url()).pathname.split('/').at(-1)),capability=await page.evaluate(id=>localStorage.getItem(`tsq-order-capability:${id}`),id);
      const response=await context.request.get(`${api}/api/v1/orders/${id}`,{headers:{'X-Order-Capability':capability}});assert.equal(response.status(),200);const{order}=await response.json();assert.equal(order.payment_status,'paid');assert.equal(order.total_cents,1295);assert.equal(order.notes,'Fictional pickup note.');item.orderId=id;item.totalCents=order.total_cents;
      // Payment is verified paid on the checked local API before allowing the receipt's dev-auth bootstrap.
      await page.unroute('**/*',localOnly);await expect(page.getByRole('heading',{name:'Order Confirmed!',exact:true})).toBeVisible({timeout:30000});await page.reload();await expect(page.getByRole('heading',{name:'Order Confirmed!',exact:true})).toBeVisible({timeout:30000});
     }else await page.screenshot({path:path.join(output,`checkout-${label}.png`),fullPage:true});
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push(item);writeFileSync(path.join(output,'forms.json'),JSON.stringify(results,null,2)+'\n');console.log(`${label}: shared geometry${touch?', native validation, retained drafts, saved inquiry/contact, simulated checkout and receipt':''} passed`);
    }catch(error){await page.screenshot({path:path.join(output,`failure-${label}.png`)});writeFileSync(path.join(output,`failure-${label}.txt`),await page.locator('body').innerText());throw error;}finally{await context.close();}
   }
  }finally{await browser.close();}
 }
}finally{if(session)execFileSync('dev-lifecycle',['release','--session',session,'process',String(process.pid)]);}
