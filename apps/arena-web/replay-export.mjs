import {createHash} from 'node:crypto';
import {VERSION} from './catalog.mjs';
import {REPLAY_SCHEMA,GEAR_REPLAY_SCHEMA,canonical,unsigned,replayFrames} from './replay.mjs';
export const fingerprint=doc=>createHash('sha256').update(canonical(unsigned(doc))).digest('hex');
export function exportReplay(r){const withGear=r.players.some(p=>Object.values(p.build.gearStats||{}).some(n=>n>0));const doc={schema:withGear?GEAR_REPLAY_SCHEMA:REPLAY_SCHEMA,ruleset:r.battle.version||VERSION,kind:r.tournament?'tournament':r.players.some(p=>p.bot)?'practice':'casual',startedAt:r.startedAt??r.createdAt,finishedAt:r.finishedAt,builds:r.players.map(({build:b})=>({lineageId:b.lineageId,xp:b.xp,allocation:b.allocation,ranks:b.ranks,loadout:b.loadout,...(withGear?{gearStats:structuredClone(b.gearStats)}:{})})),exchanges:structuredClone(r.battle.log),outcome:{status:r.status,winner:r.battle.winner,reason:r.battle.reason,hp:r.battle.fighters.map(f=>f.hp)}};doc.fingerprint=fingerprint(doc);verifyReplay(doc);return doc;}
export function verifyReplay(doc){const result=replayFrames(doc);if(fingerprint(doc)!==doc.fingerprint)throw Error('Replay fingerprint mismatch');return result;}
