import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const networkName = hre.network.name;

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       SecureVote — Smart Contract Deployment     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('Network :', networkName);
  console.log('Deployer:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Balance :', hre.ethers.formatEther(balance), networkName === 'amoy' ? 'MATIC' : 'ETH');
  console.log('');

  // Deploy
  const SecureVote = await hre.ethers.getContractFactory('SecureVote');
  const contract = await SecureVote.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log('✅ SecureVote deployed to:', address);
  console.log('');

  // ── ENV config output ────────────────────────────────────
  console.log('┌──────────────────────────────────────────────────┐');
  console.log('│  Add these to your .env files:                   │');
  console.log('├──────────────────────────────────────────────────┤');

  if (networkName === 'localhost' || networkName === 'hardhat') {
    console.log('│                                                  │');
    console.log('│  backend/.env :                                  │');
    console.log(`│    VOTING_CONTRACT_ADDRESS=${address}`);
    console.log('│    ALCHEMY_AMOY_RPC=http://127.0.0.1:8545       │');
    console.log('│    DEPLOYER_PRIVATE_KEY=0xac0974...  (Account 0) │');
    console.log('│                                                  │');
    console.log('│  frontend/.env :                                 │');
    console.log(`│    VITE_CONTRACT_ADDRESS=${address}`);
    console.log('│    VITE_ALCHEMY_RPC=http://127.0.0.1:8545       │');
    console.log('│    VITE_CHAIN_ID=31337                           │');
    console.log('│                                                  │');
    console.log('├──────────────────────────────────────────────────┤');
    console.log('│  MetaMask → Settings → Networks → Add Network   │');
    console.log('│    Network Name : Hardhat Local                 │');
    console.log('│    RPC URL      : http://127.0.0.1:8545         │');
    console.log('│    Chain ID     : 31337                         │');
    console.log('│    Symbol       : ETH                           │');
    console.log('│                                                  │');
    console.log('│  Import Account #0 private key into MetaMask:   │');
    console.log('│  0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 │');
    console.log('│  (10,000 ETH pre-funded)                        │');
  } else {
    console.log(`│  VITE_CONTRACT_ADDRESS=${address}`);
    console.log(`│  VOTING_CONTRACT_ADDRESS=${address}`);
  }

  console.log('└──────────────────────────────────────────────────┘');

  // Write deployed.json
  const fs = await import('fs');
  const path = await import('path');
  const deployedPath = path.join(process.cwd(), 'deployed.json');
  fs.writeFileSync(deployedPath, JSON.stringify({
    network: networkName,
    address,
    deployer: deployer.address,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log('\nDeployment info saved to deployed.json');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
