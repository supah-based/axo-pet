// UI 1.5 selector maintenance only. Do not run while browser navigation is policy-blocked.
import { chromium } from 'playwright-core';
import {previewApp} from './server.mjs';
import {ArenaService} from './service.mjs';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dir=mkdtempSync(new URL('./review/v1.3/private-restart-',import.meta.url).pathname),file=join(dir,'state.json');
let server,app,service,port;
async function start(){service=new ArenaService({file,mode:'preview'});app=previewApp({service});server=await new Promise(resolve=>{const s=app.listen(port||0,'127.0.0.1',()=>resolve(s));});port=server.address().port;}
async function stop(){clearInterval(app.arenaTimer);await new Promise(resolve=>server.close(resolve));}
const browser=await chromium.launch({executablePath:'/snap/chromium/current/usr/lib/chromium-browser/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],checks=[];
try{await start();const origin='http://127.0.0.1:'+port;
 async function player(name){const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'&&d.message().startsWith('Concede this battle?')?d.accept():d.dismiss());await page.goto(origin+'/arena/');await page.locator('[name=name]').fill(name);await page.getByRole('button',{name:'Enter Arena',exact:true}).click();await page.locator('[data-action="challenge"]').waitFor();return {context,page};}
 const a=await player('Restart A'),b=await player('Restart B');
 const api=(page,path)=>page.evaluate(async path=>(await fetch('/api/arena'+path)).json(),path);
 const original=(await api(a.page,'/me')).pet.genesisId;
 await stop();await start();await a.page.reload();await a.page.locator('[data-action="challenge"]').waitFor();assert.equal((await api(a.page,'/me')).pet.genesisId,original);checks.push('New synthetic identity survives process restart before first match');
 await a.page.locator('[data-action="challenge"]').click();await a.page.locator('.invite').waitFor();const id=new URL(a.page.url()).hash.split('=')[1];await b.page.goto(origin+'/arena/#challenge='+id);await b.page.getByRole('button',{name:'Accept & battle',exact:true}).click();await a.page.locator('#battle-canvas').waitFor();await a.page.locator('[data-action=move][data-key=market_order]').click();const before=await api(a.page,'/challenges/'+id);
 await stop();await start();await a.page.reload();await a.page.locator('#battle-canvas').waitFor();const after=await api(a.page,'/challenges/'+id);assert.equal(after.selected,'market_order');assert.equal(after.startedAt,before.startedAt);assert.equal(after.endsAt,before.endsAt);checks.push('Pending commitment, original deadline and authenticated review identity survive restart');
 await b.context.setOffline(true);await b.page.locator('[data-action=move][data-key=market_order]').click();await b.page.locator('#connection:not([hidden])').waitFor();await b.page.screenshot({path:'review/v1.3/reconnect-mobile.png',fullPage:true});await b.page.getByRole('button',{name:'Retry connection',exact:true}).click();await b.context.setOffline(false);await b.page.locator('#battle-canvas').waitFor();await b.page.waitForFunction(()=>document.querySelector('#connection').hidden);assert.equal((await api(b.page,'/challenges/'+id)).locked,false);await b.page.locator('[data-action=move][data-key=market_order]').click();await b.page.waitForFunction(()=>document.querySelector('#battle-banner').textContent.includes('EXCHANGE 2'));checks.push('Offline move is not acknowledged; visible reconnect notice clears on successful recovery');
 assert.deepEqual(errors,[]);writeFileSync('review/v1.3/browser-restart-report.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,errors},null,2));
}finally{await browser.close();if(server?.listening)await stop();rmSync(dir,{recursive:true,force:true});}
