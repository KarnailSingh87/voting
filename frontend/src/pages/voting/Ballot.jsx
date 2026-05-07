import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import axios from '../../utils/axios';
import VoterNavbar from '../../components/VoterNavbar';
import { useWeb3 } from '../../context/Web3Context';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL (handles both absolute and relative URLs)
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

// Photo Modal Component
const PhotoModal = ({ photoUrl, name, onClose }) => {
  if (!photoUrl) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
      <div className="relative max-w-3xl max-h-[90vh] p-2">
        <button 
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300"
        >
          ×
        </button>
        <img 
          src={photoUrl} 
          alt={name} 
          className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <p className="text-white text-center mt-2 text-lg font-medium">{name}</p>
      </div>
    </div>
  );
};

PhotoModal.propTypes = {
  photoUrl: PropTypes.string,
  name: PropTypes.string,
  onClose: PropTypes.func.isRequired,
};

const Ballot = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [election, setElection] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [Voting, setVoting] = useState(false);
  const [error, setError] = useState('');
  const [photoModal, setPhotoModal] = useState({ show: false, url: null, name: '' });
  const [blockchainData, setBlockchainData] = useState(null);
  const [voteHashResult, setVoteHashResult] = useState('');

  const { isConnected, castVoteOnChain, isCorrectChain, account } = useWeb3();

  useEffect(() => {
    const fetchElection = async () => {
      try {
        const response = await axios.get(`/api/election/${id}`);
        if (response.data.success) {
          // Combine election data with candidates array from response
          setElection({
            ...response.data.election,
            candidates: response.data.candidates || []
          });
        }
      } catch (err) {
        setError('Failed to fetch election details');
      } finally {
        setLoading(false);
      }
    };

    fetchElection();
  }, [id]);

  const handleVote = async () => {
    setVoting(true);
    setError('');

    // Note: MetaMask is NOT required for voting.
    // Votes are recorded via server-side JWT auth + local blockchain.
    // MetaMask on-chain recording is an optional bonus if already connected.
    
    try {
      const token = localStorage.getItem('voterToken');
      const response = await axios.post('/api/vote/cast', 
        { electionId: id, candidateId: selectedCandidate },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (response.data.message || response.data.voteHash) {
        const { voteHash, blockchain } = response.data;
        
        // ─── Optional MetaMask On-Chain Step ─────────────────
        // Only if user has already connected MetaMask voluntarily
        if (isConnected && isCorrectChain && election.onChainIndex !== undefined && window.ethereum) {
          try {
            const cand = election.candidates.find(c => (c.id || c._id) === selectedCandidate);
            if (cand && cand.onChainIndex !== undefined) {
              const chainResult = await castVoteOnChain(election.onChainIndex, cand.onChainIndex, voteHash);
              
              // Tell backend to link txHash to the record
              await axios.post('/api/vote/link-tx', {
                voteHash,
                txHash: chainResult.txHash,
                voterWallet: account,
                onChainElectionIdx: election.onChainIndex,
                onChainCandidateIdx: cand.onChainIndex
              }, { headers: { Authorization: `Bearer ${token}` } });
            }
          } catch (err) {
            console.error('MetaMask Tx failed (non-fatal):', err);
            // Non-fatal: the vote was successfully saved in standard DB/local chain
          }
        }
        // ───────────────────────────────────────────────────

        setBlockchainData(blockchain || null);
        setVoteHashResult(voteHash || '');
        setShowConfirmation(false);
        setShowSuccess(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cast vote');
    } finally {
      setVoting(false);
    }
  };

  const handleConfirmVote = () => {
    setShowConfirmation(true);
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-md bg-red-50 p-4 max-w-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!election || !election.candidates) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-md bg-yellow-50 p-4 max-w-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Election Not Found
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>The election data could not be loaded. Please try again later.</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="text-sm font-medium text-yellow-800 hover:text-yellow-600"
                >
                  Return to Dashboard →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full space-y-6">
          {/* Success Card */}
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <svg className="mx-auto h-16 w-16 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">Vote Cast Successfully!</h2>
            <p className="mt-2 text-gray-600">
              Your vote has been securely recorded and encrypted. Thank you for participating in the democratic process.
            </p>
            {voteHashResult && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Vote Receipt Hash</p>
                <p className="text-xs font-mono text-gray-700 break-all">{voteHashResult}</p>
              </div>
            )}
          </div>

          {/* Blockchain Confirmation Card */}
          {blockchainData && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-3">
                <span className="text-xl" aria-hidden="true">🔗</span>
                <div>
                  <h3 className="text-sm font-bold text-white">Blockchain Confirmed</h3>
                  <p className="text-xs text-slate-400">Immutable on-chain record</p>
                </div>
                <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span aria-hidden="true">✓</span> MINED
                </span>
              </div>
              <div className="border-t border-slate-700 px-5 py-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Block</span>
                  <span className="text-sm font-bold text-cyan-400 font-mono">#{blockchainData.blockIndex}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Block Hash</span>
                  <p className="text-[10px] font-mono text-emerald-400 break-all mt-0.5">{blockchainData.blockHash}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400">Previous Hash</span>
                  <p className="text-[10px] font-mono text-orange-400 break-all mt-0.5">{blockchainData.previousHash}</p>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Nonce (PoW)</span>
                  <span className="text-xs font-mono text-purple-400">{blockchainData.nonce}</span>
                </div>
              </div>
              <div className="px-5 py-2 bg-slate-900/50 border-t border-slate-700">
                <p className="text-[10px] text-slate-500"><span aria-hidden="true">🔒</span> This vote is permanently sealed in the blockchain and cannot be altered or deleted.</p>
              </div>
            </div>
          )}

          {/* MetaMask Verification Hint */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">🦊</span>
              <div>
                <p className="text-sm font-medium text-indigo-900">Want to verify votes on the public ledger?</p>
                <p className="text-xs text-indigo-700 mt-1">
                  Connect your MetaMask wallet on the public ledger page to view all voters' hashes and verify vote integrity on the blockchain.
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => navigate('/public')}
              className="flex-1 flex justify-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              View Public Ledger
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <VoterNavbar />

      {/* Main Content */}
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Cast Your Vote</h1>
            <p className="mt-1 text-sm text-gray-500">
              Select a candidate and confirm your vote
            </p>
          </div>

          {showConfirmation ? (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Confirm Your Vote</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                  Please review your selection before confirming
                </p>
              </div>
              <div className="border-t border-gray-200">
                <dl>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Election</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{election.title}</dd>
                  </div>
                  <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Your Selection</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {election.candidates.find(c => c.id === selectedCandidate)?.name}
                    </dd>
                  </div>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Security Assurance</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      Your vote will be encrypted, separated from your identity, and permanently recorded 
                      on the blockchain. A confirmation receipt with blockchain hash will be provided for verification.
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="px-4 py-4 bg-gray-50 sm:px-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <button
                  onClick={() => setShowConfirmation(false)}
                  className="w-full sm:w-auto inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVote}
                  disabled={Voting}
                  className="w-full sm:w-auto inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
                >
                  {Voting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Casting Vote...
                    </>
                  ) : 'Confirm Vote'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <div className="px-4 py-5 sm:px-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">{election.title}</h3>
                <p className="mt-1 max-w-2xl text-sm text-gray-500">{election.description}</p>
              </div>
              <div className="border-t border-gray-200">
                <dl>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Voting Period</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      {new Date(election.startDate).toLocaleDateString()} - {new Date(election.endDate).toLocaleDateString()}
                    </dd>
                  </div>
                  <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Select Candidate</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      <div className="space-y-4">
                        {election.candidates.map((candidate) => (
                          <div 
                            key={candidate.id} 
                            className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedCandidate === candidate.id 
                                ? 'border-cyan-500 bg-cyan-50' 
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedCandidate(candidate.id)}
                          >
                            <input
                              id={`candidate-${candidate.id}`}
                              name="candidate"
                              type="radio"
                              checked={selectedCandidate === candidate.id}
                              onChange={() => setSelectedCandidate(candidate.id)}
                              className="focus:ring-cyan-500 h-4 w-4 text-cyan-600 border-gray-300"
                            />
                            <div className="ml-3 flex items-center flex-1 min-w-0">
                              {candidate.photoUrl ? (
                                <img 
                                  src={getImageUrl(candidate.photoUrl)} 
                                  alt={candidate.name} 
                                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover mr-3 sm:mr-4 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPhotoModal({ show: true, url: getImageUrl(candidate.photoUrl), name: candidate.name });
                                  }}
                                  onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                                />
                              ) : null}
                              <div 
                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200 mr-3 sm:mr-4 flex-shrink-0 flex items-center justify-center text-gray-500 text-sm font-medium"
                                style={candidate.photoUrl ? { display: 'none' } : {}}
                              >
                                {(candidate.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                              </div>
                              <label htmlFor={`candidate-${candidate.id}`} className="block cursor-pointer">
                                <div className="font-medium text-gray-900">{candidate.name}</div>
                                {candidate.party && (
                                  <div className="text-gray-500 text-sm">{candidate.party}</div>
                                )}
                                {candidate.description && (
                                  <div className="text-gray-500 text-xs mt-1">{candidate.description}</div>
                                )}
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </dd>
                  </div>
                  <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                    <dt className="text-sm font-medium text-gray-500">Security Information</dt>
                    <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Your vote will be encrypted and stored securely</li>
                        <li>Your identity is cryptographically separated from your vote</li>
                        <li>You will receive a confirmation receipt for verification</li>
                        <li><span aria-hidden="true">🔗</span> Your vote is recorded on an immutable blockchain — tamper-proof</li>
                        <li>Each vote is mined into a cryptographic block with proof of work</li>
                        <li><span aria-hidden="true">🦊</span> MetaMask is <strong>optional</strong> — connect it only if you want an additional on-chain record</li>
                        <li><span aria-hidden="true">🔍</span> To verify other voters' hashes on the public ledger, MetaMask connection is required</li>
                      </ul>
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="px-4 py-4 bg-gray-50 sm:px-6">
                <button
                  onClick={handleConfirmVote}
                  disabled={!selectedCandidate || Voting}
                  className="w-full sm:w-auto sm:float-right inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
                >
                  Review & Confirm Vote
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Photo Modal */}
      {photoModal.show && (
        <PhotoModal 
          photoUrl={photoModal.url} 
          name={photoModal.name} 
          onClose={() => setPhotoModal({ show: false, url: null, name: '' })} 
        />
      )}
    </div>
  );
};

export default Ballot;