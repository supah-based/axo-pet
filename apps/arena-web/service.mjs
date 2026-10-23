import {randomBytes,randomInt,createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {exportReplay} from './replay-export.mjs';
import {VERSION,buildPet,defaultBuild,LINEAGES} from './catalog.mjs';
import {newBattle,resolve,legalMoves,finishOnClock,values,epicCondition} from './combat.mjs';
import {SPARRING_PROFILES,SPARRING_VERSION} from './sparring-meta.mjs';
import {createSparringBuild,decideSparring,legacyPracticeMove} from './sparring-policy.mjs';
export const TURN_MS=10000,REVEAL_MS=1800,BATTLE_MS=180000;
export const COUNTDOWN_MS=3000,PRESENCE_TTL_MS=45000,PRESENCE_HEARTBEAT_MS=15000,CONFIRMATION_MS=60000;
const token=()=>randomBytes(12).toString('hex');
const copy=v=>structuredClone(v);
export class ArenaError extends Error{constructor(message,status=400,code=null){super(message);this.status=status;this.code=code;}}
const fail=(message,status=400)=>{throw new ArenaError(message,status);};
const cleanBuild=b=>({allocation:b.allocation,ranks:b.ranks,loadout:b.loadout});
const publicPet=p=>({genesisId:p.genesisId,name:p.name,lineageId:p.lineageId,level:p.level,xp:p.xp,art:p.art,layers:p.layers||[],gearRevision:p.gearRevision||0,gearLoadout:p.gearLoadout||[],gearStats:p.gearStats||{},identitySource:p.identitySource});
const ownerDigest=key=>createHash('sha256').update('arena-owner\0'+key).digest('hex');
const capabilityDigest=value=>createHash('sha256').update('arena-capability\0'+value).digest('hex');
export class ArenaService{
 constructor({file=null,store=null,clock=()=>Date.now(),mode='authenticated',matchmaking=false,privacyMode='legacy'}={}){
  this.file=file;this.store=store;this.clock=clock;this.mode=mode;this.matchmaking=matchmaking===true;this.privacyMode=privacyMode;this.nextTickAt=0;this.nextMaintenanceAt=0;this.presence=new Map();this.inviteCooldown=new Map();this.db={version:VERSION,profiles:{},rooms:{},tournaments:{}};
  if(store){this.db=store.load();if(this.db.version!==VERSION)throw Error('Arena state ruleset mismatch');}
  else if(file&&existsSync(file)){this.db=JSON.parse(readFileSync(file,'utf8'));if(this.db.version!==VERSION)throw Error('Arena state ruleset mismatch');}
 }
 persist(before=this.db){if(this.store)return this.store.commit(before,this.db);if(!this.file)return;mkdirSync(dirname(this.file),{recursive:true});const temp=this.file+'.next';writeFileSync(temp,JSON.stringify(this.db),{mode:0o600});renameSync(temp,this.file);}
 transaction(fn){if(this.inTransaction)return fn();this.tick();return this.atomic(fn);}
 atomic(fn){const before=copy(this.db);this.inTransaction=true;try{const out=fn();if(JSON.stringify(before)!==JSON.stringify(this.db)){try{this.persist(before);}catch(error){if(error?.constructor?.name==='ArenaStorageError')throw new ArenaError(error.message,error.status,error.code);throw new ArenaError('Arena save unavailable. No move acknowledged; retry after reconnect.',503,'STORAGE_UNAVAILABLE');}}return out;}catch(e){this.db=before;throw e;}finally{this.inTransaction=false;}}
 // identity comes from a server adapter, NEVER a body supplied by a player.
 profile(identity){
  if(!identity?.key||!identity.pet)fail('Connect your Hatchery wallet and hatch a Pet.',401);
  const p=identity.pet;let row=this.db.profiles[identity.key];
  if(!row||row.pet.genesisId!==p.genesisId){row={pet:publicPet(p),build:cleanBuild(defaultBuild(p.lineageId,p.xp,p.gearStats)),blocks:[],reports:[],lastActiveAt:this.clock()};this.db.profiles[identity.key]=row;}
  const nextPet=publicPet(p);if(JSON.stringify(row.pet)!==JSON.stringify(nextPet))row.pet=nextPet;
  row.blocks=Array.isArray(row.blocks)?row.blocks:[];row.reports=Array.isArray(row.reports)?row.reports:[];
  try{buildPet({...row.build,lineageId:p.lineageId,xp:p.xp,gearStats:p.gearStats});}catch{row.build=cleanBuild(defaultBuild(p.lineageId,p.xp,p.gearStats));}
  return row;
 }
 touch(identity){const row=this.profile(identity);row.lastActiveAt=this.clock();return row;}
 packed(identity){const p=this.touch(identity);return {owner:identity.key,pet:copy(p.pet),build:buildPet({...p.build,lineageId:p.pet.lineageId,xp:p.pet.xp,gearStats:p.pet.gearStats})};}
 busy(key,{exceptTournament=null}={}){return Object.values(this.db.rooms).some(r=>['waiting','checkin','playing'].includes(r.status)&&r.players.some(p=>p?.owner===key))||Object.values(this.db.tournaments).some(t=>t.id!==exceptTournament&&['registration','playing'].includes(t.status)&&t.roster.some(p=>p.owner===key));}
 me(identity){this.tick();this.requireIdentity(identity);let row=this.db.profiles[identity.key],valid=row&&row.pet?.genesisId===identity.pet.genesisId&&Array.isArray(row.blocks)&&Array.isArray(row.reports);if(valid)try{buildPet({...row.build,lineageId:identity.pet.lineageId,xp:identity.pet.xp,gearStats:identity.pet.gearStats});}catch{valid=false;}if(!valid||JSON.stringify(row.pet)!==JSON.stringify(publicPet(identity.pet)))row=this.atomic(()=>this.profile(identity));return {mode:this.mode,pet:row.pet,build:buildPet({...row.build,lineageId:row.pet.lineageId,xp:row.pet.xp,gearStats:row.pet.gearStats}),busy:this.busy(identity.key),rooms:Object.values(this.db.rooms).filter(r=>r.players.some(p=>p?.owner===identity.key)||r.status==='waiting'&&r.invitedOwner===identity.key).slice(-50).map(r=>{const seat=r.players.findIndex(p=>p?.owner===identity.key);return {id:r.id,status:r.status,tournament:r.tournament,opponent:r.players[seat<0?0:1-seat]?.pet.name||'Awaiting opponent',practice:r.players.some(p=>p?.bot),createdAt:r.createdAt,finishedAt:r.finishedAt,reason:r.battle?.reason||r.status,result:r.battle?r.battle.winner===null?'Draw':r.battle.winner===seat?'Win':'Loss':r.status};}),tournaments:Object.values(this.db.tournaments).filter(t=>t.roster.some(p=>p.owner===identity.key)).slice(-8).map(t=>({id:t.id,name:t.name,status:t.status})),stakesEnabled:false};}
 schedule(at){if(Number.isFinite(at)&&at>this.clock())this.nextTickAt=this.nextTickAt?Math.min(this.nextTickAt,at):at;}
 save(identity,input){return this.transaction(()=>{if(this.busy(identity.key))fail('Your build is locked while entered in a battle or tournament.',409);const row=this.profile(identity);const build=buildPet({...input,lineageId:row.pet.lineageId,xp:row.pet.xp,gearStats:row.pet.gearStats});row.build=cleanBuild(build);return {build};});}
 makeRoom(players,{tournament=null,checkin=false,rematch=0}={}){
  if(Object.keys(this.db.rooms).length>=2000)fail('Arena room capacity reached. Try later.',503);
  const now=this.clock(),r={id:token(),players,createdAt:now,status:checkin?'checkin':'waiting',expiresAt:now+300000,tournament,rematch,ready:players.map(()=>false),spectatorConsent:players.map(p=>!!p?.bot),spectatorCapabilities:[],battle:null,pending:[null,null],revision:0};
  this.db.rooms[r.id]=r;this.schedule(r.expiresAt);return r;
 }
 challenge(identity,{practice=false,guided=false,sparring}={}){return this.transaction(()=>{
  if(guided&&!practice)fail('Guided mode is available only for practice.',400);
  if(sparring!==undefined&&(!practice||guided||typeof sparring!=='string'||!Object.hasOwn(SPARRING_PROFILES,sparring)))fail('Choose an allowed sparring rival for unguided practice.',400);
  this.tick();if(this.busy(identity.key))fail('Finish or cancel your current entry first.',409);
  const p=this.packed(identity),r=this.makeRoom([p,null]);
  if(practice){if(guided)r.guidedPractice={version:1,skipped:false,replayOf:null};const id=Object.keys(LINEAGES)[randomInt(6)];if(sparring)r.sparring={version:SPARRING_VERSION,profile:sparring};r.players[1]=this.practicePlayer(p,r.id,id,sparring);this.start(r);}
  return this.roomView(r,identity.key);
 });}
 room(id){const r=this.db.rooms[id];if(!r)fail('Challenge not found.',404);return r;}
 join(identity,id){return this.transaction(()=>{
  this.tick();const r=this.room(id);if(r.players.some(p=>p?.owner===identity.key)){if(r.players.find(p=>p?.owner===identity.key).pet.genesisId!==identity.pet.genesisId)fail('Your entered Pet has changed.',409);return this.roomView(r,identity.key);}
  if(r.status!=='waiting'||r.players[1])fail('This challenge is no longer open.',409);
  if(this.busy(identity.key))fail('Finish your current entry first.',409);
  if(r.invitedOwner&&r.invitedOwner!==identity.key)fail('Only the invited opponent may accept this rematch.',403);
  if(r.invitedPet&&r.invitedPet!==identity.pet.genesisId)fail('Your invited Pet has changed.',409);
  const p=this.packed(identity);if(p.pet.genesisId===r.players[0].pet.genesisId)fail('A Pet cannot battle itself.',409);
  if(Math.abs(p.build.level-r.players[0].build.level)>1)fail('Challenges require Pets within 1 Hatchery level.',409);
  r.players[1]=p;r.spectatorConsent??=[false,false];r.spectatorConsent[1]=false;if(this.matchmaking&&!r.tournament){r.status='checkin';r.confirmationRequired=true;r.confirmationEndsAt=this.clock()+CONFIRMATION_MS;this.schedule(r.confirmationEndsAt);r.ready=[false,true];r.revision++;}else this.start(r);return this.roomView(r,identity.key);
 });}
 start(r){const now=this.clock(),startsAt=now+(this.matchmaking?COUNTDOWN_MS:0);r.status='playing';r.countdownMs=this.matchmaking?COUNTDOWN_MS:0;r.fightOpened=!r.countdownMs;r.startedAt=startsAt;r.endsAt=startsAt+BATTLE_MS;r.opensAt=startsAt;r.turnEndsAt=startsAt+TURN_MS;r.battle=newBattle(r.players.map(p=>p.build));r.pending=[null,null];r.revision++;this.schedule(startsAt);this.schedule(r.turnEndsAt);this.schedule(r.endsAt);this.commitBot(r);}
 practicePlayer(p,roomId,lineage,profile){return {owner:'bot:'+roomId,pet:{...p.pet,genesisId:'PRACTICE-BOT',name:profile?SPARRING_PROFILES[profile].name:'Paper Hands Bot',lineageId:lineage,art:p.pet.art.replace(p.pet.lineageId,lineage),layers:[],gearRevision:0,gearLoadout:[],gearStats:{},identitySource:'PRACTICE_BOT'},build:profile?createSparringBuild(lineage,p.pet.xp,profile):defaultBuild(lineage,p.pet.xp),bot:true};}
 commitBot(r){for(let i=0;i<2;i++)if(r.players[i]?.bot&&r.battle?.status==='playing'&&!r.pending[i]){
  // Commit once, before any human submission. Never pass the room/pending choices.
  r.pending[i]=r.sparring?.version===SPARRING_VERSION?decideSparring(r.battle,i,r.sparring.profile,r.id):legacyPracticeMove(r.battle,i);
 }}
 ready(identity,id){return this.transaction(()=>{this.tick();const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key);if(seat<0)fail('Not your bracket match.',403);if(r.players[seat].pet.genesisId!==identity.pet.genesisId)fail('Your entered Pet has changed. This entry cannot be played.',409);if(r.status==='checkin'){if(!r.ready[seat]){r.ready[seat]=true;r.revision++;}if(r.ready.every(Boolean))this.start(r);}return this.roomView(r,identity.key);});}
 choose(identity,id,{round,move}={}){return this.transaction(()=>{
  this.tick();const r=this.room(id),i=r.players.findIndex(p=>p?.owner===identity.key);if(i<0)fail('You are not a player in this battle.',403);
  if(r.status!=='playing'||round!==r.battle.round)fail('Exchange has already changed. Refresh the battle.',409);
  if(r.players[i].pet.genesisId!==identity.pet.genesisId)fail('Your entered Pet has changed. This entry cannot be played.',409);
  if(this.clock()<r.opensAt)fail(this.clock()<r.startedAt?'The fight countdown is still running.':'The previous exchange is still revealing.',409);
  if(r.pending[i]){if(r.pending[i]===move)return this.roomView(r,identity.key);fail('Your move is already locked.',409);}
  if(!legalMoves(r.battle,i).includes(move))fail('Move unavailable: check energy, cooldown and epic conditions.',409);
  r.pending[i]=move;r.battle.fighters[i].timeouts=0;r.revision++;
  if(r.pending.every(Boolean))this.exchange(r,this.clock());return this.roomView(r,identity.key);
 });}
 exchange(r,at){r.battle=resolve(r.battle,r.pending);r.pending=[null,null];r.revision++;
  if(r.battle.status!=='playing')return this.end(r);
  r.opensAt=at+REVEAL_MS;r.turnEndsAt=Math.min(r.endsAt,r.opensAt+TURN_MS);this.schedule(r.opensAt);this.schedule(r.turnEndsAt);this.schedule(r.endsAt);this.commitBot(r);
 }
 end(r){r.status=r.battle?.status||'cancelled';r.finishedAt=this.clock();r.pending=[null,null];r.revision++;
  r.receipt=createHash('sha256').update(JSON.stringify({version:VERSION,id:r.id,builds:r.players.map(p=>p?.build),log:r.battle?.log,status:r.status,winner:r.battle?.winner})).digest('hex');
  if(r.tournament)this.advanceTournament(r);
 }
 cancel(identity,id,{beforeFight=false}={}){if(typeof beforeFight!=='boolean')fail('Invalid cancellation intent.',400);return this.transaction(()=>{this.tick();const r=this.room(id),i=r.players.findIndex(p=>p?.owner===identity.key);if(i<0&&!(r.status==='waiting'&&r.invitedOwner===identity.key))fail('Not your challenge.',403);
  if(['won','draw','cancelled','expired'].includes(r.status))return this.roomView(r,identity.key);
  if(beforeFight&&r.status==='playing'&&this.clock()>=r.startedAt)fail('The fight has started. Confirm a concession separately.',409);
  if(r.tournament&&r.status==='playing'&&this.clock()<r.startedAt)fail('Wait until FIGHT before conceding this bracket match.',409);
  if(r.status==='waiting'||!r.tournament&&(r.confirmationRequired&&r.status==='checkin'||r.status==='playing'&&this.clock()<r.startedAt)){r.status='cancelled';r.finishedAt=this.clock();r.battle=null;r.pending=[null,null];r.revision++;}
  else {if(!r.battle)r.battle=newBattle(r.players.map(p=>p.build));r.battle.status='won';r.battle.winner=1-i;r.battle.reason='CONCEDED';this.end(r);}
  return this.roomView(r,identity.key);
 });}
 tick(){if(this.inTransaction)return;const now=this.clock();if(this.store&&this.nextTickAt&&now<this.nextTickAt&&this.nextMaintenanceAt&&now<this.nextMaintenanceAt)return false;return this.atomic(()=>this.tickState());}
 tickState(){this.prunePresence();let changed=false;const now=this.clock();this.nextTickAt=0;this.nextMaintenanceAt=now+3600000;
  for(const r of Object.values(this.db.rooms)){
   if(r.status==='waiting'&&now>=r.expiresAt){r.status='expired';r.finishedAt=now;r.revision++;changed=true;}
   if(r.status==='checkin'&&r.confirmationRequired&&now>=r.confirmationEndsAt){r.status='cancelled';r.cancelReason='CONFIRMATION_TIMEOUT';r.finishedAt=now;r.revision++;changed=true;}
   if(r.status==='checkin'&&!r.confirmationRequired&&now>=r.expiresAt){r.battle=newBattle(r.players.map(p=>p.build));r.battle.winner=r.ready[0]===r.ready[1]?null:r.ready[0]?0:1;r.battle.status=r.battle.winner===null?'draw':'won';r.battle.reason='CHECKIN_FORFEIT';this.end(r);changed=true;}
   if(r.status!=='playing')continue;
   if(r.countdownMs&&!r.fightOpened&&now>=r.startedAt){r.fightOpened=true;r.revision++;changed=true;}
   // Enforce absolute deadline even after process downtime; never extend or replay missed time.
   if(now>=r.endsAt){r.battle=finishOnClock(r.battle);this.end(r);changed=true;continue;}
   if(now>=r.turnEndsAt){
    for(let i=0;i<2;i++)if(!r.pending[i]){r.pending[i]='recharge';r.battle.fighters[i].timeouts++;}
    const timed=r.battle.fighters.map(f=>f.timeouts>=3);
    if(timed.some(Boolean)){r.battle.winner=timed[0]===timed[1]?null:timed[0]?1:0;r.battle.status=r.battle.winner===null?'draw':'won';r.battle.reason='THREE_MISSED_TURNS';this.end(r);}else this.exchange(r,now);
    changed=true;
   }
  }
  for(const t of Object.values(this.db.tournaments))if(t.status==='registration'&&now>=t.expiresAt){t.status='expired';changed=true;}
  // Retain active brackets and every referenced room. Archive finished groups together.
  const terminal=t=>!['registration','playing'].includes(t.status);
  for(const t of Object.values(this.db.tournaments))if(terminal(t)&&!t.finishedAt){t.finishedAt=now;changed=true;}
  const oldTours=Object.values(this.db.tournaments).filter(terminal).sort((a,b)=>b.finishedAt-a.finishedAt);
  for(const [i,t] of oldTours.entries())if(i>=100||now-t.finishedAt>7*86400000){delete this.db.tournaments[t.id];for(const [id,r] of Object.entries(this.db.rooms))if(r.tournament===t.id)delete this.db.rooms[id];}
  const completed=Object.values(this.db.rooms).filter(r=>!r.tournament&&!['waiting','checkin','playing'].includes(r.status)).sort((a,b)=>(b.finishedAt||b.createdAt)-(a.finishedAt||a.createdAt));
  for(const [i,r] of completed.entries())if(i>=500||now-(r.finishedAt||r.createdAt)>7*86400000)delete this.db.rooms[r.id];
  const referenced=new Set([...Object.values(this.db.rooms).flatMap(r=>[...r.players.filter(Boolean).map(p=>p.owner),r.invitedOwner]),...Object.values(this.db.tournaments).flatMap(t=>t.roster.map(p=>p.owner))]);
  const idle=Object.entries(this.db.profiles).filter(([key])=>!referenced.has(key)).sort((a,b)=>(b[1].lastActiveAt||b[1].lastSeenAt||0)-(a[1].lastActiveAt||a[1].lastSeenAt||0));
  for(const [i,[key,p]] of idle.entries()){const seen=p.lastActiveAt||p.lastSeenAt||0;if(i>=1000||seen&&now-seen>30*86400000)delete this.db.profiles[key];}
  for(const r of Object.values(this.db.rooms)){if(r.status==='waiting')this.schedule(r.expiresAt);else if(r.status==='checkin')this.schedule(r.confirmationRequired?r.confirmationEndsAt:r.expiresAt);else if(r.status==='playing'){if(r.countdownMs&&!r.fightOpened)this.schedule(r.startedAt);this.schedule(r.turnEndsAt);this.schedule(r.endsAt);}}
  for(const t of Object.values(this.db.tournaments))if(t.status==='registration')this.schedule(t.expiresAt);
  return changed;
 }
 replay(identity,id){this.tick();const r=this.room(id);if(!r.players.some(p=>p?.owner===identity.key))fail('Only participants may export a replay.',403);if(!['won','draw'].includes(r.status))fail('Complete the battle before exporting.',409);return exportReplay(r);}
 rematch(identity,id){return this.transaction(()=>{const old=this.room(id),seat=old.players.findIndex(p=>p?.owner===identity.key);
  if(seat<0)fail('Not your battle.',403);
  if(!['won','draw'].includes(old.status)||old.tournament||old.players.some(p=>p?.bot))fail('Rematches require a completed casual player battle.',409);
  const opponent=old.players[1-seat];if(identity.pet.genesisId!==old.players[seat].pet.genesisId)fail('Your original Pet has changed.',409);
  if(this.busy(identity.key)||this.busy(opponent.owner))fail('Both players must finish their current entries first.',409);
  const p=this.packed(identity),r=this.makeRoom([p,null]);r.invitedOwner=opponent.owner;r.invitedPet=opponent.pet.genesisId;r.rematchOf=old.id;
  return this.roomView(r,identity.key);
 });}

 // Discovery is opt-in metadata on existing rooms, never a second feed.
 requireIdentity(identity){if(!identity?.key||!identity.pet?.genesisId)fail('An authenticated Pet is required.',401);}
 postable(r){
  const p=r?.players?.[0];
  try{if(!p?.build||JSON.stringify(buildPet({...cleanBuild(p.build),lineageId:p.pet?.lineageId,xp:p.pet?.xp,gearStats:p.pet?.gearStats}))!==JSON.stringify(p.build))return false;}catch{return false;}
  return !!(r&&typeof r.id==='string'&&/^[a-f0-9]{24}$/.test(r.id)&&this.db.rooms[r.id]===r&&r.status==='waiting'&&r.tournament===null&&r.rematch===0&&
   !Object.hasOwn(r,'invitedOwner')&&!Object.hasOwn(r,'invitedPet')&&!Object.hasOwn(r,'rematchOf')&&
   Array.isArray(r.players)&&r.players.length===2&&r.players[1]===null&&p&&!p.bot&&typeof p.owner==='string'&&p.owner&&
   typeof p.pet?.genesisId==='string'&&p.pet.genesisId&&typeof p.pet.name==='string'&&p.pet.name.trim()&&p.pet.name.length<=80&&
   Object.hasOwn(LINEAGES,p.pet.lineageId)&&Number.isInteger(p.pet.level)&&p.pet.level>=1&&p.pet.level<=10&&p.build?.level===p.pet.level&&p.build?.lineageId===p.pet.lineageId&&
   r.battle===null&&Array.isArray(r.pending)&&r.pending.length===2&&r.pending.every(v=>v===null)&&
   Array.isArray(r.ready)&&r.ready.length===2&&r.ready.every(v=>v===false)&&Number.isInteger(r.revision)&&r.revision>=0&&
   Number.isFinite(r.createdAt)&&Number.isFinite(r.expiresAt)&&r.createdAt<=this.clock()&&r.expiresAt===r.createdAt+300000&&r.expiresAt>this.clock());
 }
 listed(r){return this.postable(r)&&Number.isFinite(r.challengePostedAt)&&r.challengePostedAt>=r.createdAt&&r.challengePostedAt<=this.clock()&&r.challengePostedAt<r.expiresAt;}
 challengeCard(r){const p=r.players[0].pet;
  // Names remain display names, but cannot turn discovery into handles/links/identity dumps.
  const unsafe=/(?:https?:|www\.|[a-z0-9-]+\.[a-z]{2,}(?:\b|\/)|@|0x[a-f0-9]{12,}|AXO-[a-f0-9]{10}|REVIEW-[a-f0-9]{10}|[a-f0-9]{24,})/i;
  const name=unsafe.test(p.name)||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(p.name)||p.name.includes(p.genesisId)||p.name.includes(r.players[0].owner)?'Arena Pet':p.name;
  const canonicalArt=`/${p.level===10?'hatchery-nft-v5':'hatchery-nft-v5.1.1'}/pet_${p.lineageId}_l${String(p.level).padStart(2,'0')}.webp`;
  return {id:r.id,pet:{name,lineageId:p.lineageId,lineage:LINEAGES[p.lineageId].name,level:p.level,...(p.art===canonicalArt?{art:canonicalArt}:{})},postedAt:r.challengePostedAt,expiresAt:r.expiresAt,stakesEnabled:false,mode:'free_play'};
 }
 challengeRoom(identity){this.requireIdentity(identity);this.tick();const rooms=Object.values(this.db.rooms),own=rooms.find(r=>r.players?.[0]?.owner===identity.key&&this.postable(r));
  return {cards:rooms.filter(r=>this.listed(r)&&!this.blockedEither(identity.key,r.players[0].owner)).sort((a,b)=>b.challengePostedAt-a.challengePostedAt||b.createdAt-a.createdAt||a.id.localeCompare(b.id)).slice(0,50).map(r=>this.challengeCard(r)),
   own:own?{id:own.id,posted:this.listed(own),expiresAt:own.expiresAt,petMatches:own.players[0].pet.genesisId===identity.pet.genesisId}:null,busy:this.busy(identity.key),limit:50,serverNow:this.clock(),stakesEnabled:false,...(this.matchmaking?{matchmakingEnabled:true,...this.presenceView(identity),...this.lobbyStatus(identity)}:{})};
 }
 postChallenge(identity,id,{posted}={}){this.requireIdentity(identity);if(typeof posted!=='boolean')fail('Choose post or remove; no text or media is accepted.');return this.transaction(()=>{
  const r=this.room(id);if(r.players?.[0]?.owner!==identity.key)fail('Only the challenge owner may post or remove it.',403);
  if(r.players[0].pet?.genesisId!==identity.pet.genesisId)fail('Your entered Pet has changed.',409);
  if(!this.postable(r))fail('Only an open casual waiting challenge can be posted or removed.',409);
  if(posted){if(!this.listed(r)){r.challengePostedAt=this.clock();r.revision++;}}
  else if(Object.hasOwn(r,'challengePostedAt')){delete r.challengePostedAt;r.revision++;}
  return {id:r.id,posted:this.listed(r),status:r.status,expiresAt:r.expiresAt,stakesEnabled:false};
 });}
 acceptChallenge(identity,id){this.requireIdentity(identity);return this.transaction(()=>{
  const r=this.room(id),seat=r.players?.findIndex(p=>p?.owner===identity.key);
  if(seat===0)fail('This is your challenge. Wait for another Pet.',409);
  // Retry only acknowledges this exact Pet's already successful board acceptance.
  if(seat===1&&r.challengeAccepted===true&&r.players[1].pet.genesisId===identity.pet.genesisId)return {id:r.id,status:r.status,accepted:true,stakesEnabled:false};
  if(!this.listed(r))fail('This Challenge Room card is no longer open. Refresh the room.',409);
  this.join(identity,id);r.challengeAccepted=true;
  return {id:r.id,status:r.status,accepted:true,stakesEnabled:false};
 });}

 // Presence is opt-in, short-lived memory only. Never stored in the canonical Arena DB.
 prunePresence(){const now=this.clock();for(const[id,p]of this.presence)if(p.expiresAt<=now)this.presence.delete(id);for(const[key,expires]of this.inviteCooldown)if(expires<=now)this.inviteCooldown.delete(key);}
 requireMatchmaking(identity){this.requireIdentity(identity);if(!this.matchmaking)fail('Matchmaking is unavailable.',404);}
 safePresencePet(identity){const p=identity.pet;if(!Object.hasOwn(LINEAGES,p.lineageId)||!Number.isInteger(p.level)||p.level<1||p.level>10||typeof p.name!=='string'||!p.name.trim()||p.name.length>80)fail('Invalid authenticated Pet.',400);return this.challengeCard({players:[{owner:identity.key,pet:p}]}).pet;}
 setPresence(identity,{available,lease}={}){this.requireMatchmaking(identity);if(typeof available!=='boolean'||lease!==undefined&&(typeof lease!=='string'||!/^[a-f0-9]{24}$/.test(lease)))fail('Invalid availability lease.',400);this.prunePresence();
  if(!available){if(lease){const old=this.presence.get(lease);if(old&&old.owner!==identity.key)fail('Not your availability lease.',403);if(old)this.presence.delete(lease);}return {available:false,serverNow:this.clock(),stakesEnabled:false};}
  this.safePresencePet(identity);const snapshot=copy(identity);let row=lease?this.presence.get(lease):null;
  if(lease&&(!row||row.expiresAt<=this.clock()))fail('Availability lease expired. Rejoin the room.',409);
  if(row&&(row.owner!==identity.key||row.identity.pet.genesisId!==identity.pet.genesisId))fail('Availability belongs to a different Pet.',403);
  if(!row){if(this.presence.size>=200)fail('Online list capacity reached. Retry shortly.',503);if([...this.presence.values()].filter(p=>p.owner===identity.key).length>=3)fail('Too many active availability tabs.',429);row={id:token(),owner:identity.key};this.presence.set(row.id,row);}
  row.identity=snapshot;row.expiresAt=this.clock()+PRESENCE_TTL_MS;return {available:true,lease:row.id,expiresAt:row.expiresAt,heartbeatMs:PRESENCE_HEARTBEAT_MS,ttlMs:PRESENCE_TTL_MS,serverNow:this.clock(),stakesEnabled:false};
 }
 presenceView(identity){this.prunePresence();const newest=new Map();for(const row of this.presence.values()){const old=newest.get(row.owner);if(!old||row.expiresAt>old.expiresAt)newest.set(row.owner,row);}
  const players=[...newest.values()].filter(row=>row.owner!==identity.key&&!this.blockedEither(identity.key,row.owner)).sort((a,b)=>b.expiresAt-a.expiresAt||a.id.localeCompare(b.id)).slice(0,50).map(row=>{const busy=this.busy(row.owner),pet=this.safePresencePet(row.identity);return {id:row.id,pet,status:busy?'busy':'available',canChallenge:!busy&&!this.busy(identity.key)&&Math.abs(pet.level-identity.pet.level)<=1&&row.identity.pet.genesisId!==identity.pet.genesisId};});
  return {players,presenceLimit:50,presenceTtlMs:PRESENCE_TTL_MS};
 }
 lobbyStatus(identity){this.requireMatchmaking(identity);this.tick();const rooms=Object.values(this.db.rooms),active=rooms.filter(r=>['checkin','playing'].includes(r.status)&&r.players.some(p=>p?.owner===identity.key)).sort((a,b)=>b.createdAt-a.createdAt)[0];let activeMatch=null;
  if(active){const seat=active.players.findIndex(p=>p?.owner===identity.key);activeMatch={id:active.id,status:active.status,confirmationRequired:!!active.confirmationRequired,petMatches:active.players[seat].pet.genesisId===identity.pet.genesisId,needsConfirmation:active.status==='checkin'&&!active.ready[seat],opponent:this.safePresencePet({key:active.players[1-seat].owner,pet:active.players[1-seat].pet}),confirmationEndsAt:active.confirmationEndsAt||active.expiresAt,startedAt:active.startedAt};}
  const incoming=rooms.filter(r=>r.status==='waiting'&&r.invitedOwner===identity.key&&r.invitedPet===identity.pet.genesisId).slice(-3).map(r=>({id:r.id,pet:this.safePresencePet({key:r.players[0].owner,pet:r.players[0].pet}),expiresAt:r.expiresAt}));return {activeMatch,incoming,serverNow:this.clock(),stakesEnabled:false};
 }
 directChallenge(identity,id){this.requireMatchmaking(identity);this.prunePresence();const target=this.presence.get(id);if(!target||target.expiresAt<=this.clock())fail('This Pet is no longer available. Refresh the online list.',409);if(target.owner===identity.key||target.identity.pet.genesisId===identity.pet.genesisId)fail('A Pet cannot challenge itself.',409);if(this.blockedEither(identity.key,target.owner))fail('This challenge is unavailable.',403);const cooldownKey=identity.key+'\0'+target.owner;
  const result=this.transaction(()=>{const existing=Object.values(this.db.rooms).find(r=>r.directInvite&&['waiting','checkin','playing'].includes(r.status)&&r.players[0].owner===identity.key&&r.invitedOwner===target.owner&&r.players[0].pet.genesisId===identity.pet.genesisId&&r.invitedPet===target.identity.pet.genesisId);if(existing)return this.roomView(existing,identity.key);
   if(this.inviteCooldown.size>=2000&&!this.inviteCooldown.has(cooldownKey))fail('Invitation rate capacity reached. Retry shortly.',503);if(this.inviteCooldown.has(cooldownKey))fail('Wait one minute before inviting this Pet again.',429);if(this.busy(identity.key)||this.busy(target.owner))fail('Both Pets must be free before a direct challenge.',409);if(Math.abs(identity.pet.level-target.identity.pet.level)>1)fail('Challenges require Pets within one level.',409);
   if(Object.values(this.db.rooms).filter(r=>r.status==='waiting'&&r.invitedOwner===target.owner).length>=3)fail('This Pet has enough pending invitations. Try later.',429);
   const r=this.makeRoom([this.packed(identity),null]);r.directInvite=true;r.invitedOwner=target.owner;r.invitedPet=target.identity.pet.genesisId;return this.roomView(r,identity.key);
  });this.inviteCooldown.set(cooldownKey,this.clock()+60000);return result;
 }

 roomView(r,key){const seat=r.players.findIndex(p=>p?.owner===key),battle=r.battle?copy(r.battle):null,opponent=seat>=0?r.players[1-seat]:null,consent=r.spectatorConsent||r.players.map(()=>false),activeCapabilities=(r.spectatorCapabilities||[]).filter(v=>!v.revokedAt).map(v=>({id:v.id,createdAt:v.createdAt})),moderationAvailable=!!(opponent&&!opponent.bot);
  const ownBlocks=moderationAvailable?this.db.profiles[key]?.blocks||[]:[],opponentDigest=moderationAvailable?ownerDigest(opponent.owner):null;
  return {id:r.id,status:r.status,revision:r.revision,seat,challengeRoomPosted:this.listed(r),canPostChallenge:seat===0&&this.postable(r),tournament:r.tournament,rematchOf:r.rematchOf,canAccept:!r.invitedOwner||r.invitedOwner===key,createdAt:r.createdAt,finishedAt:r.finishedAt,players:r.players.map(p=>p?{pet:p.pet,build:p.build,bot:!!p.bot}:null),battle,legal:seat>=0&&battle&&!(r.countdownMs&&!r.fightOpened)?legalMoves(battle,seat):[],epicReady:seat>=0&&battle?epicCondition(battle.fighters[seat]):false,locked:seat>=0?!!r.pending[seat]:false,opponentLocked:seat>=0?!!r.pending[1-seat]:false,selected:seat>=0?r.pending[seat]:null,ready:r.ready,confirmationRequired:!!r.confirmationRequired,confirmationEndsAt:r.confirmationEndsAt,directInvite:!!r.directInvite,countdownMs:r.countdownMs||0,phase:r.status==='playing'?(r.countdownMs&&!r.fightOpened?'countdown':this.clock()<r.opensAt?'reveal':'choosing'):r.status,startedAt:r.startedAt,endsAt:r.endsAt,opensAt:r.opensAt,turnEndsAt:r.turnEndsAt,expiresAt:r.expiresAt,serverNow:this.clock(),receipt:r.receipt,spectatorConsent:consent,spectatorAccess:{allowed:seat>=0?consent[seat]===true:false,allConsented:r.players.filter(Boolean).every((p,i)=>p.bot||consent[i]===true),canIssue:seat>=0,capabilities:seat>=0?activeCapabilities:[]},moderation:{available:moderationAvailable,blocked:moderationAvailable&&ownBlocks.includes(opponentDigest)},practiceGuide:this.practiceGuide(r,seat),practiceOpponent:r.sparring?.version===SPARRING_VERSION?{version:SPARRING_VERSION,profile:r.sparring.profile,...SPARRING_PROFILES[r.sparring.profile]}:null,stakesEnabled:false};
 }
 roomPreview(r,key){const invited=r.invitedOwner===key,listed=this.listed(r),seat=r.players.findIndex(p=>p?.owner===key);if(seat>=0)return this.roomView(r,key);if(!invited&&!listed&&!['playing','won','draw'].includes(r.status))fail('This invitation is private.',403);const visible=r.players.map(p=>p?{pet:this.challengeCard({players:[p]}).pet}:null),target=invited?r.players[0]?.owner:null,blocked=target?this.db.profiles[key]?.blocks?.includes(ownerDigest(target))===true:false;return {id:r.id,status:r.status,revision:r.revision,seat:-1,preview:true,previewKind:invited?'invitation':listed?'listed':'limited',canAccept:invited||listed,players:visible,battle:r.battle?{status:r.battle.status,winner:r.battle.winner,reason:r.battle.reason,round:r.battle.round,log:[]}:null,legal:[],epicReady:false,locked:false,opponentLocked:false,selected:null,ready:[],phase:r.status,createdAt:r.createdAt,finishedAt:r.finishedAt,expiresAt:r.expiresAt,serverNow:this.clock(),moderation:{available:invited&&!!target&&!target.startsWith('bot:'),blocked},stakesEnabled:false};}
 spectatorAllowed(r,value){if(!value||!Array.isArray(r.spectatorCapabilities))return false;const digest=capabilityDigest(value),row=r.spectatorCapabilities.find(v=>v.digest===digest&&!v.revokedAt);return !!row&&Array.isArray(r.spectatorConsent)&&r.players.filter(Boolean).every((_,i)=>r.players[i]?.bot||r.spectatorConsent[i]===true);}
 getRoom(identity,id,{spectatorToken=null}={}){this.tick();const r=this.room(id);if(r.players.some(p=>p?.owner===identity.key))return this.roomView(r,identity.key);if(this.spectatorAllowed(r,spectatorToken)){const out=this.roomView(r,'spectator');out.seat=-1;out.legal=[];out.locked=false;out.opponentLocked=r.pending.some(Boolean);out.selected=null;out.spectator=true;return out;}if(this.privacyMode!=='strict'&&!r.directInvite){const out=this.roomView(r,identity.key);out.legacyCompatibilityProjection=true;return out;}return this.roomPreview(r,identity.key);}
 spectatorConsent(identity,id,{allowed}={}){if(typeof allowed!=='boolean')fail('Choose whether spectators may view this battle.');return this.transaction(()=>{const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key);if(seat<0)fail('Only participants set spectator consent.',403);r.spectatorConsent??=r.players.map(()=>false);r.spectatorConsent[seat]=allowed;if(!allowed)for(const cap of r.spectatorCapabilities||[])cap.revokedAt??=this.clock();r.revision++;return {id:r.id,allowed,allConsented:r.players.filter(Boolean).every((p,i)=>p.bot||r.spectatorConsent[i]===true),stakesEnabled:false};});}
 issueSpectator(identity,id){return this.transaction(()=>{const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key);if(seat<0)fail('Only participants may create spectator access.',403);r.spectatorConsent??=r.players.map(()=>false);if(!r.players.filter(Boolean).every((p,i)=>p.bot||r.spectatorConsent[i]===true))fail('Every participant must consent before spectator access is created.',409);const value=token()+token(),cap={id:token(),digest:capabilityDigest(value),createdAt:this.clock(),createdBy:seat,revokedAt:null};r.spectatorCapabilities??=[];r.spectatorCapabilities.push(cap);r.revision++;return {id:cap.id,token:value,scope:'room:spectate',revocable:true,stakesEnabled:false};});}
 revokeSpectator(identity,id,capabilityId){return this.transaction(()=>{const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key);if(seat<0)fail('Only participants may revoke spectator access.',403);const cap=(r.spectatorCapabilities||[]).find(v=>v.id===capabilityId);if(!cap)fail('Spectator capability not found.',404);cap.revokedAt??=this.clock();r.revision++;return {id:cap.id,revoked:true,stakesEnabled:false};});}
 blockedEither(a,b){const ad=ownerDigest(a),bd=ownerDigest(b);return !!this.db.profiles[a]?.blocks?.includes(bd)||!!this.db.profiles[b]?.blocks?.includes(ad);}
 blockPlayer(identity,id,{blocked=true}={}){if(typeof blocked!=='boolean')fail('Choose block or unblock.');return this.transaction(()=>{const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key),invited=r.invitedOwner===identity.key;if(seat<0&&!invited)fail('Only an involved player can block this opponent.',403);const target=seat>=0?r.players[1-seat]?.owner:r.players[0]?.owner;if(!target||target.startsWith('bot:'))fail('No player opponent is available.',409);const row=this.touch(identity),digest=ownerDigest(target),set=new Set(row.blocks||[]);blocked?set.add(digest):set.delete(digest);row.blocks=[...set].slice(-200);if(blocked&&['waiting','checkin'].includes(r.status)){r.status='cancelled';r.finishedAt=this.clock();r.revision++;}return {blocked,receipt:createHash('sha256').update(identity.key+'\0'+digest+'\0'+blocked).digest('hex'),stakesEnabled:false};});}
 reportPlayer(identity,id,{category}={}){const allowed=['harassment','identity_leak','invite_abuse','other'];if(!allowed.includes(category))fail('Choose a supported private report category.');return this.transaction(()=>{const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key),invited=r.invitedOwner===identity.key;if(seat<0&&!invited)fail('Only an involved player can report this opponent.',403);const target=seat>=0?r.players[1-seat]?.owner:r.players[0]?.owner;if(!target||target.startsWith('bot:'))fail('No player opponent is available.',409);const row=this.touch(identity),report={id:token(),roomDigest:createHash('sha256').update(r.id).digest('hex'),target:ownerDigest(target),category,createdAt:this.clock()};row.reports=[...(row.reports||[]),report].slice(-50);return {id:report.id,category,createdAt:report.createdAt,private:true,stakesEnabled:false};});}

 practiceGuide(r,seat){if(!r.guidedPractice||seat<0||r.players[seat]?.bot||r.guidedPractice.skipped)return null;const f=r.battle?.fighters?.[seat],round=r.battle?.round||1,lessons=[
  {id:'commitment',title:'Commitment',body:'One tap locks one hidden move. It cannot be changed after acknowledgment.',action:'Choose any legal move once.'},
  {id:'energy',title:'Energy',body:'Costs are paid before the exchange; every resolved exchange restores 2 energy.',action:'Use a move with an energy cost, then inspect the recovery.'},
  {id:'guard',title:'Guard',body:'Defense can block damage; both Pets still reveal and resolve together.',action:'Use a defense move such as Diamond Hands.'},
  {id:'cooldown',title:'Cooldown',body:'Cooldowns count intervening exchanges, not seconds.',action:'After using a cooldown move, inspect its remaining exchanges.'},
  {id:'epic',title:'Epic',body:'Epic needs learning, 100 charge, the lineage condition, and is once per battle.',action:'Inspect Epic now; use it if the server marks it legal.'}
 ];const used=f?.used||[],log=r.battle?.log||[];let index=0;if(log.length)index=1;if(f&&f.energy<6)index=2;if(used.some(k=>f?.build?.skills?.[k]?.branch==='defense'))index=3;if(f&&Object.values(f.cooldowns||{}).some(v=>v>0))index=4;if(f?.epicUsed)index=5;return {version:1,skippable:true,replayable:['won','draw','cancelled','expired'].includes(r.status),complete:index>=lessons.length,index:Math.min(index,lessons.length-1),lesson:lessons[Math.min(index,lessons.length-1)],lessons:lessons.map((v,i)=>({id:v.id,title:v.title,complete:i<index})),round};}
 skipPracticeGuide(identity,id){return this.transaction(()=>{const r=this.room(id),seat=r.players.findIndex(p=>p?.owner===identity.key);if(seat<0||!r.guidedPractice)fail('This is not your guided practice.',403);r.guidedPractice.skipped=true;r.revision++;return this.roomView(r,identity.key);});}
 replayPractice(identity,id){return this.transaction(()=>{const old=this.room(id),seat=old.players.findIndex(p=>p?.owner===identity.key);if(seat<0||!old.guidedPractice)fail('This is not your guided practice.',403);if(!['won','draw','cancelled','expired'].includes(old.status))fail('Finish or skip the active practice before replaying.',409);const p=this.packed(identity),r=this.makeRoom([p,null]);r.guidedPractice={version:1,skipped:false,replayOf:old.id};const lineage=Object.keys(LINEAGES)[randomInt(6)];r.players[1]=this.practicePlayer(p,r.id,lineage);r.spectatorConsent[1]=true;this.start(r);return this.roomView(r,identity.key);});}

  createTournament(identity,{name='The Hoodie Cup',size=4}={}){return this.transaction(()=>{
  this.tick();if(![4,8,16].includes(size))fail('Rosters support 4, 8 or 16 Pets.');if(typeof name!=='string'||!name.trim()||name.length>48)fail('Use a tournament name of 1–48 characters.');
  if(this.busy(identity.key)||Object.values(this.db.tournaments).some(t=>t.status==='registration'&&t.roster.some(p=>p.owner===identity.key)))fail('Finish your existing entry first.',409);
  if(Object.keys(this.db.tournaments).length>=200)fail('Tournament capacity reached.',503);
  const p=this.packed(identity);p.spectatorConsent=false;const t={id:token(),name:name.trim(),size,level:p.build.level,host:identity.key,roster:[p],spectatorCapabilities:[],status:'registration',createdAt:this.clock(),expiresAt:this.clock()+86400000,rounds:[],champion:null};this.db.tournaments[t.id]=t;this.schedule(t.expiresAt);return this.tournamentView(t,identity.key);
 });}
 tournament(id){const t=this.db.tournaments[id];if(!t)fail('Tournament not found.',404);return t;}
 joinTournament(identity,id){return this.transaction(()=>{this.tick();const t=this.tournament(id);if(t.roster.some(p=>p.owner===identity.key))return this.tournamentView(t,identity.key);
  if(t.status!=='registration'||t.roster.length>=t.size)fail('Roster is closed.',409);if(this.busy(identity.key)||Object.values(this.db.tournaments).some(v=>v.status==='registration'&&v.roster.some(p=>p.owner===identity.key)))fail('Finish your existing entry first.',409);
  const p=this.packed(identity);p.spectatorConsent=false;if(p.build.level!==t.level)fail(`This roster requires Hatchery level ${t.level}.`,409);if(t.roster.some(v=>v.pet.genesisId===p.pet.genesisId))fail('Pet already registered.',409);t.roster.push(p);return this.tournamentView(t,identity.key);
 });}
 startTournament(identity,id){return this.transaction(()=>{const t=this.tournament(id);if(t.host!==identity.key)fail('Only the roster host can start.',403);if(t.status!=='registration'||t.roster.length!==t.size)fail('Fill every roster slot first.',409);if(t.roster.some(p=>this.busy(p.owner,{exceptTournament:t.id})))fail('A registered player is already battling.',409);
  // Random seeding is fixed before check-in, unrelated to combat and cannot be re-rolled by start retries.
  const seeds=[...t.roster];for(let i=seeds.length-1;i>0;i--){const j=randomInt(i+1);[seeds[i],seeds[j]]=[seeds[j],seeds[i]];}
  t.status='playing';this.nextBracket(t,seeds);return this.tournamentView(t,identity.key);
 });}
 leaveTournament(identity,id){return this.transaction(()=>{const t=this.tournament(id);if(t.status!=='registration')fail('Roster locked; concede your bracket match instead.',409);if(t.host===identity.key)t.status='cancelled';else t.roster=t.roster.filter(p=>p.owner!==identity.key);return this.tournamentView(t,identity.key);});}
 nextBracket(t,players){if(players.length<=1){t.status='complete';t.finishedAt=this.clock();t.champion=players[0]?.pet||null;return;}
  const round=[];for(let i=0;i<players.length;i+=2){if(!players[i+1])round.push({bye:players[i]});else round.push({roomId:this.makeRoom([players[i],players[i+1]],{tournament:t.id,checkin:true}).id});}t.rounds.push(round);
 }
 advanceTournament(r){const t=this.tournament(r.tournament),round=t.rounds.at(-1),slot=round.find(v=>v.roomId===r.id);if(!slot)return;
  if(r.status==='draw'&&r.battle.reason!=='CHECKIN_FORFEIT'&&r.battle.reason!=='THREE_MISSED_TURNS'&&r.rematch===0){slot.previous=r.id;slot.roomId=this.makeRoom(r.players,{tournament:t.id,checkin:true,rematch:1}).id;return;}
  slot.done=true;slot.winner=r.battle.winner===null?null:r.players[r.battle.winner];
  if(round.every(v=>v.bye||v.done))this.nextBracket(t,round.map(v=>v.bye||v.winner).filter(Boolean));
 }
 tournamentView(t,key){const host=t.host===key,joined=t.roster.some(p=>p.owner===key),allEntrantsConsented=t.roster.length>0&&t.roster.every(p=>p.spectatorConsent===true);return {id:t.id,name:t.name,status:t.status,size:t.size,level:t.level,host,joined,roster:t.roster.map(p=>p.pet),rounds:t.rounds.map(round=>round.map(slot=>slot.bye?{bye:slot.bye.pet}:{roomId:slot.roomId,status:this.room(slot.roomId).status,players:this.room(slot.roomId).players.map(p=>p.pet),mine:this.room(slot.roomId).players.some(p=>p.owner===key),winner:slot.winner?.pet||null,previous:slot.previous})),champion:t.champion,entrantConsent:t.roster.find(p=>p.owner===key)?.spectatorConsent??false,allEntrantsConsented,spectatorAccess:{canIssue:host&&allEntrantsConsented,capabilities:host?(t.spectatorCapabilities||[]).filter(v=>!v.revokedAt).map(v=>({id:v.id,createdAt:v.createdAt})):[]},expiresAt:t.expiresAt,serverNow:this.clock(),stakesEnabled:false};}
 tournamentPreview(t){return {id:t.id,name:t.name,status:t.status,size:t.size,level:t.level,preview:true,rosterCount:t.roster.length,expiresAt:t.expiresAt,serverNow:this.clock(),stakesEnabled:false};}
 tournamentSpectatorAllowed(t,value){if(!value)return false;const cap=(t.spectatorCapabilities||[]).find(v=>v.digest===capabilityDigest(value)&&!v.revokedAt);return !!cap&&t.roster.length>0&&t.roster.every(p=>p.spectatorConsent===true);}
 getTournament(identity,id,{spectatorToken=null}={}){this.tick();const t=this.tournament(id);if(t.roster.some(p=>p.owner===identity.key)||this.tournamentSpectatorAllowed(t,spectatorToken))return this.tournamentView(t,identity.key);return this.tournamentPreview(t);}
 tournamentConsent(identity,id,{allowed}={}){if(typeof allowed!=='boolean')fail('Choose tournament spectator consent.');return this.transaction(()=>{const t=this.tournament(id),entry=t.roster.find(p=>p.owner===identity.key);if(!entry)fail('Only entrants set tournament spectator consent.',403);entry.spectatorConsent=allowed;if(!allowed)for(const cap of t.spectatorCapabilities||[])cap.revokedAt??=this.clock();return {id:t.id,allowed,allEntrantsConsented:t.roster.every(p=>p.spectatorConsent===true),stakesEnabled:false};});}
 issueTournamentSpectator(identity,id){return this.transaction(()=>{const t=this.tournament(id);if(t.host!==identity.key)fail('Only the host may create tournament spectator access.',403);if(!t.roster.length||!t.roster.every(p=>p.spectatorConsent===true))fail('Every entrant must consent before spectator access is created.',409);const value=token()+token(),cap={id:token(),digest:capabilityDigest(value),createdAt:this.clock(),revokedAt:null};t.spectatorCapabilities??=[];t.spectatorCapabilities.push(cap);return {id:cap.id,token:value,scope:'tournament:spectate',revocable:true,stakesEnabled:false};});}
 revokeTournamentSpectator(identity,id,capabilityId){return this.transaction(()=>{const t=this.tournament(id);if(t.host!==identity.key)fail('Only the host may revoke tournament spectator access.',403);const cap=(t.spectatorCapabilities||[]).find(v=>v.id===capabilityId);if(!cap)fail('Spectator capability not found.',404);cap.revokedAt??=this.clock();return {id:cap.id,revoked:true,stakesEnabled:false};});}
}
