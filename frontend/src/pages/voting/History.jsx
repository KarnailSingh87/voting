import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import VoterNavbar from '../../components/VoterNavbar';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

// Helper to get full image URL (handles both absolute and relative URLs)
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

/* ─── Inline Election Results (podium-style like Public Dashboard) ─── */
const ElectionResults = ({ electionId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!electionId) return;
    const fetchResults = async () => {
      try {
        const res = await axios.get(`/api/election/${electionId}`);
        if (res.data?.success) {
          const candidates = (res.data.candidates || []).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
          const totalVotes = res.data.totalVotes || candidates.reduce((s, c) => s + (c.voteCount || 0), 0);
          setData({ election: res.data.election, candidates, totalVotes });
        } else {
          setError('Could not load results');
        }
      } catch {
        setError('Failed to load results');
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [electionId]);

  if (loading) return (
    <div className="flex justify-center py-6">
      <svg className="animate-spin h-6 w-6 text-cyan-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  );
  if (error) return <div className="text-sm text-red-500 py-3 text-center">{error}</div>;
  if (!data || data.candidates.length === 0) return <div className="text-sm text-gray-400 py-3 text-center">No results available</div>;

  const { candidates, totalVotes } = data;
  const isCompleted = data.election?.status === 'ended' || data.election?.status === 'completed';

  const rankConfig = {
    1: { bg: 'bg-gradient-to-br from-yellow-50 to-amber-50', border: 'border-yellow-400', ring: 'ring-yellow-400', badge: 'bg-yellow-400 text-yellow-900', icon: '🥇', label: '1st', barColor: '#f59e0b' },
    2: { bg: 'bg-gradient-to-br from-gray-50 to-slate-100', border: 'border-gray-300', ring: 'ring-gray-400', badge: 'bg-gray-400 text-white', icon: '🥈', label: '2nd', barColor: '#9ca3af' },
    3: { bg: 'bg-gradient-to-br from-orange-50 to-amber-50', border: 'border-orange-300', ring: 'ring-orange-300', badge: 'bg-orange-400 text-white', icon: '🥉', label: '3rd', barColor: '#fb923c' },
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">
          {isCompleted ? '🏆 Final Results' : '📊 Current Standings'}
        </h4>
        <span className="text-xs text-gray-500">{totalVotes} total votes</span>
      </div>

      {/* Top 3 podium cards */}
      {isCompleted && candidates.length >= 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {candidates.slice(0, 3).map((c, idx) => {
            const count = c.voteCount || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
            const cfg = rankConfig[idx + 1];
            return (
              <div key={c.id} className={`relative rounded-lg border ${cfg.border} ${cfg.bg} p-3 flex flex-col items-center text-center`}>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge} mb-2`}>{cfg.icon} {cfg.label}</span>
                {c.photoUrl ? (
                  <img src={getImageUrl(c.photoUrl)} alt={c.name} className={`w-12 h-12 rounded-full object-cover ring-2 ${cfg.ring}`}
                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }} />
                ) : null}
                <div className="w-12 h-12 rounded-full bg-white ring-2 ring-gray-200 flex items-center justify-center text-sm font-bold text-gray-500"
                  style={c.photoUrl ? { display: 'none' } : {}}>
                  {(c.name || '').split(' ').map(s => s[0]).slice(0, 2).join('')}
                </div>
                <div className="font-semibold text-sm text-gray-900 mt-1 truncate w-full">{c.name}</div>
                {c.party && <div className="text-[10px] text-gray-500 truncate w-full">{c.party}</div>}
                <div className="text-xl font-extrabold text-gray-900 mt-1">{count}</div>
                <div className="text-[10px] text-gray-500">{pct}%</div>
                <div className="w-full mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.barColor }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Remaining / all candidates list (for ongoing elections show all, for completed show 4+) */}
      {(() => {
        const listCandidates = isCompleted ? candidates.slice(3) : candidates;
        const startRank = isCompleted ? 4 : 1;
        if (listCandidates.length === 0) return null;
        return (
          <div className="space-y-1.5">
            {listCandidates.map((c, idx) => {
              const count = c.voteCount || 0;
              const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
              const rank = startRank + idx;
              const isLeading = rank === 1;
              return (
                <div key={c.id} className={`flex items-center p-2 rounded-lg ${isLeading ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 mr-2 flex-shrink-0">{rank}</div>
                  {c.photoUrl ? (
                    <img src={getImageUrl(c.photoUrl)} alt={c.name} className="w-8 h-8 rounded-full object-cover mr-2 flex-shrink-0"
                      onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }} />
                  ) : null}
                  <div className="w-8 h-8 rounded-full bg-gray-200 mr-2 flex-shrink-0 flex items-center justify-center text-xs text-gray-600"
                    style={c.photoUrl ? { display: 'none' } : {}}>
                    {(c.name || '').split(' ').map(s => s[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.name} {isLeading && <span className="text-green-600 text-xs ml-1">(Leading)</span>}</div>
                    <div className="w-full h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-gray-900">{count}</div>
                    <div className="text-[10px] text-gray-500">{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
};

const History = () => {
  const navigate = useNavigate();
  const [voteHistory, setVoteHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedElection, setExpandedElection] = useState(null);

  const toggleResults = useCallback((electionId) => {
    setExpandedElection(prev => prev === electionId ? null : electionId);
  }, []);

  useEffect(() => {
    const fetchVoteHistory = async () => {
      try {
        const token = localStorage.getItem('voterToken');
        const response = await axios.get('/api/voter/history', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          // Sort by timestamp descending — latest vote on top
          const sorted = (response.data.voteHistory || []).sort(
            (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
          );
          setVoteHistory(sorted);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem('voterToken');
          navigate('/login');
        } else {
          setError('Failed to fetch Voting history');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchVoteHistory();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50">
      <VoterNavbar />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Voting History</h1>
            <p className="mt-1 text-sm text-gray-500">
              View your Voting history and verify your votes
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
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <div className="mt-2 text-sm text-red-700"><p>{error}</p></div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {voteHistory.length === 0 ? (
                  <li className="px-6 py-12 text-center">
                    <svg className="mx-auto h-10 w-10 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="mt-2 text-sm font-medium text-gray-500">No voting history yet</p>
                    <p className="mt-1 text-xs text-gray-400">Your votes will appear here after you participate in elections.</p>
                  </li>
                ) : (
                  voteHistory.map((vote, index) => (
                    <li key={vote.confirmationId}>
                      <div className="px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1 min-w-0">
                            {/* Candidate Photo */}
                            {vote.candidatePhotoUrl ? (
                              <img 
                                src={getImageUrl(vote.candidatePhotoUrl)} 
                                alt={vote.candidateName} 
                                className="w-12 h-12 rounded-full object-cover mr-4 flex-shrink-0 ring-2 ring-cyan-200"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = 'none';
                                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div 
                              className="w-12 h-12 rounded-full bg-cyan-100 mr-4 flex-shrink-0 flex items-center justify-center text-cyan-700 text-sm font-bold"
                              style={vote.candidatePhotoUrl ? { display: 'none' } : {}}
                            >
                              {(vote.candidateName || '').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-lg font-medium text-gray-900 truncate">
                                {vote.election.title}
                              </h3>
                              <div className="mt-1 flex items-center text-sm text-gray-700">
                                <svg className="flex-shrink-0 mr-1.5 h-5 w-5 text-cyan-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>You voted for: <strong className="text-gray-900">{vote.candidateName}</strong></span>
                              </div>
                              <p className="mt-1 text-sm text-gray-500">
                                {new Date(vote.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(vote.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0 flex flex-col items-end space-y-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <svg className="-ml-0.5 mr-1.5 h-3 w-3 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              Voted
                            </span>
                            {index === 0 && (
                              <span className="text-[10px] text-cyan-600 font-medium">Latest</span>
                            )}
                            <button
                              onClick={() => toggleResults(vote.electionId)}
                              className="mt-1 inline-flex items-center text-xs text-cyan-600 hover:text-cyan-800 font-medium transition-colors"
                            >
                              <svg className={`w-3.5 h-3.5 mr-1 transition-transform duration-200 ${expandedElection === vote.electionId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              {expandedElection === vote.electionId ? 'Hide Results' : 'View Results'}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Election Results */}
                        {expandedElection === vote.electionId && (
                          <ElectionResults electionId={vote.electionId} />
                        )}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default History;