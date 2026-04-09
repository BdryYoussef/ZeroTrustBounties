// hardhat.config.cjs — ZTB V4.3 Local Demo
// CommonJS format — compatible with the root package.json's "type":"module" via .cjs extension
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris",
    },
  },
  networks: {
    // Local Anvil node
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      // Anvil default funded accounts — private keys for the first 3
      accounts: [
        // Anvil account 0 (deployer/sponsor)
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        // Anvil account 1 (hunter)
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        // Anvil account 2
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
      ],
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
  // Silence typechain if not needed for demo
  typechain: {
    outDir:  "typechain-types",
    target:  "ethers-v6",
  },
};
