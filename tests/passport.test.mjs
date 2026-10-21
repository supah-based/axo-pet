import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import test from 'node:test';
import { createPassportReader } from '../apps/pet-api/src/passport-read.mjs';
import { createPetApiServer } from '../apps/pet-api/src/server.mjs';
import { validatePassportRead, assertPassportRead as assertServerRead, validatePetHistory, XP_THRESHOLDS } from '../packages/shared-schemas/src/index.mjs';
import { assertPassportRead, createPassportSession, growthProgress } from '../packages/pet-domain/src/passport.mjs';
const fixture=JSON.parse(await readFile(new URL('../packages/shared-schemas/fixtures/synthetic-v1.json',import.meta.url)));
const visualCatalog=JSON.parse(await readFile(new URL('../packages/gear-catalog/catalogs/website-visual-catalog-v5.json',import.meta.url)));
const owner=fixture.identities.level10Minted.ownerAddress,now=Date.parse('2026-10-21T12:00:00.000Z');
const identity=()=>({...structuredClone(fixture.identities.level10Minted),xp:2675});
const history=()=>({schemaVersion:'AXO_PET_HISTORY_V1',status:'AVAILABLE',ownerAddress:owner,petGenesisId:identity().genesisId,throughXp:2675,coverage:'COMPLETE',hatchedAt:'2026-10-10T12:00:00.000Z',
  xpEvents:[{id:'a',occurredAt:'2026-10-11T12:00:00.000Z',xpBefore:0,xpAfter:1200,label:'Synthetic growth'},{id:'b',occurredAt:'2026-10-20T12:00:00.000Z',xpBefore:1200,xpAfter:2675,label:'Synthetic quest'}],
  achievements:[{id:'first',label:'Synthetic award',description:'Invented fixture achievement.',earnedAt:'2026-10-11T12:00:00.000Z'}]});
const ports=()=>({authenticate:async()=>({verified:true,address:owner}),readVerifiedPetSnapshot:async()=>({identity:identity(),equipment:structuredClone(fixture.projections.full)}),visualCatalog,readPetHistory:async()=>history(),now:()=>now});
const context={expectedOwnerAddress:owner,visualCatalog,now};
async function serve(t,options){const server=createPetApiServer(options);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));return `http://127.0.0.1:${server.address().port}`;}

test('Passport uses one authoritative Pet read and binds history to exact owner/genesis/XP without mutation',async()=>{
  const data=history(),before=structuredClone(data);let snapshots=0,auths=0;
  const read=await createPassportReader({...ports(),authenticate:async()=>{auths++;return {verified:true,address:owner};},readVerifiedPetSnapshot:async()=>{snapshots++;return {identity:identity(),equipment:fixture.projections.full};},readPetHistory:async({identity:pet})=>{assert.equal(pet.xp,2675);return data;}})({});
  assert.equal(auths,1);assert.equal(snapshots,1);assertServerRead(read,context);assertPassportRead(read,owner,now);assert.deepEqual(data,before);
  assert.equal(read.pet.identity.level,10);assert.equal(read.pet.identity.xp,2675);assert.deepEqual(read.pet.equipment,fixture.projections.full);
  read.history.xpEvents[0].xpAfter=999;assert.deepEqual(data,before);
});

test('missing history port preserves verified identity/equipment with explicit unavailable history',async()=>{
  const config=ports();delete config.readPetHistory;const read=await createPassportReader(config)({});
  assertServerRead(read,context);assert.deepEqual(read.history,{schemaVersion:'AXO_PET_HISTORY_FAILURE_V1',status:'UNAVAILABLE',reason:'HOST_NOT_CONNECTED',data:null});assert.equal(read.pet.identity.xp,2675);
});

test('stale or hostile history never leaks extra fields or becomes an empty successful record',async()=>{
  for(const mutate of [h=>{h.ownerAddress=fixture.otherOwner;},h=>{h.petGenesisId='AXO-0000000000';},h=>{h.throughXp++;},h=>{h.walletRecords=['private'];},h=>{h.achievements[0].bonus={STR:6};},h=>{h.xpEvents[0].label='';}]){
    const data=history();mutate(data);const read=await createPassportReader({...ports(),readPetHistory:async()=>data})({});
    assert.equal(read.history.status,'INCONSISTENT');assert.equal(read.history.data,null);assert.ok(!('xpEvents' in read.history));assert.equal(read.pet.identity.xp,2675);
  }
});

