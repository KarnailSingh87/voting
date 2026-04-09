/**
 * Web3Context — React context for blockchain connection management
 *
 * Supports TWO networks:
 *   • Hardhat Local  — chainId 31337, RPC http://127.0.0.1:8545 (dev)
 *   • Polygon Amoy   — chainId 80002, RPC via Alchemy            (testnet)
 *
 * The active network is determined by VITE_CHAIN_ID env var.
 * Set VITE_CHAIN_ID=31337 for local dev, or 80002 for Amoy testnet.
 *
 * Usage in any component:
 *   import { useWeb3 } from '../context/Web3Context';
 *   const { account, connectWallet, castVoteOnChain } = useWeb3();
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import SecureVoteABI from '../contracts/SecureVote.json';

// ── Config from env ────────────────────────────────────────
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '';
const RPC_URL          = import.meta.env.VITE_ALCHEMY_RPC      || 'http://127.0.0.1:8545';
const TARGET_CHAIN_ID  = Number(import.meta.env.VITE_CHAIN_ID  || 31337);
const TARGET_CHAIN_HEX = '0x' + TARGET_CHAIN_ID.toString(16);

// Network metadata for MetaMask wallet_addEthereumChain
const NETWORK_META = {
  31337: {
    chainId:    TARGET_CHAIN_HEX,
    chainName:  'Hardhat Local',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls:    ['http://127.0.0.1:8545'],
    blockExplorerUrls: [],
  },
  80002: {
    chainId:    TARGET_CHAIN_HEX,
    chainName:  'Polygon Amoy Testnet',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls:    [RPC_URL || 'https://rpc-amoy.polygon.technology'],
    blockExplorerUrls: ['https://amoy.polygonscan.com/'],
  },
};

const ACTIVE_NETWORK = NETWORK_META[TARGET_CHAIN_ID] || NETWORK_META[31337];
const IS_LOCAL = TARGET_CHAIN_ID === 31337;

// ── Context ────────────────────────────────────────────────
const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [account, setAccount]               = useState(null);
  const [chainId, setChainId]               = useState(null);
  const [provider, setProvider]             = useState(null);
  const [signer, setSigner]                 = useState(null);
  const [signerContract, setSignerContract] = useState(null);
  const [isCorrectChain, setIsCorrectChain] = useState(false);
  const [connecting, setConnecting]         = useState(false);
  const [error, setError]                   = useState('');

  // ── Read-only provider (always available — no wallet required) ──
  const readProvider = useMemo(() => {
    if (!RPC_URL) return null;
    try { return new ethers.JsonRpcProvider(RPC_URL); }
    catch { return null; }
  }, []);

  const readContract = useMemo(() => {
    if (!readProvider || !CONTRACT_ADDRESS) return null;
    try { return new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI.abi, readProvider); }
    catch { return null; }
  }, [readProvider]);

  // ── Detect wallet on mount ───────────────────────────────
  useEffect(() => {
    const detect = async () => {
      if (!window.ethereum) return;
      try {
        const accs = await window.ethereum.request({ method: 'eth_accounts' });
        if (accs.length > 0) await setupProvider(accs[0]);
      } catch {}
    };
    detect();

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', onAccountsChanged);
      window.ethereum.on('chainChanged', () => window.location.reload());
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', onAccountsChanged);
        window.ethereum.removeListener('chainChanged', () => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onAccountsChanged(accs) {
    if (accs.length === 0) disconnect();
    else setupProvider(accs[0]);
  }

  async function setupProvider(addr) {
    try {
      const bp = new ethers.BrowserProvider(window.ethereum);
      const s = await bp.getSigner();
      const net = await bp.getNetwork();
      const cid = Number(net.chainId);

      setAccount(addr);
      setProvider(bp);
      setSigner(s);
      setChainId(cid);
      setIsCorrectChain(cid === TARGET_CHAIN_ID);

      if (CONTRACT_ADDRESS && cid === TARGET_CHAIN_ID) {
        setSignerContract(new ethers.Contract(CONTRACT_ADDRESS, SecureVoteABI.abi, s));
      } else {
        setSignerContract(null);
      }
    } catch (err) {
      console.error('Web3 setup error:', err);
      setError(err.message || 'Failed to setup Web3');
    }
  }

  // ── Connect Wallet ────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    setError('');
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install MetaMask to use blockchain features.');
      return false;
    }
    setConnecting(true);
    try {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accs.length > 0) { await setupProvider(accs[0]); return true; }
      return false;
    } catch (err) {
      setError(err.code === 4001 ? 'Connection rejected by user' : (err.message || 'Failed to connect'));
      return false;
    } finally {
      setConnecting(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch to target chain ────────────────────────────────
  const switchChain = useCallback(async () => {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: TARGET_CHAIN_HEX }],
      });
      return true;
    } catch (err) {
      if (err.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [ACTIVE_NETWORK],
          });
          return true;
        } catch {
          setError(`Could not add ${ACTIVE_NETWORK.chainName} network`);
          return false;
        }
      }
      setError(`Could not switch to ${ACTIVE_NETWORK.chainName}`);
      return false;
    }
  }, []);

  // ── Disconnect ────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setAccount(null); setProvider(null); setSigner(null);
    setSignerContract(null); setChainId(null); setIsCorrectChain(false);
  }, []);

  // ── Cast vote on-chain (voter signs via MetaMask) ─────────
  const castVoteOnChain = useCallback(async (electionIndex, candidateIndex, voteHashHex) => {
    if (!signerContract) throw new Error('Wallet not connected or wrong network');
    const bytes32 = voteHashHex.startsWith('0x')
      ? voteHashHex.padEnd(66, '0').slice(0, 66)
      : ('0x' + voteHashHex).padEnd(66, '0').slice(0, 66);

    const tx = await signerContract.castVote(electionIndex, candidateIndex, bytes32);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }, [signerContract]);

  // ── Verify vote hash on-chain (read-only) ─────────────────
  const verifyVoteOnChain = useCallback(async (voteHashHex) => {
    const c = readContract || signerContract;
    if (!c) return null;
    const bytes32 = voteHashHex.startsWith('0x')
      ? voteHashHex.padEnd(66, '0').slice(0, 66)
      : ('0x' + voteHashHex).padEnd(66, '0').slice(0, 66);

    const [found, record] = await c.getVoteByHash(bytes32);
    if (!found) return { found: false };
    return {
      found: true,
      electionIndex: Number(record.electionIndex),
      candidateIndex: Number(record.candidateIndex),
      timestamp: Number(record.timestamp),
      voter: record.voter,
    };
  }, [readContract, signerContract]);

  // ── Get election results directly from chain ──────────────
  const getElectionResults = useCallback(async (electionIndex) => {
    const c = readContract || signerContract;
    if (!c) return null;
    const [names, counts] = await c.getElectionResults(electionIndex);
    return names.map((n, i) => ({ name: n, votes: Number(counts[i]) }));
  }, [readContract, signerContract]);

  // ── Check if current wallet has voted ─────────────────────
  const checkHasVoted = useCallback(async (electionIndex) => {
    const c = readContract || signerContract;
    if (!c || !account) return null;
    return c.hasVoted(account, electionIndex);
  }, [readContract, signerContract, account]);

  // ── Context value ─────────────────────────────────────────
  const value = useMemo(() => ({
    // State
    account,
    chainId,
    isCorrectChain,
    connecting,
    error,
    hasMetaMask:     typeof window !== 'undefined' && !!window.ethereum,
    isConnected:     !!account,
    isLocalNetwork:  IS_LOCAL,
    targetChainId:   TARGET_CHAIN_ID,
    networkName:     ACTIVE_NETWORK.chainName,
    contractAddress: CONTRACT_ADDRESS,

    // Providers & contracts
    provider,
    signer,
    contract:       readContract,
    signerContract,

    // Actions
    connectWallet,
    disconnect,
    switchChain,

    // Contract interactions
    castVoteOnChain,
    verifyVoteOnChain,
    getElectionResults,
    checkHasVoted,

    // Utility
    shortenAddress: (addr) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '',
    explorerUrl: IS_LOCAL
      ? (_txHash) => '#'
      : (txHash) => `https://amoy.polygonscan.com/tx/${txHash}`,
  }), [
    account, chainId, isCorrectChain, connecting, error,
    provider, signer, readContract, signerContract,
    connectWallet, disconnect, switchChain,
    castVoteOnChain, verifyVoteOnChain, getElectionResults, checkHasVoted,
  ]);

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error('useWeb3 must be used inside <Web3Provider>');
  return ctx;
}

export default Web3Context;
