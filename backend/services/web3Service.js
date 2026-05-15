/**
 * Web3 Service — Server-side blockchain interaction via Alchemy
 *
 * This service uses ethers.js v6 to:
 *   1.  Read data directly from the SecureVote smart contract (view calls)
 *   2.  Write data (create elections, add candidates) using the deployer wallet
 *   3.  Verify that vote transaction hashes are genuine on-chain records
 *
 * The Express backend acts as the "admin signer" for admin-only contract
 * functions, while voters sign their own castVote() tx via MetaMask on the
 * frontend.
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load ABI ──────────────────────────────────────────────
let CONTRACT_ABI;
try {
  const abiPath = path.join(__dirname, '..', 'contracts', 'SecureVote.json');
  CONTRACT_ABI = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;
} catch (e) {
  console.warn('⚠️  SecureVote ABI not found — web3 features disabled. Run `cd contracts && npm run compile && npm run copy-abi`');
  CONTRACT_ABI = null;
}

// ── Config ────────────────────────────────────────────────
let RPC_URL = '';
let CONTRACT_ADDRESS = '';
let DEPLOYER_KEY = '';

let provider = null;
let adminWallet = null;
let readContract = null;   // read-only (provider)
let writeContract = null;  // admin signer (deployer wallet)
let lastInitError = null;
let lastInitConfig = {
  rpcUrlSet: false,
  contractAddressSet: false,
  abiLoaded: false,
};

function getMissingConfig() {
  const missing = [];
  if (!lastInitConfig.rpcUrlSet) missing.push('ALCHEMY_AMOY_RPC or SEPOLIA_RPC_URL');
  if (!lastInitConfig.contractAddressSet) missing.push('VOTING_CONTRACT_ADDRESS');
  if (!lastInitConfig.abiLoaded) missing.push('backend/contracts/SecureVote.json (ABI)');
  return missing;
}

/**
 * Initialize the Web3 provider and contract instances.
 * Called once on server startup.
 */
function initWeb3() {
  RPC_URL          = process.env.ALCHEMY_AMOY_RPC   || process.env.SEPOLIA_RPC_URL || '';
  CONTRACT_ADDRESS = process.env.VOTING_CONTRACT_ADDRESS || '';
  DEPLOYER_KEY     = process.env.DEPLOYER_PRIVATE_KEY   || '';

  lastInitConfig = {
    rpcUrlSet: !!RPC_URL,
    contractAddressSet: !!CONTRACT_ADDRESS,
    abiLoaded: !!CONTRACT_ABI,
  };
  lastInitError = null;

  if (!RPC_URL || !CONTRACT_ADDRESS || !CONTRACT_ABI) {
    const missing = getMissingConfig();
    lastInitError = missing.length
      ? `Web3 not configured: missing ${missing.join(', ')}`
      : 'Web3 not configured';
    console.warn(`⚠️  ${lastInitError} — blockchain features will use local chain only.`);
    return false;
  }

  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);

    // Read-only contract (no signer needed)
    readContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

    // Admin signer for write operations (create election, add candidate, finalize)
    if (DEPLOYER_KEY) {
      adminWallet = new ethers.Wallet(DEPLOYER_KEY, provider);
      writeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, adminWallet);

      console.log('🔗 Web3: Admin signer configured:', adminWallet.address);
    }

    console.log('🔗 Web3: Connected to', RPC_URL.replace(/\/v2\/.+/, '/v2/***'));
    console.log('🔗 Web3: Contract at', CONTRACT_ADDRESS);
    return true;
  } catch (err) {
    lastInitError = `Web3 init failed: ${err.message}`;
    console.error('❌', lastInitError);
    return false;
  }
}

// ───────────────────────────────────────────────────────────
//  READ functions (anyone can call — no gas)
// ───────────────────────────────────────────────────────────

/** Get total elections registered on-chain */
async function getElectionCount() {
  if (!readContract) return null;
  return Number(await readContract.getElectionCount());
}

/** Get total votes recorded on-chain */
async function getTotalVotes() {
  if (!readContract) return null;
  return Number(await readContract.getTotalVotes());
}

/** Get vote count for a specific candidate in an election */
async function getVoteCount(electionIndex, candidateIndex) {
  if (!readContract) return null;
  return Number(await readContract.getVoteCount(electionIndex, candidateIndex));
}

/** Get full election results from the smart contract */
async function getElectionResults(electionIndex) {
  if (!readContract) return null;
  const [names, counts] = await readContract.getElectionResults(electionIndex);
  return names.map((name, i) => ({ name, votes: Number(counts[i]) }));
}

