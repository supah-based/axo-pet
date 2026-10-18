#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const handoff = path.join(root, 'design-handoffs/AXO-PET-NFT-Sys-V5');
const production = path.join(handoff, '00-PRODUCTION');
const manifestPath = path.join(production, 'manifests/v5-production-manifest.json');
const statePath = path.join(production, 'state/v5-production-state.json');
const canonical = path.join(root, 'public/hatchery-nft-v5.1.1/manifest.json');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const failures = [];
const files = new Map();
function add(relative, expectedHash = null, expectedBytes = null) {
  const normalized = path.normalize(relative);
  if (path.isAbsolute(normalized) || normalized.startsWith('..')) { failures.push(`unsafe_path:${relative}`); return; }
  const full = path.join(root, normalized);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) { failures.push(`missing:${relative}`); return; }
  const bytes = fs.readFileSync(full);
  const digest = sha(bytes);
  if (expectedHash && digest !== expectedHash) failures.push(`sha256_mismatch:${relative}`);
  if (expectedBytes != null && bytes.length !== expectedBytes) failures.push(`byte_count_mismatch:${relative}`);
  files.set(normalized, { path: normalized, bytes: bytes.length, sha256: digest });
}
function sourcePath(relative) {
  return relative.startsWith('design-handoffs/') ? relative : path.posix.join('design-handoffs/AXO-PET-NFT-Sys-V5', relative);
}
try {
  const m = json(manifestPath), s = json(statePath), c = json(canonical);
  if (m.jobs.length !== 73 || s.jobs.length !== 73) failures.push('expected_73_jobs');
  if (new Set(m.jobs.map((j) => j.id)).size !== m.jobs.length) failures.push('duplicate_job_id');
  const outputs = m.jobs.flatMap((j) => j.outputFiles.map((f) => ({ f, job: j.id })));
  if (outputs.length !== 193 || new Set(outputs.map((x) => x.f)).size !== outputs.length) failures.push('expected_193_unique_outputs');
  const states = new Map(s.jobs.map((j) => [j.id, j]));
  if (states.size !== s.jobs.length || m.jobs.some((j) => states.get(j.id)?.status !== 'COMPLETE')) failures.push('job_state_not_complete_or_reconciled');
  if (m.jobs.some((j) => !j.outputFiles.length || !j.promptFile)) failures.push('job_missing_prompt_or_outputs');
  for (const job of m.jobs) {
    add(sourcePath(job.promptFile));
    for (const f of [...(job.referenceFiles || []), ...(job.sourceFile ? [job.sourceFile] : []), ...job.outputFiles]) add(sourcePath(f));
  }
  if (c.lineages.length !== 6 || c.stages.length !== 10 || c.bases.length !== 60 || c.layers.length !== 12 || c.counts.layerOptions !== 120) failures.push('canonical_v511_manifest_shape');
  const visual = [...c.bases, ...c.layers.flatMap((l) => l.options), ...c.hudByLineage, ...c.showcases, ...c.sheets];
  for (const a of visual) add(path.posix.join('public', a.url), a.runtimeSha256, a.bytes);
  add('public/hatchery-nft-v5.1.1/manifest.json');
  const ordered = [...files.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const archiveIndex = ordered.map((x) => `${x.sha256}  ${x.bytes}  ${x.path}`).join('\n') + '\n';
  const report = { schema: 'AXO_PET_NFT_OFFLINE_READINESS_V1', status: failures.length ? 'BLOCKED' : 'LOCAL_BYTES_VERIFIED_EXTERNAL_GATES_PENDING', broadcastAuthorized: false, source: { jobs: m.jobs.length, declaredOutputs: outputs.length, stateComplete: [...states.values()].filter((j) => j.status === 'COMPLETE').length }, canonicalVisual: { revision: c.visualRevision, lineages: c.lineages.length, levels: c.stages.length, runtimeImages: visual.length }, verifiedFiles: ordered.length, archiveIndexSha256: sha(archiveIndex), failures };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (e) { console.log(JSON.stringify({ schema: 'AXO_PET_NFT_OFFLINE_READINESS_V1', status: 'BLOCKED', broadcastAuthorized: false, failures: [`${e.code || 'error'}:${e.message}`] }, null, 2)); process.exitCode = 1; }
