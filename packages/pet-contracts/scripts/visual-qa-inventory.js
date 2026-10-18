#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const lineages = ['emerald_sprout', 'sapphire_tide', 'amethyst_dream', 'rose_bloom', 'midnight_mint', 'solar_peach'];
const proofs = lineages.flatMap((lineageKey) => Array.from({ length: 10 }, (_, i) => {
  const evidencePath = `design-handoffs/AXO-PET-NFT-Sys-V5/00-PRODUCTION/qa/contact-sheets/${lineageKey}-levels-01-10.png`;
  const full = path.join(root, evidencePath);
  return { lineageKey, level: i + 1, evidencePath, sha256: fs.existsSync(full) ? crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex') : null, visualDecision: 'PENDING_HUMAN_REVIEW', reviewer: null };
}));
const output = { schema: 'AXO_PET_NFT_VISUAL_QA_INVENTORY_V1', evidenceScope: 'Six lineage contact sheets; each row points to the sheet containing that level. Inventory is not a visual pass.', proofs };
console.log(JSON.stringify(output, null, 2));