/** Verify if a vote hash exists on-chain and return the record */
async function verifyVoteOnChain(voteHashHex) {
  if (!readContract) return null;
  try {
    // Convert hex string to bytes32
    const bytes32Hash = voteHashHex.startsWith('0x')
      ? voteHashHex.padEnd(66, '0').slice(0, 66)
      : ('0x' + voteHashHex).padEnd(66, '0').slice(0, 66);

    const [found, record] = await readContract.getVoteByHash(bytes32Hash);
    if (!found) return { found: false };
    return {
      found: true,
      voteHash: record.voteHash,
      electionIndex: Number(record.electionIndex),
      candidateIndex: Number(record.candidateIndex),
      timestamp: Number(record.timestamp),
      voter: record.voter,
    };
  } catch (err) {
    console.error('verifyVoteOnChain error:', err.message);
    return null;
  }
}

/** Check if a wallet has already voted in an election */
async function hasVotedOnChain(walletAddress, electionIndex) {
  if (!readContract) return null;
  return readContract.hasVoted(walletAddress, electionIndex);
}

/** Verify a transaction hash is valid and confirmed */
async function verifyTransaction(txHash) {
  if (!provider) return null;
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { confirmed: false, message: 'Transaction not found or pending' };

    return {
      confirmed: receipt.status === 1,
      blockNumber: receipt.blockNumber,
      from: receipt.from,
      to: receipt.to,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status === 1 ? 'success' : 'reverted',
    };
  } catch (err) {
    console.error('verifyTransaction error:', err.message);
    return null;
  }
}

// ───────────────────────────────────────────────────────────
//  WRITE functions (admin only — costs gas from deployer)
// ───────────────────────────────────────────────────────────

/** Create an election on-chain (called when admin creates election in MongoDB) */
async function createElectionOnChain(mongoId, title, startTime, endTime) {
  if (!writeContract) return null;
  try {
    const startUnix = Math.floor(new Date(startTime).getTime() / 1000);
    const endUnix   = Math.floor(new Date(endTime).getTime()   / 1000);

    const tx = await writeContract.createElection(mongoId, title, startUnix, endUnix);
    const receipt = await tx.wait();

    // Parse the ElectionCreated event to get the on-chain index
    const iface = writeContract.interface;
    let onChainIndex = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === 'ElectionCreated') {
          onChainIndex = Number(parsed.args.electionIndex);
          break;
        }
      } catch (_) { /* skip non-matching logs */ }
    }

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      onChainIndex,
    };
  } catch (err) {
    console.error('createElectionOnChain error:', err.message);
    return null;
  }
}

/** Add a candidate to an on-chain election */
async function addCandidateOnChain(electionIndex, candidateName) {
  if (!writeContract) return null;
  try {
    const tx = await writeContract.addCandidate(electionIndex, candidateName);
    const receipt = await tx.wait();

    const iface = writeContract.interface;
    let candidateIndex = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === 'CandidateAdded') {
          candidateIndex = Number(parsed.args.candidateIndex);
          break;
        }
      } catch (_) {}
    }

    return { txHash: receipt.hash, candidateIndex };
  } catch (err) {
    console.error('addCandidateOnChain error:', err.message);
    return null;
  }
}

/** Finalize an election on-chain (no more votes) */
async function finalizeElectionOnChain(electionIndex) {
  if (!writeContract) return null;
  try {
    const tx = await writeContract.finalizeElection(electionIndex);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('finalizeElectionOnChain error:', err.message);
    return null;
  }
}

// ───────────────────────────────────────────────────────────
//  Status helper
// ───────────────────────────────────────────────────────────

function isWeb3Ready() {
  return !!(provider && readContract);
}

function isWeb3WriteReady() {
  return !!(writeContract && adminWallet);
}

async function getWeb3Status() {
  if (!isWeb3Ready()) {
    const missing = getMissingConfig();
    const message = lastInitError || (missing.length
      ? `Web3 not configured: missing ${missing.join(', ')}`
      : 'Web3 not configured');
    return {
      connected: false,
      message,
      missing,
      configured: !missing.length,
      contractAddress: CONTRACT_ADDRESS || null,
    };
  }
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    return {
      connected: true,
      network: network.name,
      chainId: Number(network.chainId),
      blockNumber,
      contractAddress: CONTRACT_ADDRESS,
      adminWallet: adminWallet?.address || null,
      writeReady: isWeb3WriteReady(),
    };
  } catch (err) {
    return { connected: false, message: err.message };
  }
}

export {
  initWeb3,
  isWeb3Ready,
  isWeb3WriteReady,
  getWeb3Status,
  getElectionCount,
  getTotalVotes,
  getVoteCount,
  getElectionResults,
  verifyVoteOnChain,
  hasVotedOnChain,
  verifyTransaction,
  createElectionOnChain,
  addCandidateOnChain,
  finalizeElectionOnChain,
  provider,
  readContract,
  CONTRACT_ADDRESS,
};
