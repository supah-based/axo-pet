import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('monorepo exposes one workspace for every declared AXO Pet system boundary', () => {
  const pkg = readJson('package.json');
  assert.deepEqual(pkg.workspaces, ['apps/*', 'packages/*']);
  for (const relative of [
    'apps/hatchery-web/package.json', 'apps/arena-web/package.json', 'apps/pet-api/package.json',
    'packages/pet-domain/package.json', 'packages/pet-contracts/package.json',
    'packages/gear-catalog/package.json', 'packages/visual-engine/package.json',
    'packages/arena-engine/package.json', 'packages/shared-schemas/package.json',
  ]) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
});

test('canonical catalogs preserve eight slots, 56 launch items and the 5.1.1 visual universe', () => {
  const traits = readJson('packages/gear-catalog/catalogs/trait-catalog-v4.3.json');
  const visual = readJson('packages/gear-catalog/catalogs/website-visual-catalog-v5.json');
  assert.deepEqual(traits.gearSlots.map(({ key }) => key), ['head', 'face', 'body', 'back', 'tool', 'charm', 'companion', 'habitat']);
  assert.equal(traits.launchGear.length, 56);
  assert.equal(visual.visualRevision, '5.1.1');
  assert.equal(visual.counts.bases, 60);
  assert.equal(visual.counts.layerOptions, 120);
  assert.equal(visual.counts.runtimeImages, 204);
});

test('repository safety and build-agent handoff keep production actions outside ordinary CI', () => {
  const security = fs.readFileSync(path.join(root, 'SECURITY.md'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'docs/MIGRATION_PLAN.md'), 'utf8');
  const handoff = fs.readFileSync(path.join(root, 'HANDOFF.md'), 'utf8');
  assert.match(security, /must never contain/i);
  assert.match(security, /deployment, minting, gear issuance/i);
  assert.match(migration, /existing AXO state repository authoritative/i);
  assert.match(migration, /separate explicit authorization/i);
  assert.match(handoff, /Source-of-truth order/);
  assert.match(handoff, /Current extraction gaps/);
  assert.match(handoff, /Production handover gates/);
  assert.match(handoff, /Branch-protection limitation/);
});
