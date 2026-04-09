#!/usr/bin/env node
/**
 * Insert a mined test block into the local MongoDB chain (safe, local only).
 * Usage:
 *   node backend/scripts/insert_test_block.js [votePayload] [electionId] [candidateId]
 * Example:
 *   node backend/scripts/insert_test_block.js "test-vote-1"
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Block from '../models/Block.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

function calculateHash(index, timestamp, voteHash, electionId, candidateId, previousHash, nonce) {
  const data = `${index}${timestamp}${voteHash}${electionId}${candidateId}${previousHash}${nonce}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/voting';
  await mongoose.connect(MONGO, { dbName: undefined });
  console.log('Connected to Mongo:', MONGO);

  const latest = await Block.findOne().sort({ index: -1 }).lean();
  const newIndex = latest ? latest.index + 1 : 0;
  const previousHash = latest ? latest.hash : '0'.repeat(64);
  const timestamp = new Date();

  const votePayload = process.argv[2] || `TEST_VOTE_${Date.now()}`;
  const voteHash = crypto.createHash('sha256').update(votePayload).digest('hex');
  const electionId = process.argv[3] || null;
  const candidateId = process.argv[4] || null;

  const DIFFICULTY = Number(process.env.BLOCKCHAIN_DIFFICULTY || 2);
  const target = '0'.repeat(DIFFICULTY);

  console.log(`Mining block index=${newIndex} difficulty=${DIFFICULTY} ...`);
  let nonce = 0;
  let hash = '';
  do {
    hash = calculateHash(newIndex, timestamp.toISOString(), voteHash, String(electionId || ''), String(candidateId || ''), previousHash, nonce);
    nonce++;
  } while (!hash.startsWith(target));

  const block = new Block({
    index: newIndex,
    timestamp,
    voteHash,
    electionId: electionId || null,
    candidateId: candidateId || null,
    previousHash,
    hash,
    nonce: nonce - 1,
    merkleRoot: crypto.createHash('sha256').update('GENESIS').digest('hex'),
  });

  await block.save();
  console.log('Inserted test block:', {
    index: block.index,
    hash: block.hash,
    nonce: block.nonce,
    voteHash: block.voteHash,
    previousHash: block.previousHash,
  });

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error inserting test block:', err);
  process.exit(1);
});
