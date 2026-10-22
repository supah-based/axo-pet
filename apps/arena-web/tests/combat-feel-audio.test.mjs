import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {AUDIO_BANK} from '../combat-audio-bank.mjs';import {audioPreferences,DEFAULT_AUDIO} from '../combat-audio.mjs';
import {receiptAudioPlan,contactCue,contactAccent} from '../combat-beats.mjs';import {MOVE_PROFILES} from '../animation-cues.mjs';import {audioFixture} from './audio-fixture.mjs';
const state=()=>({id:'synthetic-sound-fight',seat:0,status:'playing',battle:{log:[{round:1,moves:['market_order','reversal'],effects:[{damage:0,blocked:0,counter:4},{damage:9,blocked:6,healed:0}]}]}});

test('original PCM bank is pinned, bounded, audible and free of clipped samples',()=>{
 let total=0;for(const[id,entry]of Object.entries(AUDIO_BANK)){const data=readFileSync(new URL('../assets/runtime/audio-v1/'+id+'.wav',import.meta.url));assert.equal(data.length,entry.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.readUInt32LE(24),22050);assert.equal(data.readUInt16LE(22),1);let peak=0,sum=0;for(let at=44;at<data.length;at+=2){const v=data.readInt16LE(at)/32768;peak=Math.max(peak,Math.abs(v));sum+=v*v;}assert.ok(peak<.9&&peak>.05,id);assert.ok(Math.sqrt(sum/((data.length-44)/2))>.01,id);total+=entry.bytes;}
 assert.equal(Object.keys(AUDIO_BANK).length,13);assert.equal(total,729988);
});

test('contact and audio use exact resolved move timing, including delayed reversal; pending/cosmetic fields cannot affect cues',()=>{
 const s=state(),before=structuredClone(s),plan=receiptAudioPlan(s);assert.equal(contactCue(s.battle.log[0],1),970);assert.ok(plan.some(c=>c.id==='hit'&&c.at===970));assert.ok(plan.some(c=>c.id==='guard'&&c.at===620));
 s.selected='epic';s.opponentPending='epic';s.previewOutfit={stats:{STR:999},itemLevel:20};assert.deepEqual(receiptAudioPlan(s),plan);assert.deepEqual(s.battle,before.battle);assert.deepEqual(receiptAudioPlan({selected:'epic',battle:{log:[]}}),[]);
 s.battle.log[0].moves=['epic','reversal'];assert.equal(contactCue(s.battle.log[0],1),1240);
});

test('every move has finite receipt-only cues, limits eight voices and retains the terminal cue',()=>{
 for(const a of Object.keys(MOVE_PROFILES))for(const b of Object.keys(MOVE_PROFILES)){const s=state();s.status='won';s.battle.winner=0;s.battle.log[0]={round:1,moves:[a,b],effects:[{damage:8,blocked:4,healed:3,counter:2},{damage:8,blocked:4,healed:3,counter:2}]};const plan=receiptAudioPlan(s);assert.ok(plan.length<=8);assert.ok(plan.every(c=>Object.hasOwn(AUDIO_BANK,c.id)&&c.at>=0&&c.at<2000));assert.equal(plan.at(-1).id,'victory');}
 const s=state();s.status='won';s.battle.winner=1;assert.equal(receiptAudioPlan(s).at(-1).id,'defeat');s.status='draw';assert.equal(receiptAudioPlan(s).at(-1).id,'draw');
});

test('localized contact accents align with receipt contact and vanish with reduced motion or missing damage',()=>{
 const last=state().battle.log[0],at=contactCue(last,0);assert.equal(contactAccent(last,0,at-1).active,false);assert.equal(contactAccent(last,0,at+10).active,true);assert.equal(contactAccent(last,0,at+260).active,false);assert.equal(contactAccent(last,0,at+10,true).active,false);assert.equal(contactAccent(null,0,500).active,false);
});

test('audio starts only by explicit enable, verifies a fixed bank and schedules the contact at audio-clock time',async t=>{
 const f=audioFixture();t.after(()=>f.director.destroy());assert.equal(f.director.play('hit'),false);assert.equal(f.created,0);assert.equal(f.requests.length,0);await f.director.enable();assert.equal(f.created,1);assert.equal(f.director.status().phase,'ready');assert.equal(f.requests.length,13);
 const s=state(),frozen=JSON.stringify(s);assert.equal(f.director.receipt(s),true);assert.equal(f.director.receipt(s),false);assert.ok(f.sources.some(v=>v.at===10.62));assert.ok(f.sources.some(v=>v.at===10.97));assert.equal(JSON.stringify(s),frozen);assert.ok(f.requests.every(r=>r.options.credentials==='omit'&&r.options.redirect==='error'));
});

