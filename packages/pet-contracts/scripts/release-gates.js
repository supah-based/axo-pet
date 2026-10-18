#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function localHash(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
  const full = path.resolve(root, relative);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    if (!fs.realpathSync(full).startsWith(root + path.sep) || !fs.statSync(full).isFile()) return null;
    return sha(fs.readFileSync(full));
  } catch { return null; }
}
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const result = { schema: 'AXO_PET_NFT_RELEASE_GATES_V1', status: 'BLOCKED', broadcastAuthorized: false, gates: {}, missing: [] };
const qa = read(value('--qa-proof'));
const approval = read(value('--operator-approval'));
const pins = read(value('--pin-readbacks'));
const qaRows = Array.isArray(qa?.proofs) ? qa.proofs : [];
const lineages = ['emerald_sprout', 'sapphire_tide', 'amethyst_dream', 'rose_bloom', 'midnight_mint', 'solar_peach'];
const expectedPairs = new Set(lineages.flatMap((lineageKey) => Array.from({ length: 10 }, (_, i) => `${lineageKey}:${i + 1}`)));
const levelsOK = qaRows.length === 60 && new Set(qaRows.map((x) => `${x.lineageKey}:${x.level}`)).size === 60 && qaRows.every((x) => expectedPairs.has(`${x.lineageKey}:${x.level}`) && x.evidencePath === `design-handoffs/AXO-PET-NFT-Sys-V5/00-PRODUCTION/qa/contact-sheets/${x.lineageKey}-levels-01-10.png` && /^[a-f0-9]{64}$/i.test(x.sha256 || '') && localHash(x.evidencePath) === x.sha256 && x.visualDecision === 'PASS' && typeof x.reviewer === 'string' && x.reviewer.trim().length > 0) && qaRows.every((x) => expectedPairs.delete(`${x.lineageKey}:${x.level}`)) && expectedPairs.size === 0;
result.gates.visualQaProofInventory = { satisfied: levelsOK, required: '60 distinct (six lineages × levels 1–10), each with local evidence path and SHA-256', supplied: qaRows.length };
if (!levelsOK) result.missing.push('complete visual QA proof inventory');
const approvalOK = approval?.decision === 'APPROVED' && approval?.scope === 'AXO_PET_NFT_RELEASE' && typeof approval?.operator === 'string' && approval.operator.trim().length > 0 && typeof approval?.approvedAt === 'string' && !Number.isNaN(Date.parse(approval.approvedAt));
result.gates.operatorApproval = { satisfied: approvalOK, sourceProvided: Boolean(value('--operator-approval')) };
if (!approvalOK) result.missing.push('separate signed/recorded operator approval');
const rows = Array.isArray(pins?.readbacks) ? pins.readbacks : [];
const validPin = (x) => typeof x.provider === 'string' && x.provider.trim() && typeof x.cid === 'string' && x.cid.startsWith('bafy') && x.verified === true && typeof x.readbackSha256 === 'string' && /^[a-f0-9]{64}$/i.test(x.readbackSha256) && x.readbackSha256 === pins.archiveSha256 && x.archiveSha256 === pins.archiveSha256 && typeof x.localReadbackPath === 'string' && localHash(x.localReadbackPath) === pins.archiveSha256;
const pinOK = rows.length === 2 && rows.every(validPin) && rows[0].provider !== rows[1].provider && rows[0].cid === rows[1].cid;
result.gates.independentPinReadbacks = { satisfied: pinOK, required: 'two distinct providers, same CID, byte-exact local readback files under project root; provider independence needs external operator review', supplied: rows.length };
if (!pinOK) result.missing.push('two independent pin + byte-exact readback receipts');
result.gates.broadcastAndActivation = { satisfied: false, status: 'OUT_OF_SCOPE_NEVER_AUTHORIZED_BY_THIS_CHECK' };
result.status = result.missing.length ? 'BLOCKED' : 'EVIDENCE_PRESENT_REQUIRES_INDEPENDENT_OPERATOR_REVIEW_NOT_BROADCAST';
console.log(JSON.stringify(result, null, 2));
if (result.missing.length) process.exitCode = 1;
