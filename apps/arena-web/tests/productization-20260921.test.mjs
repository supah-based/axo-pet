import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,flush} from './repair-dom-harness.mjs';

const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();

test('minimized room preview renders only public Pet fields without undefined placeholders',async()=>{
 const h=await harness({matchmaking:true,strict:true});
 try{
  h.service.cancel(h.c,h.B);
  const waiting=h.service.challenge(h.c);
  h.service.postChallenge(h.c,waiting.id,{posted:true});
  await h.navigate(waiting.id);
  assert(h.document.querySelector('.privacy-preview'));
  assert.match(text(h.document.querySelector('.privacy-preview')),/Private fighter details hidden/);
  assert.doesNotMatch(text(h.document.querySelector('.privacy-preview')),/undefined|Hatchery XP|AXO-\d/i);
  assert.equal(h.errors.length,0);
 }finally{await h.close();}
});

test('participant can consent, create, copy and revoke a private spectator link end to end',async()=>{
 const h=await harness({matchmaking:true,strict:true});
 try{
  h.service.spectatorConsent(h.b,h.A,{allowed:true});
  await h.navigate(h.A);
  assert(h.document.querySelector('[data-action="spectator-consent"]'));
  await h.click('[data-action="spectator-consent"]');
  assert(h.document.querySelector('[data-action="spectator-create"]'));
  await h.click('[data-action="spectator-create"]');
  assert.equal(h.clipboard.length,1);
  const url=new URL(h.clipboard[0]);
  const token=new URLSearchParams(url.hash.slice(1)).get('spectator');
  assert.match(token,/^[a-f0-9]{48}$/);
  assert(h.document.querySelector('.spectator-share input').value.includes(token));
  const capability=h.service.room(h.A).spectatorCapabilities.find(v=>!v.revokedAt);
  assert(capability);
  h.location.hash='challenge='+h.A+'&spectator='+token;
  await flush();
  const read=h.requests.findLast(r=>r.path==='/challenges/'+h.A&&r.body===undefined);
  assert.equal(read.headers['X-AXO-Spectator'],token);
  await h.click('[data-action="spectator-revoke"]');
  assert(h.service.room(h.A).spectatorCapabilities.every(v=>v.revokedAt));
  assert.equal(h.errors.length,0);
 }finally{await h.close();}
});

test('moderation offers private categories during a live player encounter and persists opaque receipts',async()=>{
 const h=await harness({matchmaking:true,strict:true});
 try{
  await h.navigate(h.A);
  assert(h.document.querySelector('[data-action="report-player"]'));
  await h.click('[data-action="report-player"]');
  assert.equal(h.document.querySelectorAll('[data-action="report-category"]').length,4);
  await h.click('[data-action="report-category"][data-category="harassment"]');
  assert.equal(h.service.db.profiles[h.a.key].reports.at(-1).category,'harassment');
  assert(!JSON.stringify(h.service.db.profiles[h.a.key].reports.at(-1)).includes(h.b.key));
  await h.click('[data-action="block-player"]');
  assert.equal(h.service.db.profiles[h.a.key].blocks.length,1);
  assert.equal(h.errors.length,0);
 }finally{await h.close();}
});

test('Hatchery guided-practice entry opens a nonmutating first-run prompt before creating practice',async()=>{
 const h=await harness({matchmaking:true,strict:true});
 try{
  h.service.cancel(h.a,h.A);
  h.location.hash='guided-practice';
  await flush();
  await h.click('[data-tab="arena"]');
  const prompt=h.document.querySelector('.first-run-prompt');
  assert(prompt);
  assert.match(text(prompt),/Five short lessons/);
  const before=Object.keys(h.service.db.rooms).length;
  await h.click('.first-run-prompt [data-action="guided-practice"]');
  assert.equal(Object.keys(h.service.db.rooms).length,before+1);
  assert(h.service.room(h.location.hash.split('=')[1]).guidedPractice);
  assert.equal(h.service.me(h.a).pet.xp,h.a.pet.xp);
  assert.equal(h.errors.length,0);
 }finally{await h.close();}
});

test('Hatchery exposes bounded Arena entry without claiming XP, wagers or public promotion',()=>{
 const html=readFileSync(new URL('../../../public/hatchery.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../../public/hatchery.css',import.meta.url),'utf8');
 assert.match(html,/href="\/arena\/#guided-practice"/);
 assert.match(html,/FREE-PLAY ARENA · NO WAGERS · NO BATTLE XP/);
 assert.match(html,/href="\/arena\/#challenge-room"/);
 assert.match(css,/\.pet-arena-entry/);
});
