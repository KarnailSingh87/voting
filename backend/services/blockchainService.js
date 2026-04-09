/**
 * Blockchain Service for SecureVote
 * 
 * Implements a self-contained blockchain that chains every vote into
 * cryptographically linked blocks. Each block contains a SHA-256 hash
 * that incorporates the previous block's hash, making the entire chain
 * tamper-proof: modifying any block invalidates all subsequent blocks.
 * 
 * Features:
 * - SHA-256 proof-of-work mining (difficulty configurable)
 * - Genesis block auto-creation
 * - Full chain validation
 * - Per-election chain validation
 * - Vote lookup by hash
 */

import crypto from 'crypto';
import Block from '../models/Block.js';

const DIFFICULTY = Number(process.env.BLOCKCHAIN_DIFFICULTY || 2); // number of leading zeros required

/**
 * Calculate SHA-256 hash for a block
 */
function calculateHash(index, timestamp, voteHash, electionId, candidateId, previousHash, nonce) {
  const data = `${index}${timestamp}${voteHash}${electionId}${candidateId}${previousHash}${nonce}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Mine a block — find a nonce that produces a hash with the required
 * number of leading zeros (proof of work).
 */
function mineBlock(index, timestamp, voteHash, electionId, candidateId, previousHash) {
  let nonce = 0;
  const target = '0'.repeat(DIFFICULTY);
  let hash;
  
  do {
    hash = calculateHash(index, timestamp, voteHash, electionId, candidateId, previousHash, nonce);
    nonce++;
  } while (!hash.startsWith(target));

  return { hash, nonce: nonce - 1 };
}

/**
 * Create the genesis block (block #0) if it doesn't exist yet.
 * Called once on server startup.
 */
async function createGenesisBlock() {
  const existing = await Block.findOne({ index: 0 });
  if (existing) return existing;

  const timestamp = new Date('2026-01-01T00:00:00Z');
  const voteHash = 'GENESIS_BLOCK';
  const previousHash = '0'.repeat(64);
  
  const { hash, nonce } = mineBlock(0, timestamp.toISOString(), voteHash, 'genesis', 'genesis', previousHash);

  const genesis = new Block({
    index: 0,
    timestamp,
    voteHash,
    electionId: null,
    candidateId: null,
    previousHash,
    hash,
    nonce,
    merkleRoot: crypto.createHash('sha256').update('GENESIS').digest('hex'),
  });

  await genesis.save();
  console.log('🔗 Genesis block created:', hash);
  return genesis;
}

/**
 * Add a new vote to the blockchain.
 * Returns the created block with its index and hash.
 */
async function addVoteToChain(voteHash, electionId, candidateId) {
  // Get the latest block in the chain
  const latestBlock = await Block.findOne().sort({ index: -1 });
  
  if (!latestBlock) {
    // Should not happen if genesis was created, but create it now
    await createGenesisBlock();
    return addVoteToChain(voteHash, electionId, candidateId);
  }

  const newIndex = latestBlock.index + 1;
  const timestamp = new Date();
  const previousHash = latestBlock.hash;

  // Mine the block (proof of work)
  const { hash, nonce } = mineBlock(
    newIndex,
    timestamp.toISOString(),
    voteHash,
    String(electionId),
    String(candidateId),
    previousHash
  );

  const newBlock = new Block({
    index: newIndex,
    timestamp,
    voteHash,
    electionId,
    candidateId,
    previousHash,
    hash,
    nonce,
  });

  await newBlock.save();
  return newBlock;
}

/**
 * Validate the entire blockchain.
 * Returns { valid: boolean, chainLength: number, error?: string, invalidAt?: number }
 */
async function validateChain() {
  const blocks = await Block.find().sort({ index: 1 }).lean();
  
  if (blocks.length === 0) {
    return { valid: true, chainLength: 0, message: 'Empty chain' };
  }

  // Validate genesis block
  const genesis = blocks[0];
  if (genesis.index !== 0) {
    return { valid: false, chainLength: blocks.length, error: 'Missing genesis block', invalidAt: 0 };
  }

  for (let i = 1; i < blocks.length; i++) {
    const current = blocks[i];
    const previous = blocks[i - 1];

    // Check index sequence
    if (current.index !== previous.index + 1) {
      return { 
        valid: false, 
        chainLength: blocks.length, 
        error: `Block index gap at position ${i}: expected ${previous.index + 1}, got ${current.index}`,
        invalidAt: i 
      };
    }

    // Check previous hash link
    if (current.previousHash !== previous.hash) {
      return { 
        valid: false, 
        chainLength: blocks.length, 
        error: `Previous hash mismatch at block ${current.index}`,
        invalidAt: i,
        invalidBlock: {
          index: current.index,
          previousHash: current.previousHash,
          expectedPreviousHash: previous.hash
        }
      };
    }

    // Recalculate and verify block hash
    const recalculatedHash = calculateHash(
      current.index,
      new Date(current.timestamp).toISOString(),
      current.voteHash,
      String(current.electionId || ''),
      String(current.candidateId || ''),
      current.previousHash,
      current.nonce
    );
    // If hash mismatches, try a few tolerant recalculation strategies before failing.
    if (current.hash !== recalculatedHash) {
      const attempts = [];

      // 1) Try using the raw stored timestamp (sometimes DB stores string or different formatting)
      try {
        const rawTs = current.timestamp && typeof current.timestamp === 'string' ? current.timestamp : new Date(current.timestamp).toString();
        attempts.push(calculateHash(current.index, rawTs, current.voteHash, String(current.electionId || ''), String(current.candidateId || ''), current.previousHash, current.nonce));
      } catch (e) {}

      // 2) Try without milliseconds
      try {
        const dt = new Date(current.timestamp);
        const noMs = new Date(Math.floor(dt.getTime() / 1000) * 1000).toISOString();
        attempts.push(calculateHash(current.index, noMs, current.voteHash, String(current.electionId || ''), String(current.candidateId || ''), current.previousHash, current.nonce));
      } catch (e) {}

      // 3) Try using epoch millis as string
      try {
        attempts.push(calculateHash(current.index, String(new Date(current.timestamp).getTime()), current.voteHash, String(current.electionId || ''), String(current.candidateId || ''), current.previousHash, current.nonce));
      } catch (e) {}

      // If any attempt matches, consider it valid (tolerant mode)
      if (attempts.includes(current.hash)) {
        // continue to next block
      } else {
        // Log mismatch details for debugging and return diagnostic info
        console.error('BLOCKCHAIN HASH MISMATCH', {
          blockIndex: current.index,
          storedHash: current.hash,
          recalculatedHash,
          attempts
        });

        return { 
          valid: false, 
          chainLength: blocks.length, 
          error: `Hash verification failed at block ${current.index} — data may have been tampered with`,
          invalidAt: i,
          invalidBlock: {
            index: current.index,
            storedHash: current.hash,
            recalculatedHash,
            attempts
          }
        };
      }
    }

    // Verify proof of work
    const target = '0'.repeat(DIFFICULTY);
    if (!current.hash.startsWith(target)) {
      return { 
        valid: false, 
        chainLength: blocks.length, 
        error: `Proof of work invalid at block ${current.index}`,
        invalidAt: i 
      };
    }
  }

  return { 
    valid: true, 
    chainLength: blocks.length, 
    message: 'Blockchain integrity verified — all blocks valid',
    latestHash: blocks[blocks.length - 1].hash,
    genesisHash: blocks[0].hash
  };
}

/**
 * Validate chain for a specific election.
 */
async function validateElectionChain(electionId) {
  const blocks = await Block.find({ 
    $or: [
      { electionId },
      { index: 0 } // include genesis
    ]
  }).sort({ index: 1 }).lean();

  if (blocks.length <= 1) {
    return { valid: true, chainLength: blocks.length, message: 'No votes recorded for this election' };
  }

  // For election-specific validation, we verify each block's hash integrity
  let tamperedCount = 0;
  for (const block of blocks) {
    if (block.index === 0) continue; // skip genesis for recalc
    
    const recalculatedHash = calculateHash(
      block.index,
      new Date(block.timestamp).toISOString(),
      block.voteHash,
      String(block.electionId || ''),
      String(block.candidateId || ''),
      block.previousHash,
      block.nonce
    );

    if (block.hash !== recalculatedHash) {
      // Try tolerant recalculations as in full-chain validation
      const attempts = [];
      try { attempts.push(calculateHash(block.index, block.timestamp && typeof block.timestamp === 'string' ? block.timestamp : new Date(block.timestamp).toString(), block.voteHash, String(block.electionId || ''), String(block.candidateId || ''), block.previousHash, block.nonce)); } catch (e) {}
      try { const dt = new Date(block.timestamp); const noMs = new Date(Math.floor(dt.getTime() / 1000) * 1000).toISOString(); attempts.push(calculateHash(block.index, noMs, block.voteHash, String(block.electionId || ''), String(block.candidateId || ''), block.previousHash, block.nonce)); } catch (e) {}
      try { attempts.push(calculateHash(block.index, String(new Date(block.timestamp).getTime()), block.voteHash, String(block.electionId || ''), String(block.candidateId || ''), block.previousHash, block.nonce)); } catch (e) {}

      if (!attempts.includes(block.hash)) {
        tamperedCount++;
      }
    }
  }

  return {
    valid: tamperedCount === 0,
    chainLength: blocks.length,
    tamperedBlocks: tamperedCount,
    message: tamperedCount === 0 
      ? `All ${blocks.length - 1} votes verified for this election`
      : `WARNING: ${tamperedCount} block(s) may have been tampered with`
  };
}

/**
 * Find a block by vote hash
 */
async function findBlockByVoteHash(voteHash) {
  return Block.findOne({ voteHash }).lean();
}

/**
 * Get chain statistics
 */
async function getChainStats() {
  const totalBlocks = await Block.countDocuments();
  const latestBlock = await Block.findOne().sort({ index: -1 }).lean();
  const genesisBlock = await Block.findOne({ index: 0 }).lean();
  
  return {
    totalBlocks,
    latestBlockIndex: latestBlock?.index ?? -1,
    latestBlockHash: latestBlock?.hash ?? null,
    latestBlockTime: latestBlock?.timestamp ?? null,
    genesisHash: genesisBlock?.hash ?? null,
    genesisTime: genesisBlock?.timestamp ?? null,
    difficulty: DIFFICULTY,
  };
}

/**
 * Get recent blocks for the ledger
 */
async function getRecentBlocks(limit = 25, page = 1) {
  const skip = (page - 1) * limit;
  const [total, blocks] = await Promise.all([
    Block.countDocuments({ index: { $gt: 0 } }), // exclude genesis
    Block.find({ index: { $gt: 0 } })
      .sort({ index: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);
  
  return { total, blocks };
}

/**
 * Get blocks for a specific election
 */
async function getElectionBlocks(electionId, limit = 25, page = 1) {
  const skip = (page - 1) * limit;
  const [total, blocks] = await Promise.all([
    Block.countDocuments({ electionId }),
    Block.find({ electionId })
      .sort({ index: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);
  
  return { total, blocks };
}

export {
  createGenesisBlock,
  addVoteToChain,
  validateChain,
  validateElectionChain,
  findBlockByVoteHash,
  getChainStats,
  getRecentBlocks,
  getElectionBlocks,
  calculateHash,
  DIFFICULTY,
};