test('XP receipts require chronological continuity, unique IDs, bounded records and exact final XP',()=>{
  for(const mutate of [h=>{h.xpEvents[1].xpBefore++;},h=>{h.xpEvents[1].xpAfter--;},h=>{h.xpEvents.reverse();},h=>{h.xpEvents[1].id='a';},
    h=>{h.xpEvents[0].occurredAt='2026-02-30T00:00:00.000Z';},h=>{h.xpEvents[0].occurredAt='2027-01-01T00:00:00.000Z';},h=>{h.xpEvents[0].xpBefore='0';},h=>{h.xpEvents=Array(101).fill(h.xpEvents[0]);},h=>{h.xpEvents[0].xpAfter=Number.MAX_SAFE_INTEGER+1;}]){
    const data=history();mutate(data);assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,false);
  }
});

test('recent history is labelled partial and never requires reconstructing omitted XP events',()=>{
  const data=history();data.coverage='RECENT';data.xpEvents.shift();assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,true);
  data.coverage='COMPLETE';assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,false);
  data.coverage='RECENT';data.xpEvents=[];assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,true);
  data.coverage='COMPLETE';assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,false);
});

test('explicit XP corrections are displayed from records rather than recomputing the authoritative total',()=>{
  const data=history();data.xpEvents=[...data.xpEvents.slice(0,1),{id:'c',occurredAt:'2026-10-12T12:00:00.000Z',xpBefore:1200,xpAfter:1000,label:'Synthetic correction'},
    {...data.xpEvents[1],xpBefore:1000}];assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,true);
});

test('achievement dates, duplicate IDs, hatch order and invented awards fail consistency checks',()=>{
  for(const mutate of [h=>{h.achievements.push(h.achievements[0]);},h=>{h.achievements[0].earnedAt='2099-01-01T00:00:00.000Z';},
    h=>{h.achievements[0].earnedAt='2026-10-01T00:00:00.000Z';},h=>{h.achievements=Array(51).fill(h.achievements[0]);},h=>{h.hatchedAt='2026-10-21T11:00:00.000Z';}]){
    const data=history();mutate(data);assert.equal(validatePetHistory(data,{identity:identity(),now}).valid,false);
  }
});

test('history exceptions/timeouts degrade independently, while expired Pet reads still fail',async()=>{
  const failed=await createPassportReader({...ports(),readPetHistory:async()=>{throw Error('private-receipt');}})({});
  assertServerRead(failed,context);assert.equal(failed.history.reason,'HISTORY_UNAVAILABLE');assert.ok(!JSON.stringify(failed).includes('private-receipt'));
  let clock=now;await assert.rejects(createPassportReader({...ports(),now:()=>clock,readPetHistory:async()=>{clock+=60000;return history();}})({}),/PET_PROJECTION_INCONSISTENT/);
});

test('uncooperative history reads have a two-second limit and cannot prevent the Pet read from returning',async t=>{
  const keepAlive=setInterval(()=>{},1000);t.after(()=>clearInterval(keepAlive));let historySignal;
  const read=await createPassportReader({...ports(),readPetHistory:async({signal})=>{historySignal=signal;return new Promise(()=>{});}})({});
  assert.equal(historySignal.aborted,true);assert.equal(read.history.reason,'HISTORY_UNAVAILABLE');assert.equal(read.pet.identity.xp,2675);assertServerRead(read,context);
});

test('private Passport HTTP route uses host authentication and rejects client wallet/XP/preview and writes',async t=>{
  let historyReads=0;
  const origin=await serve(t,{...ports(),authenticate:async req=>req.headers.cookie==='host=verified'?{verified:true,address:owner}:null,readPetHistory:async()=>{historyReads++;return history();}});
  const path=origin+'/api/pet/v1/passport';assert.equal((await fetch(path,{headers:{'X-Wallet':owner}})).status,401);assert.equal(historyReads,0);
  assert.equal((await fetch(path+'?xp=999999')).status,400);assert.equal((await fetch(path,{method:'POST',body:JSON.stringify(history())})).status,405);
  const response=await fetch(path,{headers:{Cookie:'host=verified'}});assert.equal(response.status,200);assertServerRead(await response.json(),context);
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);assert.equal(historyReads,1);
});

