import { expect } from 'chai';
import { readFile } from 'node:fs/promises';
import { validateDeploymentConfig } from '../scripts/deployment-config.js';

describe('AXO Pet NFT deployment config', function () {
  it('keeps the checked-in placeholder example invalid and deployment blocked', async function () {
    const config = JSON.parse(await readFile(new URL('../deployment-config.example.json', import.meta.url), 'utf8'));
    const result = validateDeploymentConfig(config);
    expect(result.ok).to.equal(false);
    expect(result.deploymentReady).to.equal(false);
    expect(result.errors.join(' ')).to.include('placeholder');
    expect(result.errors.join(' ')).to.include('pinningReceipt');
    expect(result.errors.join(' ')).not.to.include('catalogId mismatch');
    expect(result.errors.join(' ')).not.to.include('visualRevision mismatch');
    expect(result.requiredGateNames.filter((gate) => config.reviewGates[gate] !== true)).to.have.length.greaterThan(0);
  });

  it('rejects any deployment review that points away from the V4.3 alpha-repair catalog', async function () {
    const config = JSON.parse(await readFile(new URL('../deployment-config.example.json', import.meta.url), 'utf8'));
    config.metadata.catalogId = 'AXO_PET_NFT_TRAITS_V4_2';
    config.metadata.visualRevision = '4.2.1';
    const result = validateDeploymentConfig(config);
    expect(result.ok).to.equal(false);
    expect(result.errors).to.include('catalogId mismatch');
    expect(result.errors).to.include('visualRevision mismatch');
  });

  it('rejects broadcast mode, wrong chain, malformed identity and non-IPFS metadata', async function () {
    const config = JSON.parse(await readFile(new URL('../deployment-config.example.json', import.meta.url), 'utf8'));
    config.broadcastEnabled = true;
    config.network.chainId = 1;
    config.controller.address = 'not-an-address';
    config.metadata.gearContractUri = 'https://axo.vision/gear.json';
    const result = validateDeploymentConfig(config);
    expect(result.ok).to.equal(false);
    expect(result.errors.join(' ')).to.include('broadcastEnabled');
    expect(result.errors.join(' ')).to.include('chainId');
    expect(result.errors.join(' ')).to.include('controller.address');
    expect(result.errors.join(' ')).to.include('gearContractUri');
  });
});
