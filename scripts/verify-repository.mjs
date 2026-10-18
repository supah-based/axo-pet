import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];
const required = [
  'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODEOWNERS',
  'apps/hatchery-web', 'apps/arena-web', 'apps/pet-api',
  'packages/pet-domain', 'packages/pet-contracts', 'packages/gear-catalog',
  'packages/visual-engine', 'packages/arena-engine', 'packages/shared-schemas',
  'packages/pet-contracts/contracts/AxoSoulPet.sol',
  'packages/pet-contracts/contracts/AxoPetGear.sol',
  'packages/pet-contracts/contracts/AxoPetGearMarketplace.sol',
  'packages/gear-catalog/catalogs/trait-catalog-v4.3.json',
  'packages/gear-catalog/catalogs/website-visual-catalog-v5.json',
  'docs/MIGRATION_PLAN.md', '.github/workflows/ci.yml',
];
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`missing:${relative}`);
}

const ignored = new Set(['.git', 'node_modules', 'artifacts', 'cache', 'coverage', 'dist']);
const forbiddenName = /^(?:\.env(?:\..+)?|.*\.(?:sqlite|db|pem|key|p12|keystore)|deployment-config\.json)$/i;
const forbiddenContent = [
  ['/root', '.openclaw'].join('/'),
  ['/usr/lib/node_modules', 'openclaw'].join('/'),
  ['BEGIN', 'PRIVATE', 'KEY'].join(' '),
  ['BEGIN', 'OPENSSH', 'PRIVATE', 'KEY'].join(' '),
];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name === 'state') failures.push(`forbidden_runtime_directory:${relative}`);
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (forbiddenName.test(entry.name) && entry.name !== '.env.example') failures.push(`forbidden_file:${relative}`);
    const stat = fs.statSync(full);
    if (stat.size > 50 * 1024 * 1024) failures.push(`oversized_file:${relative}:${stat.size}`);
    if (stat.size <= 2 * 1024 * 1024 && /\.(?:js|mjs|cjs|json|md|yml|yaml|sol|html|css|txt)$/i.test(entry.name)) {
      const text = fs.readFileSync(full, 'utf8');
      for (const marker of forbiddenContent) if (text.includes(marker)) failures.push(`private_path_or_secret_marker:${relative}:${marker}`);
    }
  }
}
walk(root);

const trait = JSON.parse(fs.readFileSync(path.join(root, 'packages/gear-catalog/catalogs/trait-catalog-v4.3.json'), 'utf8'));
const visual = JSON.parse(fs.readFileSync(path.join(root, 'packages/gear-catalog/catalogs/website-visual-catalog-v5.json'), 'utf8'));
const expectedSlots = ['head', 'face', 'body', 'back', 'tool', 'charm', 'companion', 'habitat'];
const actualSlots = trait.gearSlots.map((slot) => slot.key);
if (actualSlots.join(',') !== expectedSlots.join(',')) failures.push(`gear_slots:${actualSlots.join(',')}`);
if (trait.visualRevision !== '4.3.0' || trait.launchGear.length !== 56) failures.push('v43_catalog_shape');
if (visual.visualRevision !== '5.1.1' || visual.counts?.bases !== 60 || visual.counts?.layerOptions !== 120 || visual.counts?.runtimeImages !== 204) failures.push('v511_catalog_shape');

const gear = fs.readFileSync(path.join(root, 'packages/pet-contracts/contracts/AxoPetGear.sol'), 'utf8');
if (!gear.includes('MIN_EQUIP_LEVEL = 10') || !gear.includes('ARENA_STAT_COUNT = 6')) failures.push('gear_contract_level_or_stats');

const report = {
  schema: 'AXO_PET_REPOSITORY_VERIFICATION_V1',
  status: failures.length ? 'BLOCKED' : 'PASS',
  requiredPaths: required.length,
  gearSlots: actualSlots,
  launchGear: trait.launchGear.length,
  visualRevision: visual.visualRevision,
  failures,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
