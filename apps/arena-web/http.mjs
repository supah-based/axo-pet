import express from 'express';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {ArenaService} from './service.mjs';
import {readFileSync} from 'node:fs';
import {atelierManifest,atelierMediaUrl} from './style-lab-model.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createArenaRouter({service=new ArenaService({matchmaking:true}),authenticate,originAllowed=()=>false}={}){
 if(typeof authenticate!=='function')throw Error('Server-side Arena authentication is required');
 const router=express.Router(),limits=new Map();
 router.use((_req,res,next)=>{res.setHeader('X-AXO-Arena-Release','1.5.0');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
 router.use((req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method)){
   if(req.get('sec-fetch-site')==='cross-site'||!originAllowed(req.get('origin'),req))return res.status(403).json({error:'Same-origin Arena requests required.'});
   if(!req.is('application/json'))return res.status(415).json({error:'JSON required.'});
  }next();
 });
 router.use(express.json({limit:'8kb'}));
 // The website parses JSON before this router. Retain the Arena bound there too.
 router.use((req,res,next)=>{if(req.body!==undefined&&Buffer.byteLength(JSON.stringify(req.body),'utf8')>8192)return res.status(413).json({error:'Arena request exceeds 8 KiB.'});next();});
 router.use(async(req,res,next)=>{try{const controller=new AbortController(),abort=()=>controller.abort();req.once('aborted',abort);res.once('close',abort);
  try{req.arenaIdentity=await authenticate(req,{signal:controller.signal});}finally{req.off('aborted',abort);res.off('close',abort);}if(res.destroyed)return;if(!req.arenaIdentity) return res.status(401).json({error:'Open Hatchery and connect the wallet that owns your Pet.'});
  const now=Date.now(),key=req.arenaIdentity.key,bucket=limits.get(key)||{at:now,n:0};if(now-bucket.at>60000){bucket.at=now;bucket.n=0;}bucket.n++;limits.set(key,bucket);
  if(limits.size>5000)for(const[k,v]of limits)if(now-v.at>60000)limits.delete(k);
  if(bucket.n>180)return res.status(429).json({error:'Slow down for a moment.'});next();}catch(error){if(res.destroyed)return;const unavailable=error?.httpStatus===503;res.status(unavailable?503:401).json({error:unavailable?'Verified Pet or equipment evidence is unavailable. Reopen Hatchery and retry.':'An active, authenticated Hatchery Pet is required.',code:unavailable?'ARENA_VERIFICATION_UNAVAILABLE':'VERIFIED_SESSION_REQUIRED'});}});
 const wrap=fn=>(req,res)=>{try{res.json(fn(req.arenaIdentity,req));}catch(e){res.status(e.status||400).json({error:e.status?e.message:'Invalid Arena request. Check your build and retry.',...(e.code?{code:e.code}:{}),...(e.code==='OUTCOME_UNKNOWN_REOPEN_REQUIRED'?{retry:'REOPEN_AUTHORITATIVE_STATE'}:{})});}};
 router.use((req,res,next)=>{if(req.body&&Object.keys(req.body).some(key=>/^(?:pet|identity|xp|level|lineageId|gear|gearStats|gearLoadout|equipment|itemLevel|setBonus|preview.*|outfit.*)$/i.test(key)))return res.status(400).json({error:'Pet identity, XP, equipment and preview outfits are not Arena inputs.'});next();});
 router.get('/lobby-status',wrap(i=>service.lobbyStatus(i)));
 router.post('/presence',wrap((i,r)=>{if(Object.keys(r.body).some(k=>!['available','lease'].includes(k)))throw Object.assign(new Error('Only availability and its lease are accepted.'),{status:400});return service.setPresence(i,r.body);}));
 router.post('/players/:id/challenge',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Direct challenges do not accept player data.'),{status:400});return service.directChallenge(i,r.params.id);}));
 router.get('/me',wrap(i=>({...service.me(i),...(i.verification?{verification:i.verification}:{})})));
 router.get('/challenge-room',wrap(i=>service.challengeRoom(i)));
 router.post('/challenge-room/:id/post',wrap((i,r)=>{if(Object.keys(r.body).length!==1||typeof r.body.posted!=='boolean')throw Object.assign(new Error('Only a post/remove choice is accepted; no text, links or media.'),{status:400});return service.postChallenge(i,r.params.id,r.body);}));
 router.post('/challenge-room/:id/accept',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Accept does not take player data or text.'),{status:400});return service.acceptChallenge(i,r.params.id);}));
 router.post('/build',wrap((i,r)=>{if(!r.body||Array.isArray(r.body)||Object.keys(r.body).some(k=>!['allocation','ranks','loadout'].includes(k)))throw Object.assign(new Error('Only allocation, ranks and moves are accepted; Pet, gear and preview data are server-owned.'),{status:400});return service.save(i,r.body);}));
 router.post('/challenges',wrap((i,r)=>{if(Object.keys(r.body).some(k=>!['practice','guided','matchmaking','countdownMs'].includes(k)))throw Object.assign(new Error('Only practice and guided choices are accepted.'),{status:400});return service.challenge(i,{practice:r.body.practice===true,guided:r.body.guided===true});}));
 router.get('/challenges/:id',wrap((i,r)=>service.getRoom(i,r.params.id,{spectatorToken:r.get('x-axo-spectator')||null})));
 router.post('/challenges/:id/spectator-consent',wrap((i,r)=>{if(Object.keys(r.body).length!==1||typeof r.body.allowed!=='boolean')throw Object.assign(new Error('Only spectator consent is accepted.'),{status:400});return service.spectatorConsent(i,r.params.id,r.body);}));
 router.post('/challenges/:id/spectator-capabilities',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Spectator capability creation takes no body data.'),{status:400});return service.issueSpectator(i,r.params.id);}));
 router.post('/challenges/:id/spectator-capabilities/:capabilityId/revoke',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Spectator revocation takes no body data.'),{status:400});return service.revokeSpectator(i,r.params.id,r.params.capabilityId);}));
 router.post('/challenges/:id/block',wrap((i,r)=>{if(Object.keys(r.body).some(k=>k!=='blocked'))throw Object.assign(new Error('Only a block choice is accepted.'),{status:400});return service.blockPlayer(i,r.params.id,r.body);}));
 router.post('/challenges/:id/report',wrap((i,r)=>{if(Object.keys(r.body).length!==1||typeof r.body.category!=='string')throw Object.assign(new Error('Only a private report category is accepted.'),{status:400});return service.reportPlayer(i,r.params.id,r.body);}));
 router.get('/challenges/:id/replay',wrap((i,r)=>service.replay(i,r.params.id)));
 router.post('/challenges/:id/practice-guide/skip',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Skipping the guide takes no body data.'),{status:400});return service.skipPracticeGuide(i,r.params.id);}));
 router.post('/challenges/:id/practice-guide/replay',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Replaying guided practice takes no body data.'),{status:400});return service.replayPractice(i,r.params.id);}));
 router.post('/challenges/:id/rematch',wrap((i,r)=>service.rematch(i,r.params.id)));
 router.post('/challenges/:id/join',wrap((i,r)=>service.join(i,r.params.id)));
 router.post('/challenges/:id/ready',wrap((i,r)=>service.ready(i,r.params.id)));
 router.post('/challenges/:id/move',wrap((i,r)=>{if(!r.body||Object.keys(r.body).some(k=>!['round','move'].includes(k)))throw Object.assign(new Error('Only round and move are accepted.'),{status:400});return service.choose(i,r.params.id,r.body);}));
 router.post('/challenges/:id/concede',wrap((i,r)=>{if(Object.keys(r.body).some(k=>k!=='beforeFight'))throw Object.assign(new Error('Only cancellation intent is accepted.'),{status:400});return service.cancel(i,r.params.id,r.body);}));
 router.post('/tournaments',wrap((i,r)=>service.createTournament(i,r.body)));
 router.get('/tournaments/:id',wrap((i,r)=>service.getTournament(i,r.params.id,{spectatorToken:r.get('x-axo-spectator')||null})));
 router.post('/tournaments/:id/spectator-consent',wrap((i,r)=>{if(Object.keys(r.body).length!==1||typeof r.body.allowed!=='boolean')throw Object.assign(new Error('Only tournament spectator consent is accepted.'),{status:400});return service.tournamentConsent(i,r.params.id,r.body);}));
 router.post('/tournaments/:id/spectator-capabilities',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Spectator capability creation takes no body data.'),{status:400});return service.issueTournamentSpectator(i,r.params.id);}));
 router.post('/tournaments/:id/spectator-capabilities/:capabilityId/revoke',wrap((i,r)=>{if(Object.keys(r.body).length)throw Object.assign(new Error('Spectator revocation takes no body data.'),{status:400});return service.revokeTournamentSpectator(i,r.params.id,r.params.capabilityId);}));
 router.post('/tournaments/:id/join',wrap((i,r)=>service.joinTournament(i,r.params.id)));
 router.post('/tournaments/:id/start',wrap((i,r)=>service.startTournament(i,r.params.id)));
 router.post('/tournaments/:id/leave',wrap((i,r)=>service.leaveTournament(i,r.params.id)));
 router.use((err,_req,res,_next)=>res.status(err.status||400).json({error:'Invalid Arena request.'}));
 return router;
}
export function arenaStatic(){const router=express.Router();router.get('/',(_req,res)=>res.sendFile('index.html',{root}));
 const files=['app.mjs','render.mjs','catalog.mjs','combat.mjs','replay.mjs','verified-visuals.mjs','verified-panel.mjs','battle-report.mjs','battle-report-view.mjs','battle-report.css','presentation.mjs','command-center.mjs','command-center.css','style-lab.mjs','style-lab-model.mjs','equipped-rig.mjs','equipped-puppet.mjs','equipped-canonical.mjs','animation-cues.mjs','equipped-inspector.mjs','styles.css'];for(const f of files)router.get('/'+f,(_req,res)=>res.sendFile(f,{root}));
 const wardrobeRoot=join(root,'../hatchery-web/public'),wardrobePath=join(wardrobeRoot,'gear-bazaar/v1/catalog.json'),wardrobe=JSON.parse(readFileSync(wardrobePath,'utf8'));
 router.get('/atelier/catalog.json',(_req,res)=>res.sendFile(wardrobePath));
 router.get('/atelier/model.mjs',(_req,res)=>res.sendFile(join(wardrobeRoot,'gear-anatomy/model.mjs')));
 for(const entry of atelierManifest(wardrobe).values())router.get(atelierMediaUrl(entry.url).slice('/arena'.length),(_req,res)=>res.sendFile(join(wardrobeRoot,entry.url.slice(1))));
 // No state, source masters, server modules, credentials or review artifacts are served.
 router.use('/assets',express.static(join(root,'assets/runtime'),{index:false,dotfiles:'deny',maxAge:3600000}));return router;}
