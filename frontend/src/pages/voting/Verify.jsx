import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import { useWeb3 } from '../../context/Web3Context';

const Verify = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isConnected, connectWallet, connecting, hasMetaMask, account, shortenAddress, verifyVoteOnChain } = useWeb3();
  const [verificationData, setVerificationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [onChainResult, setOnChainResult] = useState(null);
  const [verifyingOnChain, setVerifyingOnChain] = useState(false);

  useEffect(() => {
    const verifyVote = async () => {
      try {
        const response = await axios.get(`/api/vote/${id}`);
        
        if (response.data.success) {
          setVerificationData({
            confirmationId: id,
            voteHash: response.data.voteHash,
            timestamp: response.data.timestamp,
            blockchain: response.data.blockchain || null,
            onChain: response.data.onChain || null,
          });
          setVerified(true);
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setError('Vote not found. Please check your confirmation ID.');
        } else {
          setError('Failed to verify vote');
        }
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      verifyVote();
    }
  }, [id]);

  // Verify on-chain when MetaMask is connected
  const handleOnChainVerify = async () => {
    if (!isConnected || !verificationData?.voteHash) return;
    setVerifyingOnChain(true);
    try {
      const result = await verifyVoteOnChain(verificationData.voteHash);
      setOnChainResult(result);
    } catch (err) {
      setOnChainResult({ found: false, error: err.message });
    } finally {
      setVerifyingOnChain(false);
    }
  };

  const handleBackToHistory = () => {
    navigate('/history');
  };

  const handleViewPublicLedger = () => {
    navigate('/public');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-cyan-700">BlockBallot</h1>
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              <button
                onClick={() => navigate('/dashboard')}
                className="ml-2 bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
              >
                <span className="sr-only">Dashboard</span>
                <span className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-800 font-medium">
                  Dashboard
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Vote Verification</h1>
            <p className="mt-1 text-sm text-gray-500">
              Verify that your vote was recorded on the blockchain
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Verification Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {verified && verificationData && (
            <div className="space-y-6">
              {/* Vote Verification Card */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Vote Verification Successful</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">
                    Your vote has been verified in the public ledger
                  </p>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Confirmation ID</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono">
                        {verificationData.confirmationId}
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Vote Hash</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 font-mono break-all">
                        {verificationData.voteHash}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Timestamp</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {new Date(verificationData.timestamp).toLocaleString()}
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Verification Status</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-green-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="font-medium text-green-700">Verified</span>
                        </div>
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Transparency</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <p className="mb-2">
                          Your vote has been cryptographically separated from your identity and stored immutably on the blockchain.
                        </p>
                        <p>
                          The vote hash above is publicly available in our <button 
                          onClick={handleViewPublicLedger}
                          className="text-cyan-600 hover:text-cyan-500 font-medium"
                        >
                          public ledger
                        </button> for independent verification.
                        </p>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Blockchain Verification Card */}
              {verificationData.blockchain && (
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 shadow-xl overflow-hidden sm:rounded-lg border border-slate-700">
                  <div className="px-4 py-5 sm:px-6">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3" aria-hidden="true">🔗</span>
                      <div>
                        <h3 className="text-lg leading-6 font-medium text-white">Blockchain Verification</h3>
                        <p className="mt-1 max-w-2xl text-sm text-slate-400">
                          Immutable on-chain record — tamper-proof and auditable
                        </p>
                      </div>
                      <div className="ml-auto">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          ON-CHAIN
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-700">
                    <dl>
                      <div className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 border-b border-slate-700/50">
                        <dt className="text-sm font-medium text-slate-400">Block Number</dt>
                        <dd className="mt-1 text-sm text-cyan-400 sm:mt-0 sm:col-span-2 font-mono font-bold">
                          #{verificationData.blockchain.blockIndex}
                        </dd>
                      </div>
                      <div className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 border-b border-slate-700/50">
                        <dt className="text-sm font-medium text-slate-400">Block Hash</dt>
                        <dd className="mt-1 text-xs text-emerald-400 sm:mt-0 sm:col-span-2 font-mono break-all">
                          {verificationData.blockchain.blockHash}
                        </dd>
                      </div>
                      <div className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 border-b border-slate-700/50">
                        <dt className="text-sm font-medium text-slate-400">Previous Block Hash</dt>
                        <dd className="mt-1 text-xs text-orange-400 sm:mt-0 sm:col-span-2 font-mono break-all">
                          {verificationData.blockchain.previousHash}
                        </dd>
                      </div>
                      <div className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 border-b border-slate-700/50">
                        <dt className="text-sm font-medium text-slate-400">Proof of Work (Nonce)</dt>
                        <dd className="mt-1 text-sm text-purple-400 sm:mt-0 sm:col-span-2 font-mono">
                          {verificationData.blockchain.nonce}
                        </dd>
                      </div>
                      <div className="px-4 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-slate-400">Mined At</dt>
                        <dd className="mt-1 text-sm text-slate-300 sm:mt-0 sm:col-span-2">
                          {new Date(verificationData.blockchain.minedAt).toLocaleString()}
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="px-4 py-3 sm:px-6 bg-slate-900/50">
                    <p className="text-xs text-slate-500">
                      <span aria-hidden="true">🔒</span> This block is cryptographically linked to the previous block via SHA-256 hash chain. 
                      Any modification to this or any previous block will break the chain and be immediately detectable.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── MetaMask On-Chain Verification Section ──────────── */}
              <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-lg">
                      <span aria-hidden="true">🦊</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900">
                      {isConnected ? 'Smart Contract Verification' : 'Connect MetaMask for Deep Verification'}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {isConnected
                        ? `Connected as ${shortenAddress(account)}. Verify this vote directly on the smart contract.`
                        : 'Connect your MetaMask wallet to verify this vote directly on the smart contract and view other voters\' hashes on the public ledger.'
                      }
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isConnected ? (
                      <button
                        onClick={handleOnChainVerify}
                        disabled={verifyingOnChain}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50"
                      >
                        {verifyingOnChain ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Verifying…
                          </>
                        ) : (
                          <><span aria-hidden="true">🔍</span> Verify on Smart Contract</>
                        )}
                      </button>
                    ) : hasMetaMask ? (
                      <button
                        onClick={connectWallet}
                        disabled={connecting}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow-md hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50"
                      >
                        {connecting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Connecting…
                          </>
                        ) : (
                          <><span aria-hidden="true">🦊</span> Connect MetaMask</>
                        )}
                      </button>
                    ) : (
                      <a
                        href="https://metamask.io/download/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                      >
                        <span aria-hidden="true">🦊</span> Install MetaMask
                      </a>
                    )}
                  </div>
                </div>

                {/* On-chain verification result */}
                {onChainResult && (
                  <div className="mt-4 p-4 rounded-lg bg-white border border-indigo-100">
                    {onChainResult.found ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <svg className="h-5 w-5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className="text-sm font-bold text-emerald-800"><span aria-hidden="true">✓</span> Vote verified on smart contract!</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium text-gray-500">Election Index:</span>{' '}
                            <span className="font-mono text-gray-900">{onChainResult.electionIndex}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Candidate Index:</span>{' '}
                            <span className="font-mono text-gray-900">{onChainResult.candidateIndex}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Timestamp:</span>{' '}
                            <span className="font-mono text-gray-900">{onChainResult.timestamp ? new Date(onChainResult.timestamp * 1000).toLocaleString() : '—'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Voter Wallet:</span>{' '}
                            <span className="font-mono text-gray-900 break-all">{onChainResult.voter || '—'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm text-yellow-800">
                          Vote not found on the smart contract. This may be because MetaMask was not used when casting the vote (MetaMask is optional for voting).
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleViewPublicLedger}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                >
                  View Public Ledger
                </button>
                <button
                  onClick={handleBackToHistory}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                >
                  Back to Voting History
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Verify;