import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import io from 'socket.io-client';

let socket;

const PublicDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [elections, setElections] = useState([]);
  const [electionFilter, setElectionFilter] = useState('all');
  // retry UI states removed — retries now run silently in background

  useEffect(() => {
    // Initialize WebSocket connection (stats updates only)
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('voteUpdate', (data) => {
      // Update statistics only
      setStats(prevStats => ({
        ...prevStats,
        totalVotes: (prevStats?.totalVotes || 0) + 1,
        recentVotes: (prevStats?.recentVotes || 0) + 1
      }));
    });

    socket.on('electionUpdate', (data) => {
      // Refresh elections list optimistically
      (async () => {
        try {
          const res = await axios.get('/api/election');
          if (res?.data?.success) {
            const list = res.data.elections || [];
            const rank = (s) => (s === 'active' || s === 'ongoing') ? 0 : (s === 'scheduled' || s === 'draft') ? 1 : 2;
            list.sort((a, b) => {
              const r = rank(a.status) - rank(b.status);
              if (r !== 0) return r;
              return new Date(a.startDate || a.startTime || 0).getTime() - new Date(b.startDate || b.startTime || 0).getTime();
            });
            setElections(list);
          }
        } catch (e) { /* ignore */ }
      })();
    });

    socket.on('systemStatus', (data) => {
      console.log('System status update received:', data);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetching function can be reused for retry and interval
  const fetchWithRetries = useCallback(async (url, tries = 3, baseDelay = 400) => {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await axios.get(url);
        return res;
      } catch (e) {
        lastErr = e;
        // exponential backoff
        if (i < tries - 1) await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
      }
    }
    throw lastErr;
  }, []);

  const fetchLatest = useCallback(async ({tries = 3} = {}) => {
    let isMounted = true;
    try {
      setError('');

      const [statsResponse, electionsResponse] = await Promise.all([
  fetchWithRetries('/api/stats', tries),
  fetchWithRetries('/api/election', tries)
      ]);

      if (!isMounted) return;

      if (statsResponse?.data?.success) setStats(statsResponse.data.statistics);
      if (electionsResponse?.data?.success) {
        const list = electionsResponse.data.elections || [];
        // sort so live/active elections are on top
        const rank = (s) => (s === 'active' || s === 'ongoing') ? 0 : (s === 'scheduled' || s === 'draft') ? 1 : 2;
        list.sort((a, b) => {
          const r = rank(a.status) - rank(b.status);
          if (r !== 0) return r;
          // fallback: newer start time first
          const da = new Date(a.startDate || a.startTime || 0).getTime();
          const db = new Date(b.startDate || b.startTime || 0).getTime();
          return da - db;
        });
        setElections(list);
      }

      setLastUpdated(new Date());
    } catch (err) {
      // Log and notify via toast; retry/backoff will attempt again in background
      console.error('PublicDashboard fetch error', err?.message || err);
      if (!isMounted) return;
      // show a non-blocking toast notification instead of a persistent banner
      try { toast.warn('Unable to reach public API — retrying in background'); } catch (e) { console.warn('Toast failed', e); }
      setError('');
    } finally {
      if (isMounted) setLoading(false);
    }
    return () => { isMounted = false; };
  }, [fetchWithRetries]);

  useEffect(() => {
    let mounted = true;
    // initial
    (async () => {
      if (!mounted) return;
      setLoading(true);
      await fetchLatest();
    })();

    const interval = setInterval(() => fetchLatest(), 30000); // Update every 30 seconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchLatest]);

  const handleViewVote = (confirmationId) => {
    navigate(`/verify/${confirmationId}`);
  };

  const formatDateTime = (d) => {
    try {
      if (!d) return '—';
      const parsed = Date.parse(String(d));
      if (!Number.isNaN(parsed)) return new Date(parsed).toLocaleString();
      return String(d);
    } catch (e) { return String(d || '—'); }
  };

  // Short, consistent format: DD/MM/YYYY, HH:mm:ss
  const formatLastUpdated = (d) => {
    try {
      if (!d) return '—';
      const date = new Date(d);
      const pad = (n) => String(n).padStart(2, '0');
      const day = pad(date.getDate());
      const month = pad(date.getMonth() + 1);
      const year = date.getFullYear();
      const hours = pad(date.getHours());
      const minutes = pad(date.getMinutes());
      const seconds = pad(date.getSeconds());
      return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch (e) { return formatDateTime(d); }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  if (loading && !stats) {
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
                <h1 className="text-xl font-bold text-cyan-700">SecureVote</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`${activeTab === 'overview' ? 'border-cyan-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Elections
                </button>
                {/* Public Ledger removed per request */}
                <button
                  onClick={() => setActiveTab('elections')}
                  className={`${activeTab === 'elections' ? 'border-cyan-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  Overview
                </button>
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center">
              <button
                onClick={handleLogin}
                className="ml-2 bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
              >
                <span className="sr-only">Login</span>
                <span className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-800 font-medium">
                  Login
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Public Transparency Dashboard</h1>
                <p className="mt-1 text-sm text-gray-500">Real-time view of Voting system activity and immutable ledger</p>
                <p className="mt-2 text-xs text-gray-400">Official record published by SecureVote — Independent, auditable, and privacy preserving.</p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <div>Last updated:</div>
                <div className="font-mono last-updated-digital">{lastUpdated ? formatLastUpdated(lastUpdated) : '—'}</div>
              </div>
            </div>
          </div>

          

          {activeTab === 'overview' && (
            <div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-cyan-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Total Votes</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {loading ? '—' : (stats?.totalVotes ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Active Elections</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {loading ? '—' : (stats?.activeElections ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Recent Votes (24h)</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {loading ? '—' : (stats?.recentVotes ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Connected Viewers</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {loading ? '—' : (stats?.connectedClients ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-4">
                <h3 className="text-lg font-medium mb-3">Elections</h3>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-600">Filter:</label>
                    <select value={electionFilter} onChange={e => setElectionFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="text-sm text-gray-500">{elections.length} elections</div>
                </div>

                {elections.filter(ev => {
                  if (electionFilter === 'all') return true;
                  if (electionFilter === 'active') return (ev.status === 'active' || ev.status === 'ongoing');
                  if (electionFilter === 'upcoming') return (ev.status === 'draft' || ev.status === 'scheduled');
                  if (electionFilter === 'completed') return (ev.status === 'completed' || ev.status === 'ended');
                  return true;
                }).length === 0 ? (
                  <div className="text-sm text-gray-500">No elections match the filter</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {elections.filter(ev => {
                      if (electionFilter === 'all') return true;
                      if (electionFilter === 'active') return (ev.status === 'active' || ev.status === 'ongoing');
                      if (electionFilter === 'upcoming') return (ev.status === 'draft' || ev.status === 'scheduled');
                      if (electionFilter === 'completed') return (ev.status === 'completed' || ev.status === 'ended');
                      return true;
                    }).map(ev => (
                      <div key={ev._id} className="border rounded p-3 flex justify-between items-center">
                        <div>
                          <div className="flex items-center space-x-3">
                            <div className="font-semibold text-gray-900">{ev.title}</div>
                            <div>
                              {ev.status === 'active' || ev.status === 'ongoing' ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">Active</span>
                              ) : ev.status === 'draft' || ev.status === 'scheduled' ? (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs">Upcoming</span>
                              ) : ev.status === 'completed' || ev.status === 'ended' ? (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">Completed</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-sm text-gray-600">{ev.description}</div>
                          <div className="text-xs text-gray-500 mt-1">{formatLastUpdated(ev.startDate)} — {formatLastUpdated(ev.endDate)}</div>
                          <div className="mt-2 text-sm">
                            {ev.candidates && ev.candidates.length > 0 ? (
                              <div className="flex space-x-2">
                                {ev.candidates.map(c => (
                                  <span key={c.id} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">{c.name}</span>
                                ))}
                              </div>
                            ) : (<span className="text-xs text-gray-400">No candidates</span>)}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end space-y-2">
                          <div className="text-sm">{ev.candidates?.reduce((s,c)=>s+(c.voteCount||0),0)} votes</div>
                          <button onClick={() => navigate(`/public/election/${ev._id}`)} className="text-xs px-2 py-1 bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100">View results</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Public Ledger removed */}
          {activeTab === 'elections' && (
            <div>
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">About This System</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-500">Secure & Transparent Online Voting System</p>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Security</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        All votes are encrypted and cryptographically separated from voter identity. The system uses end-to-end encryption and maintains an immutable audit trail.
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Transparency</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        The public ledger shows anonymized vote hashes that can be independently verified. No personal information is exposed in the public ledger.
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Verification</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        Voters receive a unique confirmation ID after casting their vote, which can be used to verify their vote was recorded correctly without revealing how they voted.
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Privacy</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        Your vote is anonymous. The system uses cryptographic techniques to ensure that no one can link your identity to your vote.
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicDashboard;