import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-toastify';
import axios from '../../utils/axios';

const AdminDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chainStats, setChainStats] = useState(null);
  const [chainValidation, setChainValidation] = useState(null);
  const [validatingChain, setValidatingChain] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const response = await axios.get('/api/admin/dashboard');
        
        if (response.data.success) {
          setDashboardData(response.data.dashboard);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          // Token expired or invalid, redirect to login
          localStorage.removeItem('adminToken');
          window.location.href = '/';
        } else if (err.code === 'ERR_NETWORK') {
          setError('Cannot connect to server. Make sure backend is running.');
        } else {
          setError(err.response?.data?.message || 'Failed to fetch dashboard data');
        }
      } finally {
        setLoading(false);
      }
    };

    const fetchChainStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        if (token) {
          const res = await axios.get('/api/admin/blockchain/stats', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.data?.success) {
            setChainStats(res.data);
            return;
          }
        }

        const pub = await axios.get('/api/blockchain/stats');
        if (pub.data?.success) {
          setChainStats({
            totalBlocks: pub.data.localChain?.totalBlocks ?? pub.data.total ?? 0,
            latestBlockIndex: pub.data.localChain?.latestBlockIndex ?? pub.data.latestBlockIndex,
            latestBlockHash: pub.data.localChain?.latestBlockHash ?? pub.data.latestBlockHash,
            difficulty: pub.data.localChain?.difficulty ?? pub.data.difficulty ?? 2,
          });
        }
      } catch (err) {
        console.error('Failed to fetch chain stats', err && err.message ? err.message : err);
      }
    };

    const fetchDemoStatus = async () => {
      try {
        const res = await axios.get('/api/admin/demo-elections-status');
        if (res.data?.success) {
          setDemoEnabled(res.data.enabled);
        }
      } catch (err) {
        console.error('Failed to fetch demo status', err);
      }
    };

    fetchDashboardData();
    fetchChainStats();
    fetchDemoStatus();
    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');
    socket.on('vote_cast', (_payload) => {
      // Could trigger a refetch or update a local tally widget in future
      // For now just log
      console.log('Vote cast realtime', _payload);
    });
    socket.on('election_status', () => {
      // Refetch to update stats
      fetchDashboardData();
      fetchChainStats();
      fetchDemoStatus();
    });
    return () => socket.disconnect();
  }, []);

  const handleToggleDemo = async () => {
    setDemoLoading(true);
    const nextState = !demoEnabled;
    try {
      const res = await axios.post('/api/admin/toggle-demo-elections', { enable: nextState });
      if (res.data?.success) {
        setDemoEnabled(nextState);
        toast.success(nextState ? 'Demo elections enabled & seeded!' : 'Demo elections disabled & removed!');
        // Refetch dashboard data
        const response = await axios.get('/api/admin/dashboard');
        if (response.data.success) {
          setDashboardData(response.data.dashboard);
        }
      } else {
        toast.error(res.data?.message || 'Failed to toggle demo elections');
      }
    } catch (err) {
      console.error('Failed to toggle demo elections', err);
      toast.error('Error toggling demo elections');
    } finally {
      setDemoLoading(false);
    }
  };

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
    } finally {
      setValidatingChain(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div>
        <main className="flex-1 overflow-y-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Welcome, {dashboardData?.admin?.username || 'Admin'}
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
                    Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {dashboardData && (
            <div>
              <div className="bg-white dark:bg-slate-900 shadow-xl overflow-hidden sm:rounded-lg border border-gray-200 dark:border-slate-700 mb-6">
                <div className="px-4 py-5 sm:px-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden="true">🔗</span>
                    <div>
                      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Blockchain Integrity</h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Tamper-proof vote chain status</p>
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
                        Validating...
                      </>
                    ) : (
                      <>🔍 Validate Chain</>
                    )}
                  </button>
                </div>
                <div className="border-t border-gray-200 dark:border-slate-700">
                  {chainStats ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-cyan-600 dark:text-cyan-400 font-mono">{chainStats.totalBlocks || 0}</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">Total Blocks</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">#{chainStats.latestBlockIndex ?? 0}</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">Latest Block</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-purple-600 dark:text-purple-400 font-mono">{chainStats.difficulty || 2}</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">Difficulty</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-mono text-orange-600 dark:text-orange-400 truncate">{chainStats.latestBlockHash?.slice(0, 12) || '—'}...</div>
                        <div className="text-[10px] text-gray-500 dark:text-slate-400 mt-1">Latest Hash</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-gray-500 dark:text-slate-500">Loading blockchain stats...</div>
                  )}
                  {chainValidation && (
                    <div className={`mx-4 mb-4 px-4 py-3 rounded-lg ${chainValidation.valid ? 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-600/30' : 'bg-red-50 border border-red-200 dark:bg-red-900/30 dark:border-red-600/30'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{chainValidation.valid ? '✅' : '❌'}</span>
                        <div>
                          <div className={`text-sm font-medium ${chainValidation.valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                            {chainValidation.valid ? 'Chain Intact — No Tampering Detected' : 'Chain Compromised'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                            {chainValidation.message || chainValidation.error || `${chainValidation.chainLength} blocks verified`}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
                          <dt className="text-sm font-medium text-gray-500 truncate">Total Elections</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {dashboardData.statistics.totalElections}
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
                              {dashboardData.statistics.activeElections}
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Upcoming Elections</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {dashboardData.statistics.upcomingElections}
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-5 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">Completed Elections</dt>
                          <dd className="flex items-baseline">
                            <div className="text-2xl font-semibold text-gray-900">
                              {dashboardData.statistics.completedElections}
                            </div>
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                  <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Recent Activity</h3>
                  </div>
                  <div className="border-t border-gray-200">
                    <ul className="divide-y divide-gray-200">
                      {dashboardData.recentActivity.length === 0 ? (
                        <li className="px-6 py-12 text-center">
                          <svg className="mx-auto h-10 w-10 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="mt-2 text-sm font-medium text-gray-500">No recent activity</p>
                          <p className="mt-1 text-xs text-gray-400">Activity will appear here as elections are created, started, and votes are cast.</p>
                        </li>
                      ) : (
                        dashboardData.recentActivity.map((activity, index) => (
                          <li key={index} className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="flex-shrink-0">
                                {activity.severity === 'critical' && (
                                  <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                                    <svg className="h-5 w-5 text-red-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                                {activity.severity === 'high' && (
                                  <span className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                                    <svg className="h-5 w-5 text-orange-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                                {activity.severity === 'medium' && (
                                  <span className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
                                    <svg className="h-5 w-5 text-yellow-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                                {(activity.severity === 'low' || !activity.severity) && (
                                  <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                                    <svg className="h-5 w-5 text-gray-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                )}
                              </div>
                              <div className="ml-4 flex-1">
                                <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                                <p className="text-sm text-gray-500">{activity.description}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(activity.timestamp).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>

                <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                  <div className="px-4 py-5 sm:px-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">System Information</h3>
                  </div>
                  <div className="border-t border-gray-200">
                    <dl>
                      <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500">Admin Role</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {dashboardData?.admin?.role ? dashboardData.admin.role.replace('_', ' ') : 'Unknown'}
                          </span>
                        </dd>
                      </div>
                      <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500">Last Login</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          {dashboardData?.admin?.lastLogin
                            ? new Date(dashboardData.admin.lastLogin).toLocaleString()
                            : 'Never'}
                        </dd>
                      </div>
                      <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                        <dt className="text-sm font-medium text-gray-500">System Status</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Operational
                          </span>
                        </dd>
                      </div>
                      <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 items-center">
                        <dt className="text-sm font-medium text-gray-500">Demo Elections</dt>
                        <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2 flex items-center justify-between">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${demoEnabled ? 'bg-cyan-100 text-cyan-800' : 'bg-gray-100 text-gray-600'}`}>
                            {demoEnabled ? 'Active (2 Sample Elections)' : 'Disabled'}
                          </span>
                          <button
                            type="button"
                            onClick={handleToggleDemo}
                            disabled={demoLoading}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              demoEnabled ? 'bg-cyan-600' : 'bg-gray-300'
                            }`}
                          >
                            <span className="sr-only">Toggle Demo Elections</span>
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                demoEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
    </div>
  );
};

export default AdminDashboard;