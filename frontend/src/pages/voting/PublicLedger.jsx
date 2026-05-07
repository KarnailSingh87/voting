import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../../utils/axios';
import { useWeb3 } from '../../context/Web3Context';

const PublicLedger = () => {
  const { id } = useParams();
  const { isConnected, connectWallet, connecting, account, hasMetaMask, shortenAddress } = useWeb3();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledger, setLedger] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [chainStats, setChainStats] = useState(null);
  const [chainValid, setChainValid] = useState(null);
  const [validating, setValidating] = useState(false);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [details, setDetails] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); setError('');
      try {
        const res = await axios.get(`/api/ledger/${id}?page=${page}&limit=25`);
        if (res.data && res.data.success) {
          setLedger(res.data.ledger || []);
          setTotal(res.data.total || 0);
        } else {
          setError(res.data?.message || 'Failed to load ledger');
        }
      } catch (e) {
        console.error('Failed to fetch ledger', e);
        setError(e.response?.data?.message || 'Failed to load ledger');
      } finally { setLoading(false); }
    };

    const fetchChainStats = async () => {
      try {
        const res = await axios.get('/api/blockchain/stats');
        if (res.data?.success && res.data.localChain) setChainStats(res.data.localChain);
      } catch (_) {}
    };

    if (id) {
      fetchData();
      fetchChainStats();
    }
  }, [id, page]);

  const handleValidateChain = async () => {
    setValidating(true);
    try {
      const res = await axios.get(`/api/blockchain/validate/${id}`);
      if (res.data) setChainValid(res.data);
    } catch (e) {
      setChainValid({ valid: false, error: 'Failed to validate chain' });
    } finally { setValidating(false); }
  };

  const openHybridDetails = async (voteHash) => {
    if (!isConnected) return; // MetaMask required for details
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError('');
    setDetails(null);
    try {
      const res = await axios.get(`/api/blockchain/hybrid/vote/${voteHash}`);
      if (res.data?.success) setDetails(res.data);
      else setDetailsError(res.data?.message || 'Failed to load blockchain details');
    } catch (e) {
      setDetailsError(e.response?.data?.message || 'Failed to load blockchain details');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Mask a hash string for non-connected users
  const maskHash = (hash) => {
    if (!hash) return '—';
    if (isConnected) return hash;
    // Show first 8 and last 4 chars, mask the rest
    if (hash.length <= 16) return '•'.repeat(hash.length);
    return hash.slice(0, 8) + '•'.repeat(Math.min(20, hash.length - 12)) + hash.slice(-4);
  };

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900"><span aria-hidden="true">🔗</span> Blockchain Vote Ledger</h2>
          <p className="text-sm text-gray-500 mt-1">
            Hybrid ledger: <span className="font-medium">Local Chain (DB blocks)</span> +{' '}
            <span className="font-medium">Public Chain (Polygon tx proof)</span>
          </p>
        </div>
        <Link to={`/public/election/${id}`} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">← Back to results</Link>
      </div>

      {/* ─── MetaMask Verification Gate Banner ──────────────────────── */}
      {!isConnected && (
        <div className="mb-6 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl shadow-lg">
                <span aria-hidden="true">🦊</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900">Connect MetaMask to Verify Votes</h3>
              <p className="text-sm text-gray-600 mt-1">
                Vote hashes and voter wallet addresses are hidden for privacy. Connect your MetaMask wallet to reveal full blockchain data and verify vote integrity.
              </p>
            </div>
            <div className="flex-shrink-0">
              {hasMetaMask ? (
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
                    <><span aria-hidden="true">🦊</span> Connect Wallet to Verify</>
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
        </div>
      )}

      {/* Connected wallet indicator */}
      {isConnected && (
        <div className="mb-6 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-medium text-emerald-800">
            Wallet Connected: <span className="font-mono">{shortenAddress(account)}</span>
          </span>
          <span className="text-xs text-emerald-600 ml-auto"><span aria-hidden="true">✓</span> Full vote hash verification enabled</span>
        </div>
      )}

      {/* Chain Stats Banner */}
      {chainStats && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl shadow-lg p-5 mb-6 border border-slate-700">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400 font-mono">{chainStats.totalBlocks || 0}</div>
              <div className="text-xs text-slate-400 mt-1">Total Blocks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400 font-mono">#{chainStats.latestBlockIndex ?? 0}</div>
              <div className="text-xs text-slate-400 mt-1">Latest Block</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400 font-mono">{chainStats.difficulty || 2}</div>
              <div className="text-xs text-slate-400 mt-1">Difficulty</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-mono text-orange-400 truncate max-w-[140px] mx-auto">{chainStats.latestBlockHash?.slice(0, 16) || '...'}</div>
              <div className="text-xs text-slate-400 mt-1">Latest Hash</div>
            </div>
          </div>
        </div>
      )}

      {/* Validate Chain Button */}
      <div className="flex items-center gap-3 mb-4">
        <button 
          onClick={handleValidateChain} 
          disabled={validating}
          className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
        >
          {validating ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Validating Chain...
            </>
          ) : <><span aria-hidden="true">🔍</span>{' '}Validate Blockchain Integrity</>}
        </button>
        
        {chainValid && (
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
            chainValid.valid 
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {chainValid.valid ? <><span aria-hidden="true">✅</span>{' '}Chain Intact — No Tampering Detected</> : <><span aria-hidden="true">❌</span>{' '}{chainValid.error || 'Chain Compromised'}</>}
          </span>
        )}
      </div>

      {/* Ledger Table */}
      <div className="bg-white shadow-lg rounded-xl overflow-hidden border border-gray-200">
        {loading ? (
          <div className="p-8 text-center">
            <svg className="animate-spin h-8 w-8 text-cyan-600 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 text-center">{error}</div>
        ) : (
          <div>
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <span className="text-sm text-gray-600">Page {page} — <strong>{total}</strong> total votes on-chain</span>
              {!isConnected && (
                <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Hashes masked — Connect MetaMask to reveal
                </span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {ledger.length === 0 && <div className="p-6 text-sm text-gray-500 text-center">No votes found</div>}
              {ledger.map(entry => (
                <div key={entry._id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {entry.blockIndex != null && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-cyan-400 font-mono">
                            Block #{entry.blockIndex}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                      <div className={`text-xs font-mono truncate ${isConnected ? 'text-gray-700' : 'text-gray-400'}`} title={isConnected ? entry.voteHash : 'Connect MetaMask to reveal'}>
                        Vote: {maskHash(entry.voteHash)}
                      </div>
                      {entry.blockHash && (
                        <div className={`text-[10px] font-mono truncate mt-0.5 ${isConnected ? 'text-emerald-600' : 'text-emerald-400'}`} title={isConnected ? entry.blockHash : 'Connect MetaMask to reveal'}>
                          Local Hash: {maskHash(entry.blockHash)}
                        </div>
                      )}
                      {entry.txHash && (
                        <div className={`text-[10px] font-mono truncate mt-0.5 ${isConnected ? 'text-sky-700' : 'text-sky-400'}`} title={isConnected ? entry.txHash : 'Connect MetaMask to reveal'}>
                          Public Tx: {maskHash(entry.txHash)}
                        </div>
                      )}
                      {entry.voterWallet && isConnected && (
                        <div className="text-[10px] font-mono truncate mt-0.5 text-purple-600" title={entry.voterWallet}>
                          Voter Wallet: {entry.voterWallet}
                        </div>
                      )}
                      {entry.voterWallet && !isConnected && (
                        <div className="text-[10px] font-mono truncate mt-0.5 text-purple-400">
                          Voter Wallet: {maskHash(entry.voterWallet)}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          entry.blockHash ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}>
                          {entry.blockHash ? <><span aria-hidden="true">✓</span>{' '}Local block mined</> : <><span aria-hidden="true">⏳</span>{' '}Local pending</>}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          entry.txHash ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {entry.txHash ? <><span aria-hidden="true">✓</span>{' '}Public tx linked</> : <>— Public tx</>}
                        </span>
                        {isConnected ? (
                          <button
                            onClick={() => openHybridDetails(entry.voteHash)}
                            className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-slate-900 text-white hover:bg-slate-800"
                            title="View block / transaction details"
                          >
                            <span aria-hidden="true">🔗</span> View
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-gray-200 text-gray-500 cursor-not-allowed"
                            title="Connect MetaMask to view full details"
                          >
                            <span aria-hidden="true">🔒</span> Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))} className="px-3 py-1.5 bg-white border rounded-md text-sm disabled:opacity-50 hover:bg-gray-50">Prev</button>
              <div className="text-sm text-gray-600">Page {page}</div>
              <button disabled={ledger.length === 0} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 bg-white border rounded-md text-sm disabled:opacity-50 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal — only accessible when connected */}
      {detailsOpen && isConnected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailsOpen(false)} />
          <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
              <div>
                <div className="text-sm font-bold text-gray-900">Hybrid Blockchain Details</div>
                <div className="text-[11px] text-gray-500 font-mono truncate max-w-[520px]">
                  {details?.vote?.voteHash || 'Loading…'}
                </div>
              </div>
              <button
                onClick={() => setDetailsOpen(false)}
                className="text-sm font-semibold text-gray-600 hover:text-gray-900"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              {detailsLoading ? (
                <div className="py-12 text-center text-sm text-gray-600">Loading details…</div>
              ) : detailsError ? (
                <div className="py-8 text-center text-sm text-red-600">{detailsError}</div>
              ) : details ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Local Chain */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-emerald-900">Local Chain (DB)</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${details.localChain?.block ? 'bg-emerald-100 border-emerald-200 text-emerald-800' : 'bg-yellow-100 border-yellow-200 text-yellow-800'}`}>
                        {details.localChain?.block ? 'Recorded' : 'Missing'}
                      </span>
                    </div>

                    {details.localChain?.block ? (
                      <div className="space-y-1 text-[12px] text-emerald-900">
                        <div><span className="font-semibold">Index:</span> <span className="font-mono">#{details.localChain.block.index}</span></div>
                        <div className="truncate" title={details.localChain.block.hash}><span className="font-semibold">Hash:</span> <span className="font-mono">{details.localChain.block.hash}</span></div>
                        <div className="truncate" title={details.localChain.block.previousHash}><span className="font-semibold">Prev:</span> <span className="font-mono">{details.localChain.block.previousHash}</span></div>
                        <div><span className="font-semibold">Nonce:</span> <span className="font-mono">{details.localChain.block.nonce}</span></div>
                        <div><span className="font-semibold">Mined:</span> {new Date(details.localChain.block.timestamp).toLocaleString()}</div>
                      </div>
                    ) : (
                      <div className="text-[12px] text-emerald-900/80">No local block found for this vote.</div>
                    )}
                  </div>

                  {/* Public Chain */}
                  <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-sky-900">Public Chain (Polygon)</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${details.publicChain?.enabled ? 'bg-sky-100 border-sky-200 text-sky-800' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                        {details.publicChain?.enabled ? 'Linked' : 'Not linked'}
                      </span>
                    </div>

                    {details.publicChain?.enabled ? (
                      <div className="space-y-2">
                        <div className="text-[12px] text-sky-900">
                          <div className="truncate" title={details.publicChain.tx?.txHash}>
                            <span className="font-semibold">Tx:</span> <span className="font-mono">{details.publicChain.tx?.txHash}</span>
                          </div>
                          {details.publicChain.tx?.explorerUrl && (
                            <a
                              href={details.publicChain.tx.explorerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block mt-1 text-[12px] font-semibold text-sky-700 hover:text-sky-900"
                            >
                              Open in explorer →
                            </a>
                          )}
                        </div>

                        <div className="text-[12px] text-sky-900">
                          <span className="font-semibold">Confirmed:</span> {details.publicChain.tx?.verified ? 'Yes' : 'No'}
                          {details.publicChain.tx?.blockNumber != null && (
                            <span className="ml-2"><span className="font-semibold">Block:</span> <span className="font-mono">{details.publicChain.tx.blockNumber}</span></span>
                          )}
                        </div>

                        {details.publicChain.decodedVoteCast && (
                          <div className="rounded-md bg-white border border-sky-200 p-3">
                            <div className="text-[12px] font-bold text-sky-900 mb-1">Decoded VoteCast Event</div>
                            <div className="space-y-1 text-[12px] text-sky-900">
                              <div><span className="font-semibold">ElectionIndex:</span> <span className="font-mono">{details.publicChain.decodedVoteCast.electionIndex}</span></div>
                              <div><span className="font-semibold">CandidateIndex:</span> <span className="font-mono">{details.publicChain.decodedVoteCast.candidateIndex}</span></div>
                              <div className="truncate" title={details.publicChain.decodedVoteCast.voteHash}><span className="font-semibold">VoteHash(bytes32):</span> <span className="font-mono">{details.publicChain.decodedVoteCast.voteHash}</span></div>
                              <div className="truncate" title={details.publicChain.decodedVoteCast.voter}><span className="font-semibold">Voter:</span> <span className="font-mono">{details.publicChain.decodedVoteCast.voter}</span></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[12px] text-sky-900/80">
                        {details.publicChain?.reason || 'No public-chain transaction linked yet.'}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicLedger;
