import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';

/**
 * Hardhat Configuration
 *
 * Networks:
 *   • hardhat  — in-process chain (for tests, vanishes when process exits)
 *   • localhost — persistent local node started via `npx hardhat node`
 *                 MetaMask connects here at http://127.0.0.1:8545  (chainId 31337)
 *   • amoy     — Polygon Amoy Testnet (production-like)
 *
 * Local dev workflow:
 *   Terminal 1:  cd contracts && npx hardhat node
 *   Terminal 2:  cd contracts && npm run deploy:local
 *   MetaMask:    Add network → RPC http://127.0.0.1:8545, Chain ID 31337
 */

/** @type import('hardhat/config').HardhatUserConfig */
const config = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
    },
  },
  networks: {
    // In-process chain (for `npx hardhat test` — ephemeral)
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,        // mine a block for every tx instantly
        interval: 0,
      },
      accounts: {
        count: 20,          // 20 pre-funded accounts
        accountsBalance: '10000000000000000000000', // 10,000 ETH each
      },
    },

    // Persistent local node (for `npx hardhat node` + deploy + MetaMask)
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
      // When connecting to `npx hardhat node`, it uses the same 20 accounts
      // No need to specify accounts — Hardhat node exposes them automatically
    },

    // Polygon Amoy Testnet (remote)
    amoy: {
      url: process.env.ALCHEMY_AMOY_RPC || 'https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 80002,
    },
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
