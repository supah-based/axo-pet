// Private review host. Synthetic profiles are unmistakably marked; no production config or DB.
import express from 'express';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {ArenaService} from './service.mjs';
import {createArenaRouter,arenaStatic} from './http.mjs';
import {LINEAGES,XP} from './catalog.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function previewApp({service=new ArenaService({mode:'preview',matchmaking:true,privacyMode:'strict'}),origin=null}={}){
 const app=express(),sessions=new Map();app.disable('x-powered-by');
 app.use((_req,res,next)=>{res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'");next();});
 const allowed=(value,req)=>value===origin||value===`http://${req.get('host')}`;
 const current=req=>{const id=(req.headers.cookie||'').match(/(?:^|;\s*)axo_arena_review=([a-f0-9]{48})(?:;|$)/)?.[1];if(!id)return null;return sessions.get(id)||(service.db.profiles['review:'+id]?{key:'review:'+id,pet:service.db.profiles['review:'+id].pet}:null);};
 app.post('/api/arena/preview-session',express.json({limit:'2kb'}),(req,res)=>{
  if(!allowed(req.get('origin'),req)||req.get('sec-fetch-site')==='cross-site')return res.status(403).json({error:'Same-origin required.'});
  const {lineageId='emerald_sprout',level=10,name='Review Pet'}=req.body;
  if(!Object.hasOwn(LINEAGES,lineageId)||!Number.isInteger(level)||level<1||level>10||typeof name!=='string'||name.length<1||name.length>32)return res.status(400).json({error:'Invalid preview profile.'});
  const existing=current(req);if(existing&&service.busy(existing.key))return res.status(409).json({error:'Finish your current match before switching review Pets.'});
  if(sessions.size>=1000)return res.status(503).json({error:'Review session capacity reached.'});
  const id=randomBytes(24).toString('hex');const identity={key:'review:'+id,pet:{genesisId:'REVIEW-'+id.slice(0,10),name,lineageId,level,xp:XP[level-1],art:`/${level===10?'hatchery-nft-v5':'hatchery-nft-v5.1.1'}/pet_${lineageId}_l${String(level).padStart(2,'0')}.webp`,identitySource:'SYNTHETIC_REVIEW_PET'}};
  try{service.me(identity);}catch{return res.status(503).json({error:'Review identity could not be saved. Retry later.'});}sessions.set(id,identity);res.setHeader('Set-Cookie',`axo_arena_review=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);res.json({ok:true,mode:'preview',matchmaking:true});
 });
 app.get('/api/arena/config',(_req,res)=>res.json({mode:'preview',release:'1.5.0',matchmaking:service.matchmaking,stakesEnabled:false}));
 app.use('/api/arena',createArenaRouter({service,authenticate:current,originAllowed:allowed}));
 app.use('/arena',arenaStatic());app.get('/',(_req,res)=>res.redirect('/arena/'));
 for(const dir of ['hatchery-nft-v5','hatchery-nft-v5.1.1'])app.get(new RegExp(`^/${dir.replaceAll('.','\\.')}/(pet_[a-z_]+_l[0-9]{2}\\.webp)$`),(req,res)=>res.sendFile(req.params[0],{root:join(root,'../../public',dir)}));
 const interval=setInterval(()=>{try{service.tick();}catch{ /* Atomic rollback; next tick retries without acknowledging a move. */ }},250);interval.unref();app.arenaTimer=interval;return app;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4318),service=new ArenaService({file:join(root,'review/private-state-v1.2.json'),mode:'preview',matchmaking:true});
 previewApp({service,origin:process.env.PUBLIC_URL?new URL(process.env.PUBLIC_URL).origin:null}).listen(port,'127.0.0.1',()=>console.log(`AXO Pet Arena review listening on 127.0.0.1:${port}`));
}
