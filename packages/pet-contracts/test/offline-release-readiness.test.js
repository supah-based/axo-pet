import { expect } from 'chai';
import { execFileSync } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
const dir = path.dirname(fileURLToPath(import.meta.url));
const run = (script, args = []) => {
  const result = spawnSync(process.execPath, [path.join(dir, '../scripts', script), ...args], { encoding: 'utf8' });
  return JSON.parse(result.stdout);
};
describe('NFT offline release readiness', function () {
  it('reconciles current V5 jobs and bytes deterministically without broadcast', function () {
    const a = run('offline-release-readiness.js'), b = run('offline-release-readiness.js');
    expect(a.source).to.deep.equal({ jobs: 73, declaredOutputs: 193, stateComplete: 73 });
    expect(a.verifiedFiles).to.be.greaterThan(193);
    expect(a.archiveIndexSha256).to.equal(b.archiveIndexSha256);
    expect(a.broadcastAuthorized).to.equal(false);
    expect(a.failures).to.deep.equal([]);
  });
  it('keeps approval and two distinct pin readbacks as independent fail-closed gates', function () {
    const r = run('release-gates.js');
    expect(r.status).to.equal('BLOCKED');
    expect(r.gates.operatorApproval.satisfied).to.equal(false);
    expect(r.gates.independentPinReadbacks.satisfied).to.equal(false);
    expect(r.broadcastAuthorized).to.equal(false);
  });
  it('emits a complete but explicitly unreviewed six-lineage / ten-level inventory', function () {
    const inventory = run('visual-qa-inventory.js');
    expect(inventory.proofs).to.have.length(60);
    expect(new Set(inventory.proofs.map((x) => `${x.lineageKey}:${x.level}`)).size).to.equal(60);
    expect(inventory.proofs.every((x) => x.visualDecision === 'PENDING_HUMAN_REVIEW' && x.sha256)).to.equal(true);
  });
  it('does not accept asserted QA hashes and pin receipts without matching local bytes', function () {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'axo-nft-gates-'));
    try {
      const qa = run('visual-qa-inventory.js');
      for (const proof of qa.proofs) { proof.visualDecision = 'PASS'; proof.reviewer = 'synthetic-reviewer'; proof.sha256 = 'a'.repeat(64); }
      const approval = { decision: 'APPROVED', scope: 'AXO_PET_NFT_RELEASE', operator: 'synthetic', approvedAt: '2026-09-23T00:00:00Z' };
      const pins = { archiveSha256: 'a'.repeat(64), readbacks: ['provider-one', 'provider-two'].map((provider) => ({ provider, cid: 'bafyfake', verified: true, archiveSha256: 'a'.repeat(64), readbackSha256: 'a'.repeat(64), localReadbackPath: 'public/not-a-real-archive.car' })) };
      for (const [name, value] of Object.entries({ qa, approval, pins })) fs.writeFileSync(path.join(temp, `${name}.json`), JSON.stringify(value));
      const result = run('release-gates.js', ['--qa-proof', path.join(temp, 'qa.json'), '--operator-approval', path.join(temp, 'approval.json'), '--pin-readbacks', path.join(temp, 'pins.json')]);
      expect(result.status).to.equal('BLOCKED');
      expect(result.gates.visualQaProofInventory.satisfied).to.equal(false);
      expect(result.gates.independentPinReadbacks.satisfied).to.equal(false);
      expect(result.broadcastAuthorized).to.equal(false);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
});
