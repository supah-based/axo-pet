import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifacts } from 'hardhat';
import { AbiCoder, concat, getAddress, getCreateAddress, keccak256, toUtf8Bytes } from 'ethers';
import { validateDeploymentConfig } from './deployment-config.js';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const configPath = resolve(argument('--config', 'deployment-config.json'));
let config;
try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({ status: 'BLOCKED', configPath, errors: [error.message] }, null, 2));
  process.exitCode = 1;
  process.exit();
}
const validation = validateDeploymentConfig(config);
if (!validation.ok) {
  console.error(JSON.stringify({ status: 'BLOCKED', configPath, ...validation }, null, 2));
  process.exitCode = 1;
  process.exit();
}

const [petArtifact, gearArtifact] = await Promise.all([
  artifacts.readArtifact('AxoSoulPet'),
  artifacts.readArtifact('AxoPetGear'),
]);
const deployer = getAddress(config.deployer.address);
const controller = getAddress(config.controller.address);
const signer = getAddress(config.stateSigner.address);
const nonce = Number(config.deployer.nonce);
const predictedPet = getCreateAddress({ from: deployer, nonce });
const predictedGear = getCreateAddress({ from: deployer, nonce: nonce + 1 });
const petArguments = [controller, signer];
const gearArguments = [controller, predictedPet, config.metadata.gearContractUri];
const petData = concat([petArtifact.bytecode, AbiCoder.defaultAbiCoder().encode(['address', 'address'], petArguments)]);
const gearData = concat([gearArtifact.bytecode, AbiCoder.defaultAbiCoder().encode(['address', 'address', 'string'], gearArguments)]);
const contractPlan = (name, artifact, args, data, predicted) => {
  const runtimeBytes = (artifact.deployedBytecode.length - 2) / 2;
  if (runtimeBytes > 24_576) throw new Error(`${name}: EIP-170 runtime limit exceeded`);
  return {
    name,
    predictedAddress: predicted,
    constructorArguments: args,
    creationBytecodeHash: keccak256(artifact.bytecode),
    deploymentDataHash: keccak256(data),
    runtimeTemplateBytecodeHash: keccak256(artifact.deployedBytecode),
    runtimeBytes,
    eip170Limit: 24_576,
  };
};

console.log(JSON.stringify({
  schema: 'AXO_PET_NFT_UNSIGNED_DEPLOYMENT_PLAN_V1',
  status: validation.deploymentReady ? 'READY_FOR_DEPLOYMENT_REVIEW_NOT_BROADCAST' : 'REVIEW_GATES_INCOMPLETE_NOT_BROADCAST',
  broadcastAuthorized: false,
  deploymentReady: validation.deploymentReady,
  configPath,
  configHash: keccak256(toUtf8Bytes(JSON.stringify(config))),
  chainId: 4663,
  deployer,
  deployerNonce: nonce,
  controller,
  stateSigner: signer,
  contracts: [
    contractPlan('AxoSoulPet', petArtifact, petArguments, petData, predictedPet),
    contractPlan('AxoPetGear', gearArtifact, gearArguments, gearData, predictedGear),
  ],
  activation: {
    mintingInitiallyActive: false,
    gearInitiallyDefined: 0,
    gearInitiallyMinted: 0,
    postDeploymentTransactions: [
      { contract: predictedPet, call: 'setGearContract(address)', args: [predictedGear] },
      { contract: predictedPet, call: 'setMintingActive(true)', args: [], separatelyGated: true },
    ],
  },
  incompleteGates: validation.requiredGateNames.filter((gate) => config.reviewGates[gate] !== true),
}, null, 2));
