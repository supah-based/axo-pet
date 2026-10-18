import { defineConfig } from 'hardhat/config';
import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import hardhatEthersChaiMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers';
import hardhatMocha from '@nomicfoundation/hardhat-mocha';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';

export default defineConfig({
  plugins: [
    hardhatEthers,
    hardhatEthersChaiMatchers,
    hardhatMocha,
    hardhatNetworkHelpers,
  ],
  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
      evmVersion: 'cancun',
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
});
