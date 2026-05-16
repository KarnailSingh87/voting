import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../../utils/axios';
import io from 'socket.io-client';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';

let socket;

const Monitoring = () => {
  const { t } = useTranslation();
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [chainStats, setChainStats] = useState(null);
  const [chainValidation, setChainValidation] = useState(null);
  const [validatingChain, setValidatingChain] = useState(false);
  const [recentBlocks, setRecentBlocks] = useState([]);

  useEffect(() => {
    // Initialize WebSocket connection with better debug/reconnect options
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005', {
      auth: { token: localStorage.getItem('adminToken') },
      // keep retrying forever, but backoff the delay (socket.io default behavior is fine)
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setEvents(prev => [{ time: new Date(), message: t('monitoring.connectedToServer'), type: 'system' }, ...prev]);
    });
    
    socket.on('connect_error', (err) => {
      console.error('WebSocket connect_error', err && (err.message || err));
      setEvents(prev => [{ time: new Date(), message: t('monitoring.wsConnectError', { message: err && err.message ? err.message : String(err) }), type: 'system' }, ...prev]);
    });
    
    socket.on('vote_cast', (data) => {
      // Update vote statistics in real-time
      const msg = t('monitoring.voteCastMessage', { candidateId: data.candidateId, voteCount: data.voteCount });
      console.log('Vote update received:', data);
      setEvents(prev => [{ time: new Date(), message: msg, type: 'vote' }, ...prev].slice(0, 50));
    });
    
    socket.on('election_status', (data) => {
      // Update election status in real-time
      const msg = t('monitoring.electionStatusMessage', { id: data.id, status: data.status });
      console.log('Election update received:', data);
      setEvents(prev => [{ time: new Date(), message: msg, type: 'election' }, ...prev].slice(0, 50));
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setEvents(prev => [{ time: new Date(), message: t('monitoring.disconnectedFromServer'), type: 'system' }, ...prev]);
    });
    
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchHealthData = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const response = await axios.get('/api/admin/health', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          setHealthData(response.data.health);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          // Token expired or invalid, redirect to login
          localStorage.removeItem('adminToken');
          window.location.href = '/';
        } else {
          setError(t('monitoring.fetchHealthError'));
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHealthData();
    
    // Fetch blockchain stats
    const fetchChainStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        // Prefer admin-only stats if logged in
        if (token) {
          const res = await axios.get('/api/admin/blockchain/stats', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.data?.success) {
            setChainStats(res.data);
            return;
          }
        }

        // Fallback to public stats (no auth required)
        const pub = await axios.get('/api/blockchain/stats');
        if (pub.data?.success) {
          // Normalize shape to match expected chainStats used in UI
          setChainStats({
            totalBlocks: pub.data.localChain?.totalBlocks ?? pub.data.total ?? 0,
            latestBlockIndex: pub.data.localChain?.latestBlockIndex ?? pub.data.latestBlockIndex,
            latestBlockHash: pub.data.localChain?.latestBlockHash ?? pub.data.latestBlockHash,
            difficulty: pub.data.localChain?.difficulty ?? pub.data.difficulty ?? 2,
          });
        }
      } catch (err) {
        // Don't throw — keep UI responsive. Log for debugging.
        console.error('Failed to fetch chain stats (admin/public)', err && err.message ? err.message : err);
      }

      // Fetch recent blocks
      try {
        const blocksRes = await axios.get('/api/blockchain/blocks?limit=5');
        if (blocksRes.data?.success) {
          setRecentBlocks(blocksRes.data.blocks || []);
        }
      } catch (e) {
        console.error('Failed to fetch recent blocks', e);
      }
    };
    fetchChainStats();

    // Set up interval for periodic updates
    const interval = setInterval(() => {
      fetchHealthData();
      fetchChainStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleValidateChain = async () => {
    setValidatingChain(true);
    try {
      const token = localStorage.getItem('adminToken');
      const res = await axios.get('/api/admin/blockchain/validate', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) setChainValidation(res.data);
    } catch (e) {
      console.error('Validation request failed:', e);
      setChainValidation({ valid: false, error: e.response?.data?.message || e.message || 'Failed to validate chain' });
    } finally { setValidatingChain(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/';
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  if (loading && !healthData) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar onLogout={handleLogout} />
        
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t('monitoring.title')}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t('monitoring.subtitle')}
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
                    {t('monitoring.errorTitle')}
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {healthData && (
            <div className="grid grid-cols-1 gap-6">
              {/* ─── BLOCKCHAIN INTEGRITY ─────────────────────────── */}
              <div className="bg-white dark:bg-slate-900 shadow-xl overflow-hidden sm:rounded-lg border border-gray-200 dark:border-slate-700">
                <div className="px-4 py-5 sm:px-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🔗</span>
                    <div>
                      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{t('monitoring.blockchainIntegrityTitle')}</h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{t('monitoring.blockchainIntegritySubtitle')}</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleValidateChain} 
                    disabled={validatingChain}
                    className="inline-flex items-center px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {validatingChain ? (
                      <>
                        <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {t('monitoring.validating')}
                      </>
                    ) : `🔍 ${t('monitoring.validateChain')}`}
                  </button>
                </div>
                <div className="border-t border-gray-200 dark:border-slate-700">
                  {chainStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400 font-mono">{chainStats.totalBlocks || 0}</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">{t('monitoring.totalBlocks')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">#{chainStats.latestBlockIndex ?? 0}</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">{t('monitoring.latestBlock')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-purple-600 dark:text-purple-400 font-mono">{chainStats.difficulty || 2}</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">{t('monitoring.difficulty')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-mono text-orange-600 dark:text-orange-400 truncate">{chainStats.latestBlockHash?.slice(0, 12) || '—'}...</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">{t('monitoring.latestHash')}</div>
                      </div>
                    </div>
                  )}
                  {chainValidation && (
                    <div className={`mx-4 mb-4 px-4 py-3 rounded-lg ${chainValidation.valid ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-600/30' : 'bg-red-50 border border-red-200 dark:bg-red-900/30 dark:border-red-600/30'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{chainValidation.valid ? '✅' : '❌'}</span>
                        <div>
                          <div className={`text-sm font-medium ${chainValidation.valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                            {chainValidation.valid ? t('monitoring.chainIntact') : t('monitoring.chainCompromised')}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {chainValidation.message || chainValidation.error || `${chainValidation.chainLength} blocks verified`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {!chainStats && !chainValidation && (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-slate-500">{t('monitoring.loadingBlockchain')}</div>
                  )}
                  {recentBlocks && recentBlocks.length > 0 && (
                    <div className="px-4 pb-4">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">{t('monitoring.recentBlocks')}</h4>
                      <div className="space-y-2">
                        {recentBlocks.map((b) => (
                          <div key={b.hash} className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-200 dark:border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-cyan-100 text-cyan-700 dark:bg-slate-700 dark:text-cyan-300 font-mono text-xs px-2 py-1 rounded">#{b.index}</div>
                              <div className="text-xs text-gray-600 dark:text-slate-300 font-mono truncate max-w-[150px] sm:max-w-[200px]" title={b.hash}>
                                {b.hash.substring(0, 16)}...
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] text-gray-500 dark:text-slate-500 font-mono">
                              <div>{t('monitoring.nonce')}: {b.nonce}</div>
                              <div>{new Date(b.timestamp).toLocaleTimeString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* System Status */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">{t('monitoring.systemStatus')}</h3>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.databaseStatus')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {healthData.databaseStatus}
                        </span>
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.uptime')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {Math.floor(healthData.uptime / 3600)}h {Math.floor((healthData.uptime % 3600) / 60)}m {Math.floor(healthData.uptime % 60)}s
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 dark:text-white">{t('monitoring.lastUpdated')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white sm:mt-0 sm:col-span-2">
                        {new Date().toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Resource Usage */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                  <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">{t('monitoring.memoryUsage')}</h3>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{t('monitoring.rss')}</span>
                          <span className="text-sm text-gray-500">{formatBytes(healthData.memoryUsage.rss)}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-cyan-600 h-2 rounded-full" 
                            style={{ width: `${Math.min((healthData.memoryUsage.rss / (512 * 1024 * 1024)) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{t('monitoring.heapTotal')}</span>
                          <span className="text-sm text-gray-500">{formatBytes(healthData.memoryUsage.heapTotal)}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${Math.min((healthData.memoryUsage.heapTotal / (512 * 1024 * 1024)) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{t('monitoring.heapUsed')}</span>
                          <span className="text-sm text-gray-500">{formatBytes(healthData.memoryUsage.heapUsed)}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${Math.min((healthData.memoryUsage.heapUsed / healthData.memoryUsage.heapTotal) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{t('monitoring.external')}</span>
                          <span className="text-sm text-gray-500">{formatBytes(healthData.memoryUsage.external)}</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ width: `${Math.min((healthData.memoryUsage.external / (256 * 1024 * 1024)) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                  <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">{t('monitoring.cpuUsage')}</h3>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{t('monitoring.userTime')}</span>
                          <span className="text-sm text-gray-500">{healthData.cpuUsage.user} μs</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-600 h-2 rounded-full" 
                            style={{ width: `${Math.min((healthData.cpuUsage.user / 10000000) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">{t('monitoring.systemTime')}</span>
                          <span className="text-sm text-gray-500">{healthData.cpuUsage.system} μs</span>
                        </div>
                        <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-red-600 h-2 rounded-full" 
                            style={{ width: `${Math.min((healthData.cpuUsage.system / 10000000) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">{t('monitoring.performanceMetrics')}</h3>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.apiResponseTime')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className={healthData.apiResponseTime < 100 ? 'text-green-600' : healthData.apiResponseTime < 300 ? 'text-yellow-600' : 'text-red-600'}>
                          {healthData.apiResponseTime.toFixed(2)} ms
                        </span>
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.activeUsers')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {healthData.activeUsers}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.recentErrors')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className={healthData.recentErrors === 0 ? 'text-green-600' : 'text-red-600'}>
                          {healthData.recentErrors}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Security Information */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">{t('monitoring.securityInfo')}</h3>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.encryption')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {t('monitoring.encryptionValue')}
                        </span>
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.authentication')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {t('monitoring.authenticationValue')}
                        </span>
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">{t('monitoring.auditTrail')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          🔗 {t('monitoring.auditTrailValue')}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Real-time Events */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">{t('monitoring.realtimeEvents')}</h3>
                </div>
                <div className="border-t border-gray-200">
                  <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                    {events.length === 0 ? (
                      <li className="px-4 py-4 text-sm text-gray-500">{t('monitoring.noEvents')}</li>
                    ) : (
                      events.map((e, i) => (
                        <li key={i} className="px-4 py-4 sm:px-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-cyan-600 truncate">
                              {e.type === 'vote' ? t('monitoring.eventVoteCast') : e.type === 'election' ? t('monitoring.eventElectionUpdate') : t('monitoring.eventSystemUpdate')}
                            </p>
                            <div className="ml-2 flex-shrink-0 flex">
                              <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                {e.time.toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 sm:flex sm:justify-between">
                            <div className="sm:flex">
                              <p className="flex items-center text-sm text-gray-500">
                                {e.message}
                              </p>
                            </div>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Monitoring;