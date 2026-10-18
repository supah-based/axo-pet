import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';

const clone=value=>structuredClone(value);
const encoded=value=>JSON.stringify(value);
const kinds=['profiles','rooms','tournaments'];

export class ArenaStorageError extends Error{
 constructor(message,{code='STORAGE_UNAVAILABLE',status=503,outcomeUnknown=false}={}){super(message);this.code=code;this.status=status;this.outcomeUnknown=outcomeUnknown;}
}

export class NormalizedArenaStore{
 constructor({file,version,clock=()=>Date.now(),fault=null}={}){
  if(!file||typeof file!=='string')throw new TypeError('A SQLite file is required.');
  mkdirSync(dirname(file),{recursive:true});
  this.file=file;this.version=version;this.clock=clock;this.fault=fault;this.fenced=false;
  this.db=new DatabaseSync(file);
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.db.exec(`CREATE TABLE IF NOT EXISTS arena_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS arena_entities(kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(kind,id));`);
  const stored=this.meta('version');
  if(stored&&stored!==version)throw new ArenaStorageError('Arena state ruleset mismatch.',{code:'RULESET_MISMATCH',status:409});
  if(!stored){this.setMeta('version',version);this.setMeta('generation','0');}
  this.generation=Number(this.meta('generation')||0);
  this.metrics={commits:0,entityWrites:0,entityDeletes:0,bytesWritten:0,lastCommitMs:0,maxEntitiesPerCommit:0};
 }
 meta(key){return this.db.prepare('SELECT value FROM arena_meta WHERE key=?').get(key)?.value??null;}
 setMeta(key,value){this.db.prepare('INSERT INTO arena_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
 load(){
  const state={version:this.version,profiles:{},rooms:{},tournaments:{}};
  for(const row of this.db.prepare('SELECT kind,id,payload FROM arena_entities ORDER BY kind,id').all()){
   if(!kinds.includes(row.kind))throw new ArenaStorageError('Unknown durable Arena entity kind.',{code:'CORRUPT_STATE'});
   state[row.kind][row.id]=JSON.parse(row.payload);
  }
  return state;
 }
 changes(before,after){
  const out=[];
  for(const kind of kinds){const a=before[kind]||{},b=after[kind]||{},ids=new Set([...Object.keys(a),...Object.keys(b)]);for(const id of ids){
   if(!Object.hasOwn(b,id))out.push({kind,id,remove:true});
   else {const payload=encoded(b[id]);if(!Object.hasOwn(a,id)||encoded(a[id])!==payload)out.push({kind,id,payload,revision:Number.isInteger(b[id]?.revision)?b[id].revision:0});}
  }}
  return out;
 }
 commit(before,after){
  if(this.fenced)throw new ArenaStorageError('Storage is fenced after an unknown outcome. Reopen authoritative state.',{code:'OUTCOME_UNKNOWN_REOPEN_REQUIRED',outcomeUnknown:true});
  const changes=this.changes(before,after);if(!changes.length)return {generation:this.generation,entities:0,bytes:0};
  const started=performance.now(),bytes=changes.reduce((n,c)=>n+(c.payload?Buffer.byteLength(c.payload):0),0);
  try{
   if(this.fault?.beforeBegin)this.fault.beforeBegin();
   this.db.exec('BEGIN IMMEDIATE');
   const actual=Number(this.meta('generation')||0);
   if(actual!==this.generation)throw new ArenaStorageError('Arena state changed under a stale writer.',{code:'STALE_WRITER',status:409});
   const upsert=this.db.prepare('INSERT INTO arena_entities(kind,id,revision,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at');
   const remove=this.db.prepare('DELETE FROM arena_entities WHERE kind=? AND id=?');
   const now=this.clock();
   for(const [index,change] of changes.entries()){
    if(this.fault?.beforeEntity)this.fault.beforeEntity(change,index);
    if(change.remove)remove.run(change.kind,change.id);else upsert.run(change.kind,change.id,change.revision,change.payload,now);
   }
   const next=actual+1;this.setMeta('generation',next);
   if(this.fault?.beforeCommit)this.fault.beforeCommit(changes);
   this.db.exec('COMMIT');this.generation=next;
   if(this.fault?.afterCommit){try{this.fault.afterCommit(changes);}catch(error){this.fenced=true;throw new ArenaStorageError('The write may have committed; reopen before retrying.',{code:'OUTCOME_UNKNOWN_REOPEN_REQUIRED',outcomeUnknown:true});}}
   const elapsed=performance.now()-started;this.metrics.commits++;this.metrics.entityWrites+=changes.filter(c=>!c.remove).length;this.metrics.entityDeletes+=changes.filter(c=>c.remove).length;this.metrics.bytesWritten+=bytes;this.metrics.lastCommitMs=elapsed;this.metrics.maxEntitiesPerCommit=Math.max(this.metrics.maxEntitiesPerCommit,changes.length);
   return {generation:next,entities:changes.length,bytes,durationMs:elapsed};
  }catch(error){
   try{this.db.exec('ROLLBACK');}catch{}
   if(error instanceof ArenaStorageError)throw error;
   throw new ArenaStorageError('Arena durable write failed before acknowledgment.',{code:'STORAGE_UNAVAILABLE'});
  }
 }
 importLegacy(input,{requireEmpty=true}={}){
  const state=typeof input==='string'?JSON.parse(readFileSync(input,'utf8')):clone(input);
  if(!state||state.version!==this.version||!state.profiles||!state.rooms||!state.tournaments)throw new ArenaStorageError('Legacy snapshot is not the exact current Arena schema.',{code:'IMPORT_REJECTED',status:400});
  if(requireEmpty&&this.db.prepare('SELECT count(*) AS n FROM arena_entities').get().n)throw new ArenaStorageError('Target store is not empty.',{code:'IMPORT_TARGET_NOT_EMPTY',status:409});
  const empty={version:this.version,profiles:{},rooms:{},tournaments:{}};this.commit(empty,state);return state;
 }
 exportSnapshot(path){const snapshot=this.load();writeFileSync(path,encoded(snapshot),{mode:0o600});return snapshot;}
 stats(){const rows=this.db.prepare('SELECT kind,count(*) AS count,sum(length(payload)) AS bytes FROM arena_entities GROUP BY kind ORDER BY kind').all();return {generation:this.generation,fenced:this.fenced,rows,metrics:{...this.metrics}};}
 close(){this.db.close();}
}
