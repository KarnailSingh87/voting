/**
 * Copy the compiled ABI from Hardhat artifacts into:
 *   - frontend/src/contracts/SecureVote.json
 *   - backend/contracts/SecureVote.json
 *
 * Run: npm run copy-abi   (after `npm run compile`)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.join(__dirname, '..', 'artifacts', 'src', 'SecureVote.sol', 'SecureVote.json');

if (!fs.existsSync(artifactPath)) {
  console.error('❌ Artifact not found — run `npm run compile` first.');
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

// We only need the ABI (and optionally the bytecode for deploy)
const abiPayload = JSON.stringify({ abi: artifact.abi }, null, 2);

const destinations = [
  path.join(__dirname, '..', '..', 'frontend', 'src', 'contracts', 'SecureVote.json'),
  path.join(__dirname, '..', '..', 'backend', 'contracts', 'SecureVote.json'),
];

for (const dest of destinations) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, abiPayload);
  console.log('✅ ABI copied to', dest);
}