test('Passport browser transport rejects preview authority, wrong wallets and expired reads',async()=>{
  const read=await createPassportReader(ports())({});
  for(const mutate of [r=>{r.previewEquipped=true;},r=>{r.pet.identity.ownerAddress=fixture.otherOwner;},r=>{r.pet.identity.xp='2675';},r=>{r.pet.identity.level=20;},r=>{r.history.throughXp++;},r=>{r.history.achievements[0].stats={STR:10};}]){const copy=structuredClone(read);mutate(copy);assert.throws(()=>assertPassportRead(copy,owner,now));}
  assert.throws(()=>assertPassportRead(read,owner,now+60000));assert.equal(validatePassportRead({...read,stats:{}},context).valid,false);
});

test('Passport account changes clear immediately and fence late responses using the shared session controller',async()=>{
  const base=await createPassportReader(ports())({}),states=[];let release;
  const controller=createPassportSession({read:()=>new Promise(resolve=>{release=resolve;}),onState:s=>states.push(s),now:()=>now,timer:()=>1,cancelTimer:()=>{}});
  const pending=controller.change({connected:true,address:owner});await Promise.resolve();const resolve=release;
  await controller.change({connected:false});assert.equal(controller.current(),null);assert.equal(states.at(-1).status,'DISCONNECTED');
  resolve(base);await pending;assert.equal(controller.current(),null);assert.equal(states.at(-1).status,'DISCONNECTED');controller.dispose();
});

test('Passport background refresh preserves fresh reads but expiry clears both identity and history',async()=>{
  const base=await createPassportReader(ports())({}),states=[];let clock=now,expire;
  const controller=createPassportSession({read:async()=>base,onState:s=>states.push(s),now:()=>clock,timer:fn=>{expire=fn;return 1;},cancelTimer:()=>{}});
  await controller.change({connected:true,address:owner});await controller.refresh();assert.ok(states.some(s=>s.status==='REFRESHING'&&s.read.history.status==='AVAILABLE'));
  clock+=60000;expire();assert.equal(controller.current(),null);assert.deepEqual(states.at(-1),{status:'EXPIRED',read:null});controller.dispose();
});

test('growth progress matches every preserved V1 threshold and keeps excess XP exact',()=>{
  for(const [index,xp] of XP_THRESHOLDS.entries()){const progress=growthProgress({xp,level:index+1});assert.equal(progress.floor,xp);assert.equal(progress.next,XP_THRESHOLDS[index+1]??null);}
  assert.deepEqual(growthProgress({xp:17950,level:10}),{floor:1200,next:null,remaining:0,percent:100,excess:16750});
  for(const pet of [{xp:'1200',level:10},{xp:1200,level:20},{xp:-1,level:1}])assert.throws(()=>growthProgress(pet));
});

test('public history/model runtimes match source and reference lineages/stages/hashes match reviewed catalogs',async()=>{
  const source=await readFile(new URL('../packages/shared-schemas/src/passport-history.cjs',import.meta.url),'utf8');
  const generated=await readFile(new URL('../apps/hatchery-web/public/passport/history.mjs',import.meta.url),'utf8');
  assert.equal(generated,source.replace("'use strict';\n",'').replace('module.exports = { validatePetHistory };','export { validatePetHistory };'));
  const model=await readFile(new URL('../packages/pet-domain/src/passport.mjs',import.meta.url),'utf8');
  assert.equal(await readFile(new URL('../apps/hatchery-web/public/passport/model.mjs',import.meta.url),'utf8'),model.replace("'./wardrobe-preview.mjs'","'/wardrobe/model.mjs'").replace("'../../shared-schemas/src/index.mjs'","'./history.mjs'"));
  const references=JSON.parse(await readFile(new URL('../apps/hatchery-web/public/passport/reference.json',import.meta.url)));
  assert.equal(references.lineages.length,6);assert.deepEqual(references.stages,visualCatalog.stages);assert.deepEqual(references.stages.map(s=>s.minimumXp),XP_THRESHOLDS);
  assert.deepEqual(references.bases,visualCatalog.bases.map(b=>({lineageKey:b.lineageKey,level:b.level,url:b.url,sha256:b.runtimeSha256})));
});
