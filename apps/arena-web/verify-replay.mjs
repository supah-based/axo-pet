import {readFileSync} from 'node:fs';
import {verifyReplay} from './replay-export.mjs';
try{const text=readFileSync(process.argv[2],'utf8');if(text.length>131072)throw Error('Replay exceeds 128 KiB');const result=verifyReplay(JSON.parse(text));console.log(JSON.stringify({consistent:true,exchanges:result.frames.length-1,administrativeFinish:result.administrativeFinish,notice:result.notice},null,2));}catch(e){console.error('Replay rejected: '+e.message);process.exitCode=1;}
