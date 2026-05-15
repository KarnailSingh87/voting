import { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import PropTypes from 'prop-types';
import { useParams, Link } from 'react-router-dom';
import axios from '../../utils/axios';

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

const PAGE_SIZE = 20;

const PublicElection = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [page, setPage] = useState(1);
  const [socketConnected, setSocketConnected] = useState(false);
  const [photoModal, setPhotoModal] = useState({ show: false, url: null, name: '' });
  const [resultProof, setResultProof] = useState(null);
  const [onChainStatus, setOnChainStatus] = useState(null);
  const [csvUrl, setCsvUrl] = useState('');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true); setError('');
      try {
        const res = await axios.get(`/api/election/${id}`);
        if (res.data && res.data.success) {
          setElection(res.data.election);
          setCandidates(res.data.candidates || []);
          setTotalVotes(res.data.totalVotes || (res.data.candidates||[]).reduce((s,c)=>s+(c.voteCount||0),0));
          setResultProof(res.data.resultProof || null);
          setOnChainStatus(res.data.onChainStatus || null);
          setCsvUrl(res.data.csvUrl || '');
        } else {
          setError(res.data?.message || 'Failed to load election');
        }
      } catch (e) {
        console.error('Failed to fetch public election', e);
        setError(e.response?.data?.message || 'Failed to load election');
      } finally { setLoading(false); }
    };
    if (id) fetch();
  }, [id]);

  // sort and paginate candidates — keep hooks stable by calling on every render
  const sorted = useMemo(() => [...candidates].sort((a,b)=> (b.voteCount||0) - (a.voteCount||0)), [candidates]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const winnerId = sorted[0]?.id;

  // Check if election is completed/ended
  const isCompleted = election?.status === 'ended' || election?.status === 'completed';

  const resolvedCsvUrl = (() => {
    if (csvUrl) {
      if (csvUrl.startsWith('http://') || csvUrl.startsWith('https://')) return csvUrl;
      return `${backendUrl}${csvUrl}`;
    }
    return `${backendUrl}/api/election/${id}/results.csv`;
  })();

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  // live updates when election is ongoing
  useEffect(() => {
    if (!election || election.status !== 'ongoing') return;
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');
    const onVote = (payload) => {
      try {
        const { candidateId, voteCount } = payload || {};
        if (!candidateId) return;
        setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, voteCount } : c));
        // recompute total votes from candidates for robustness
        setTotalVotes(prev => {
          // best-effort increment if candidate found, fallback to recompute
          const found = candidates.find(c => c.id === candidateId);
          if (found) return prev + 1;
          return [...candidates].reduce((s, c) => s + (c.voteCount || 0), 0);
        });
      } catch (e) { console.warn('live update error', e); }
    };
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('vote_cast', onVote);
    return () => socket.disconnect();
  }, [election, id, candidates]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!election) return <div className="p-6">Election not found</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold break-words">{election.title}</h2>
          <p className="text-sm text-gray-600">{election.description}</p>
          <div className="mt-2 text-sm text-gray-700">Status: <strong>{election.status}</strong></div>
        </div>
        <div className="flex-shrink-0">
          <Link to="/public" className="px-3 py-2 bg-gray-100 rounded text-sm">Back to list</Link>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Result transparency</h3>
            <p className="text-xs text-gray-500">Signed results hash, CSV download, and on-chain verification summary.</p>
          </div>
          <a
            href={resolvedCsvUrl}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md bg-cyan-600 text-white hover:bg-cyan-700"
            download
          >
            Download CSV
          </a>
        </div>

        <div className="space-y-4">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Result Hash (SHA-256)</div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs font-mono text-gray-700 break-all">
                {resultProof?.hash || '—'}
              </div>
              <button
                onClick={() => handleCopy(resultProof?.hash)}
                className="px-2 py-1 text-xs rounded border text-gray-600 hover:bg-gray-50"
              >
                Copy hash
              </button>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">Scope: {resultProof?.scope || 'results-csv-v1'}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">Result Signature (HMAC)</div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs font-mono text-gray-700 break-all">
                {resultProof?.signature || '—'}
              </div>
              <button
                onClick={() => handleCopy(resultProof?.signature)}
                className="px-2 py-1 text-xs rounded border text-gray-600 hover:bg-gray-50"
              >
                Copy signature
              </button>
            </div>
            <div className="mt-2 text-[11px] text-gray-400">Signed at: {resultProof?.signedAt ? new Date(resultProof.signedAt).toLocaleString() : '—'}</div>
          </div>

          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-2">On-chain verification status</div>
            {onChainStatus?.available ? (
              <div className="flex flex-col gap-2">
                <div className={`text-sm font-semibold ${onChainStatus?.matched ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {onChainStatus?.matched ? 'Matched with on-chain results' : 'Mismatch detected'}
                </div>
                <div className="text-xs text-gray-500">
                  Network: {onChainStatus?.network || 'unknown'} (Chain ID: {onChainStatus?.chainId ?? '—'})
                </div>
                <div className="text-xs text-gray-500">
                  Total votes — Local: {onChainStatus?.totals?.local ?? totalVotes} / On-chain: {onChainStatus?.totals?.onChain ?? '—'}
                </div>
                {!onChainStatus?.matched && onChainStatus?.mismatches?.length ? (
                  <div className="text-xs text-gray-600">
                    {onChainStatus.mismatches.length} candidate(s) differ from on-chain results.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                {onChainStatus?.connected ? (onChainStatus?.reason || 'On-chain verification unavailable') : 'Web3 not connected for verification.'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4 sm:p-6 mt-6">
        <h3 className="font-medium mb-4">
          {election.status === 'ongoing' ? (
            <span className="flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span>Live overview {socketConnected ? '(connected)' : '(connecting...)'}</span>
            </span>
          ) : isCompleted ? (
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-gray-900"><span aria-hidden="true">🏆</span> Final Results</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Completed</span>
            </div>
          ) : (
            'Results'
          )}
        </h3>
        {candidates.length === 0 ? (
          <div className="text-sm text-gray-500">No candidates</div>
        ) : isCompleted ? (
          /* ─── COMPLETED ELECTION: Ranked list with podium design ─── */
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
              <div className="text-sm text-gray-600">{sorted.length} candidates</div>
              <div className="text-sm font-semibold text-gray-700">Total votes cast: {totalVotes}</div>
            </div>

            {/* Top 3 podium cards */}
            {sorted.length >= 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {sorted.slice(0, 3).map((c, idx) => {
                  const count = c.voteCount || 0;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
                  const rank = idx + 1;
                  
                  const rankConfig = {
                    1: { 
                      bg: 'bg-gradient-to-br from-yellow-50 to-amber-50', 
                      border: 'border-yellow-400', 
                      ring: 'ring-yellow-400',
                      badge: 'bg-yellow-400 text-yellow-900', 
                      icon: '🥇',
                      label: '1st Place — Winner',
                      barColor: '#f59e0b',
                      shadow: 'shadow-lg shadow-yellow-200/50'
                    },
                    2: { 
                      bg: 'bg-gradient-to-br from-gray-50 to-slate-100', 
                      border: 'border-gray-400', 
                      ring: 'ring-gray-400',
                      badge: 'bg-gray-400 text-white', 
                      icon: '🥈',
                      label: '2nd Place',
                      barColor: '#9ca3af',
                      shadow: 'shadow-md shadow-gray-200/50'
                    },
                    3: { 
                      bg: 'bg-gradient-to-br from-orange-50 to-amber-50', 
                      border: 'border-orange-400', 
                      ring: 'ring-orange-300',
                      badge: 'bg-orange-400 text-white', 
                      icon: '🥉',
                      label: '3rd Place',
                      barColor: '#fb923c',
                      shadow: 'shadow-md shadow-orange-200/50'
                    },
                  };
                  const cfg = rankConfig[rank];

                  return (
                    <div key={c.id} className={`relative rounded-xl border-2 ${cfg.border} ${cfg.bg} ${cfg.shadow} p-4 flex flex-col items-center text-center`}>
                      {/* Rank badge */}
                      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold ${cfg.badge}`}>
                        {cfg.icon} {cfg.label}
                      </div>

                      {/* Candidate photo */}
                      <div className="mt-4 mb-3">
                        {c.photoUrl ? (
                          <img 
                            src={getImageUrl(c.photoUrl)} 
                            alt={c.name} 
                            className={`w-20 h-20 rounded-full object-cover ring-4 ${cfg.ring} cursor-pointer hover:scale-105 transition-transform`}
                            onClick={() => setPhotoModal({ show: true, url: getImageUrl(c.photoUrl), name: c.name })}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className={`w-20 h-20 rounded-full bg-white ring-4 ${cfg.ring} flex items-center justify-center text-xl font-bold text-gray-500`}
                          style={c.photoUrl ? { display: 'none' } : {}}
                        >
                          {(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                        </div>
                      </div>

                      {/* Name & party */}
                      <div className="font-bold text-base sm:text-lg text-gray-900 truncate w-full">{c.name}</div>
                      {c.party && <div className="text-xs text-gray-500 truncate w-full">{c.party}</div>}

                      {/* Vote count */}
                      <div className="mt-3 text-3xl font-extrabold text-gray-900">{count}</div>
                      <div className="text-xs text-gray-500">votes ({pct}%)</div>

                      {/* Progress bar */}
                      <div className="w-full mt-3">
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.barColor }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Remaining candidates as a ranked list */}
            {sorted.length > 3 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <h4 className="text-sm font-semibold text-gray-700">Other Candidates</h4>
                </div>
                <ul className="divide-y divide-gray-100">
                  {sorted.slice(3).map((c, idx) => {
                    const rank = idx + 4;
                    const count = c.voteCount || 0;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
                    return (
                      <li key={c.id} className="flex items-center px-4 py-3 hover:bg-gray-50 transition-colors">
                        {/* Rank number */}
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 mr-3 flex-shrink-0">
                          {rank}
                        </div>

                        {/* Photo */}
                        {c.photoUrl ? (
                          <img 
                            src={getImageUrl(c.photoUrl)} 
                            alt={c.name} 
                            className="w-10 h-10 rounded-full object-cover mr-3 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                            onClick={() => setPhotoModal({ show: true, url: getImageUrl(c.photoUrl), name: c.name })}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-10 h-10 rounded-full bg-gray-200 mr-3 flex-shrink-0 flex items-center justify-center text-sm text-gray-600"
                          style={c.photoUrl ? { display: 'none' } : {}}
                        >
                          {(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                        </div>

                        {/* Name & party */}
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="font-medium text-gray-900 truncate">{c.name}</div>
                          {c.party && <div className="text-xs text-gray-500 truncate">{c.party}</div>}
                        </div>

                        {/* Vote bar + count */}
                        <div className="flex items-center space-x-3 flex-shrink-0">
                          <div className="hidden sm:block w-24">
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-indigo-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="text-right min-w-[60px]">
                            <div className="font-bold text-gray-900">{count}</div>
                            <div className="text-[10px] text-gray-500">{pct}%</div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : (
          /* ─── ONGOING / SCHEDULED: Grid card layout (existing) ─── */
          <div className="space-y-4">
            {/* compact summary header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="text-sm text-gray-600">Showing {paged.length} of {candidates.length} candidates</div>
              <div className="text-sm font-semibold">Total votes: {totalVotes}</div>
            </div>

            {/* candidate list */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {paged.map(c => {
                const count = c.voteCount || 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
                const isWinner = c.id === winnerId;
                return (
                  <div key={c.id} className={`p-3 rounded border ${isWinner ? 'bg-green-50 border-green-300' : 'bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        {c.photoUrl ? (
                          <img 
                            src={getImageUrl(c.photoUrl)} 
                            alt={c.name} 
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover mr-3 flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                            onClick={() => setPhotoModal({ show: true, url: getImageUrl(c.photoUrl), name: c.name })}
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div 
                          className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gray-200 mr-3 flex-shrink-0 flex items-center justify-center text-sm text-gray-600"
                          style={c.photoUrl ? { display: 'none' } : {}}
                        >
                          {(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-base sm:text-lg truncate">{c.name} {isWinner && <span className="text-sm text-green-700 ml-2">(Leading)</span>}</div>
                          <div className="text-xs text-gray-500 truncate">{c.party}</div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold">{count}</div>
                    </div>

                    {/* simple spark / bar using inline SVG */}
                    <div className="mt-3">
                      <svg width="100%" height="24" viewBox="0 0 100 10" preserveAspectRatio="none" className="rounded overflow-hidden">
                        <rect x="0" y="0" width="100" height="10" fill="#f3f4f6" />
                        <rect x="0" y="0" width={`${pct}`} height="10" fill={isWinner ? '#10b981' : '#6366f1'} />
                      </svg>
                      <div className="mt-1 text-xs text-gray-600">{pct}% of votes</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 mt-4">
                <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>Prev</button>
                <div className="text-sm">Page {page} of {totalPages}</div>
                <button className="px-3 py-1 border rounded disabled:opacity-50" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>Next</button>
              </div>
            )}
          </div>
        )}
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

export default PublicElection;
