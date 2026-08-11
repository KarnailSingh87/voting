import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { toast } from 'react-toastify';
import axios from '../../utils/axios';
import io from 'socket.io-client';
import LanguageSelector from '../../components/LanguageSelector';
import { useTranslation } from 'react-i18next';

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

const PublicDashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [elections, setElections] = useState([]);
  const [electionFilter, setElectionFilter] = useState('active');
  const [photoModal, setPhotoModal] = useState({ show: false, url: null, name: '' });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [theme, setTheme] = useState('light');
  // retry UI states removed — retries now run silently in background

  // Theme initialization (defaults to light mode across all devices unless explicitly set in localStorage)
  useEffect(() => {
    const stored = localStorage.getItem('voterTheme');
    if (stored === 'dark') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('voterTheme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  // Check if user is logged in
  useEffect(() => {
    const token = localStorage.getItem('voterToken');
    setIsLoggedIn(!!token);
  }, []);

  useEffect(() => {
    // Initialize WebSocket connection (stats updates only)
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('voteUpdate', () => {
      // Update statistics only
      setStats(prevStats => ({
        ...prevStats,
        totalVotes: (prevStats?.totalVotes || 0) + 1,
        recentVotes: (prevStats?.recentVotes || 0) + 1
      }));
    });

    socket.on('electionUpdate', () => {
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

    // Live viewer count updates from server
    socket.on('viewerCount', (data) => {
      try {
        const count = (data && typeof data.connectedClients === 'number') ? data.connectedClients : 0;
        setStats(prev => ({ ...(prev || {}), connectedClients: count }));
      } catch (e) { /* ignore */ }
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
    try {
      setError('');

      const [statsResponse, electionsResponse] = await Promise.all([
  fetchWithRetries('/api/stats', tries),
  fetchWithRetries('/api/election', tries)
      ]);

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
      // show a non-blocking toast notification instead of a persistent banner
      try { toast.warn('Unable to reach public API — retrying in background'); } catch (e) { console.warn('Toast failed', e); }
      setError('');
    } finally {
      setLoading(false);
    }
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

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('voterToken');
    setIsLoggedIn(false);
    navigate('/login');
  };

  const statLabelClass = theme === 'dark' ? 'text-white' : 'text-gray-500';
  const statValueClass = theme === 'dark' ? 'text-white' : 'text-gray-900';
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
  <div className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Navigation */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-cyan-700">{t('brand') || 'BlockBallot'}</h1>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`${activeTab === 'overview' ? 'border-cyan-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-white'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {t('nav.elections')}
                </button>
                {/* Public Ledger removed per request */}
                <button
                  onClick={() => setActiveTab('elections')}
                  className={`${activeTab === 'elections' ? 'border-cyan-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-white'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {t('nav.overview')}
                </button>
              </div>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-2">
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title="Toggle theme"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}
                className="rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 hover:border-cyan-300 transition-all duration-200"
              >
                {theme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5a1 1 0 011 1V7a1 1 0 11-2 0V5.5a1 1 0 011-1zM6.22 6.22a1 1 0 011.415 0L8.64 7.225a1 1 0 11-1.415 1.414L6.22 7.636a1 1 0 010-1.415zM4.5 12a1 1 0 011-1H7a1 1 0 110 2H5.5a1 1 0 01-1-1zM6.22 17.78a1 1 0 010-1.415l1.005-1.005a1 1 0 111.415 1.415L7.636 18.8a1 1 0 01-1.415 0zM12 18.5a1 1 0 011 1V20a1 1 0 11-2 0v-.5a1 1 0 011-1zM17.78 17.78a1 1 0 011.415 0l1.005 1.005a1 1 0 11-1.415 1.415L17.78 19.2a1 1 0 010-1.415zM18.5 12a1 1 0 011-1H20a1 1 0 110 2h-.5a1 1 0 01-1-1zM17.78 6.22a1 1 0 00-1.415-1.415L15.36 6.225a1 1 0 001.415 1.414l1.005-1.005zM12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                )}
              </button>
              {isLoggedIn ? (
                <>
                  <button
                    onClick={handleGoToDashboard}
                    className="bg-cyan-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={handleLogout}
                    className="bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="ml-2 bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
                >
                  <span className="sr-only">Login</span>
                  <span className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-800 font-medium">
                    Login
                  </span>
                </button>
              )}
            </div>
            {/* Mobile theme toggle (visible only on small screens) */}
            <div className="flex items-center sm:hidden space-x-2">
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}
                className="rounded-md border border-gray-200 bg-gray-50 text-gray-600 hover:text-cyan-600 hover:bg-cyan-50 transition-all"
              >
                {theme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5a1 1 0 011 1V7a1 1 0 11-2 0V5.5a1 1 0 011-1zM6.22 6.22a1 1 0 011.415 0L8.64 7.225a1 1 0 11-1.415 1.414L6.22 7.636a1 1 0 010-1.415zM4.5 12a1 1 0 011-1H7a1 1 0 110 2H5.5a1 1 0 01-1-1zM6.22 17.78a1 1 0 010-1.415l1.005-1.005a1 1 0 111.415 1.415L7.636 18.8a1 1 0 01-1.415 0zM12 18.5a1 1 0 011 1V20a1 1 0 11-2 0v-.5a1 1 0 011-1zM17.78 17.78a1 1 0 011.415 0l1.005 1.005a1 1 0 11-1.415 1.415L17.78 19.2a1 1 0 010-1.415zM18.5 12a1 1 0 011-1H20a1 1 0 110 2h-.5a1 1 0 01-1-1zM17.78 6.22a1 1 0 00-1.415-1.415L15.36 6.225a1 1 0 001.415 1.414l1.005-1.005zM12 8a4 4 0 100 8 4 4 0 000-8z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                )}
              </button>
              {isLoggedIn ? (
                <button
                  onClick={handleGoToDashboard}
                  className="bg-cyan-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-cyan-700"
                >
                  Dashboard
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  className="bg-cyan-100 text-cyan-800 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-cyan-200"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{t('publicDashboard.title')}</h1>
                <p className="mt-1 text-xs sm:text-sm text-gray-900 dark:text-white">{t('publicDashboard.subtitle')}</p>
                <p className="mt-2 text-xs text-gray-900 dark:text-white">{t('publicDashboard.note')}</p>
              </div>
              <div className="text-left sm:text-right text-xs sm:text-sm text-gray-500 dark:text-white">
                <div className="mb-2">
                  <LanguageSelector />
                </div>
                <div className="dark:text-white">{t('lastUpdated')}</div>
                <div className="font-mono last-updated-digital dark:text-white">{lastUpdated ? formatLastUpdated(lastUpdated) : '—'}</div>
                {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
              </div>
            </div>

            {/* Mobile tabs (visible only on small screens) */}
            <div className="flex sm:hidden mt-4 border-b">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`flex-1 py-2 text-center text-sm font-medium border-b-2 ${activeTab === 'overview' ? 'border-cyan-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-white'}`}
                >
                {t('nav.elections')}
              </button>
              <button
                onClick={() => setActiveTab('elections')}
                  className={`flex-1 py-2 text-center text-sm font-medium border-b-2 ${activeTab === 'elections' ? 'border-cyan-500 text-gray-900 dark:text-white' : 'border-transparent text-gray-500 dark:text-white'}`}
              >
                {t('nav.overview')}
              </button>
            </div>
          </div>

          

          {activeTab === 'overview' && (
            <div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
                <div className="bg-white dark:bg-slate-900 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-cyan-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className={`text-sm font-medium ${statLabelClass} truncate`}>Total Votes</dt>
                          <dd className="flex items-baseline">
                            <div className={`text-2xl font-semibold ${statValueClass}`}>
                              {loading ? '—' : (stats?.totalVotes ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className={`text-sm font-medium ${statLabelClass} truncate`}>Active Elections</dt>
                          <dd className="flex items-baseline">
                            <div className={`text-2xl font-semibold ${statValueClass}`}>
                              {loading ? '—' : (stats?.activeElections ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className={`text-sm font-medium ${statLabelClass} truncate`}>Recent Votes (24h)</dt>
                          <dd className="flex items-baseline">
                            <div className={`text-2xl font-semibold ${statValueClass}`}>
                              {loading ? '—' : (stats?.recentVotes ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 overflow-hidden shadow rounded-lg">
                  <div className="px-4 py-5 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 bg-purple-100 rounded-md p-3">
                        <svg className="h-6 w-6 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className={`text-sm font-medium ${statLabelClass} truncate`}>Connected Viewers</dt>
                          <dd className="flex items-baseline">
                            <div className={`text-2xl font-semibold ${statValueClass}`}>
                              {loading ? '—' : (stats?.connectedClients ?? 0)}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 shadow rounded-lg p-4">
                <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-white">{t('nav.elections')}</h3>
                <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm text-gray-900 dark:text-white">Filter:</label>
                    <select value={electionFilter} onChange={e => setElectionFilter(e.target.value)} className="border rounded px-2 py-1 text-sm dark:bg-slate-900 dark:text-white dark:border-slate-700">
                      <option value="all">All</option>
                      <option value="active">Active</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div className="text-sm text-gray-900 dark:text-white">{elections.length} {elections.length === 1 ? 'Election' : 'Elections'}</div>
                </div>

                {elections.filter(ev => {
                  if (electionFilter === 'all') return true;
                  if (electionFilter === 'active') return (ev.status === 'active' || ev.status === 'ongoing');
                  if (electionFilter === 'upcoming') return (ev.status === 'draft' || ev.status === 'scheduled');
                  if (electionFilter === 'completed') return (ev.status === 'completed' || ev.status === 'ended');
                  return true;
                }).length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-white">No elections match the filter</div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {elections.filter(ev => {
                      if (electionFilter === 'all') return true;
                      if (electionFilter === 'active') return (ev.status === 'active' || ev.status === 'ongoing');
                      if (electionFilter === 'upcoming') return (ev.status === 'draft' || ev.status === 'scheduled');
                      if (electionFilter === 'completed') return (ev.status === 'completed' || ev.status === 'ended');
                      return true;
                    }).map(ev => (
                        <div key={ev._id} className="border rounded p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 dark:border-slate-700">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold text-gray-900 break-words dark:text-white">{ev.title}</div>
                            <div>
                              {ev.status === 'active' || ev.status === 'ongoing' ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-white rounded text-xs">Active</span>
                              ) : ev.status === 'draft' || ev.status === 'scheduled' ? (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-white rounded text-xs">Upcoming</span>
                              ) : ev.status === 'completed' || ev.status === 'ended' ? (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-white rounded text-xs">Completed</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-sm text-gray-900 dark:text-white">{ev.description}</div>
                          <div className="text-xs text-gray-900 dark:text-white mt-1">{formatLastUpdated(ev.startDate)} — {formatLastUpdated(ev.endDate)}</div>
                          <div className="mt-2 text-sm">
                            {ev.candidates && ev.candidates.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-2">
                                {ev.candidates.map(c => (
                                  <div key={c.id} className="flex items-center space-x-1 px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-xs text-gray-900 dark:text-white">
                                    {c.photoUrl ? (
                                      <img 
                                        src={getImageUrl(c.photoUrl)} 
                                        alt={c.name} 
                                        className="w-6 h-6 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all"
                                        onClick={() => setPhotoModal({ show: true, url: getImageUrl(c.photoUrl), name: c.name })}
                                        onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                                      />
                                    ) : null}
                                    <div 
                                      className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-[10px] text-gray-900 dark:text-white"
                                      style={c.photoUrl ? { display: 'none' } : {}}
                                    >
                                      {(c.name || '').split(' ').map(s => s[0]).slice(0,2).join('')}
                                    </div>
                                    <span className="text-gray-900 dark:text-white">{c.name}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (<span className="text-xs text-gray-400 dark:text-white">No candidates</span>)}
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end space-y-2">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {ev.candidates?.reduce((s,c)=>s+(c.voteCount||0),0)} votes
                          </div>
                          <button
                            onClick={() => navigate(`/public/election/${ev._id}`)}
                            className="text-xs px-2 py-1 bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100 dark:bg-cyan-900 dark:text-white dark:hover:bg-cyan-800"
                          >
                            View results
                          </button>
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
              <div className="bg-white dark:bg-slate-900 shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">About This System</h3>
                  <p className="mt-1 max-w-2xl text-sm text-gray-900 dark:text-white">Secure & Transparent Online Voting System</p>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 dark:bg-slate-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-900 dark:text-white">Security</dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">
                        All votes are encrypted and cryptographically separated from voter identity. The system uses end-to-end encryption and maintains an immutable audit trail.
                      </dd>
                    </div>
                    <div className="bg-white dark:bg-slate-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-900 dark:text-white">Transparency</dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">
                        The public ledger shows anonymized vote hashes that can be independently verified. No personal information is exposed in the public ledger.
                      </dd>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-900 dark:text-white">Verification</dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">
                        Voters receive a unique confirmation ID after casting their vote, which can be used to verify their vote was recorded correctly without revealing how they voted.
                      </dd>
                    </div>
                    <div className="bg-white dark:bg-slate-900 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-900 dark:text-white">Privacy</dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">
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

export default PublicDashboard;