test('eight-voice bound, mute, interruption and disposal cancel scheduled sources and looped ambience',async t=>{
 const f=audioFixture();t.after(()=>f.director.destroy());await f.director.enable();f.director.setScene(true);for(let i=0;i<100;i++)f.director.play('epic',{at:1000});assert.equal(f.director.status().voices,8);assert.equal(f.sources.filter(s=>s.loop).length,1);f.director.stop();assert.equal(f.director.status().voices,0);assert.ok(f.sources.every(s=>s.stopped&&s.disconnected));f.director.disable();assert.equal(f.director.play('hit'),false);
});

test('terminal polling does not cut the scheduled victory, while a new receipt cancels the previous exchange',async t=>{
 const f=audioFixture();t.after(()=>f.director.destroy());await f.director.enable();f.director.setScene(true);const s=state();s.status='won';s.battle.winner=0;f.director.setScene(false);f.director.receipt(s);const old=[...f.sources];f.director.setScene(false);assert.ok(old.some(v=>v.at===11.78&&!v.stopped));assert.equal(f.director.receipt(s),false);s.battle.log[0].round++;f.director.receipt(s);assert.ok(old.every(v=>v.stopped));
});

test('hidden tabs and replay seeks stay silent, including enabling after historical receipts',async t=>{
 const f=audioFixture();t.after(()=>f.director.destroy());const s=state();f.director.receipt(s);await f.director.enable();assert.equal(f.director.receipt(s),false);assert.equal(f.sources.length,0);s.battle.log[0].round++;f.hide();assert.equal(f.director.receipt(s),false);f.hide(false);assert.equal(f.director.receipt(s),false);s.presentationContext='replay';s.battle.log[0].round++;assert.equal(f.director.receipt(s),false);assert.equal(f.sources.length,0);
});

test('corrupt audio, unsupported devices and rejected resume fail quietly without affecting gameplay',async t=>{
 for(const options of [{corrupt:true},{unsupported:true},{refuseResume:true}]){const f=audioFixture(options);t.after(()=>f.director.destroy());await f.director.enable();assert.equal(f.director.status().enabled,false);assert.equal(f.director.status().phase,'unavailable');assert.equal(f.director.play('hit'),false);assert.equal(f.sources.length,0);}
});

test('mute during loading aborts and late completion cannot reactivate sound',async t=>{
 const f=audioFixture({hold:true});t.after(()=>f.director.destroy());const loading=f.director.enable();await new Promise(r=>setImmediate(r));f.director.disable();assert.ok(f.requests.every(r=>r.options.signal.aborted));f.release();await loading;assert.equal(f.director.status().phase,'off');assert.equal(f.director.status().enabled,false);assert.equal(f.sources.length,0);
});

test('independent volumes and mono preferences are bounded and contain no enablement or Pet state',async t=>{
 assert.deepEqual(audioPreferences({wallet:'fake',master:1}),DEFAULT_AUDIO);assert.equal(audioPreferences({master:99,effects:-1,music:NaN}).master,1);const f=audioFixture();t.after(()=>f.director.destroy());await f.director.enable();f.director.update({master:.3,effects:.4,music:0,mono:true});f.director.play('guard',{pan:.8});assert.deepEqual(f.gains.slice(0,3).map(n=>n.gain.value),[.3,.4,0]);assert.equal(f.panners.at(-1).pan.value,0);assert.doesNotMatch(f.saved,/enabled|wallet|xp|gear|stats/i);assert.equal(JSON.parse(f.saved).mono,true);
});

test('muting ambience during a receipt cancels its duck-release ramp and cannot turn music back on',async t=>{
 const f=audioFixture();t.after(()=>f.director.destroy());await f.director.enable();f.director.setScene(true);f.director.receipt(state());assert.ok(f.gains[2].gain.events.some(e=>e.type==='ramp'&&e.at>f.ctx.currentTime));f.director.update({...DEFAULT_AUDIO,music:0});assert.equal(f.gains[2].gain.value,0);assert.ok(!f.gains[2].gain.events.some(e=>e.type==='ramp'&&e.at>f.ctx.currentTime));
});

test('successive exchanges keep the ambience loop continuous while cancelling obsolete effect sources',async t=>{
 const f=audioFixture();t.after(()=>f.director.destroy());await f.director.enable();f.director.setScene(true);const loop=f.sources.find(v=>v.loop),s=state();f.director.receipt(s);const oldEffects=f.sources.filter(v=>!v.loop);s.battle.log[0].round++;f.director.receipt(s);assert.equal(f.sources.filter(v=>v.loop).length,1);assert.ok(!loop.stopped);assert.ok(oldEffects.every(v=>v.stopped));f.director.stop();assert.ok(loop.stopped);
});
