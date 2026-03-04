import { useState, useEffect } from 'react';
import axios from '../../utils/axios';
import io from 'socket.io-client';
import Navbar from '../../components/Navbar';
import Sidebar from '../../components/Sidebar';

let socket;

const Monitoring = () => {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Initialize WebSocket connection
    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5005');
    
    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setEvents(prev => [{ time: new Date(), message: 'Connected to server', type: 'system' }, ...prev]);
    });
    
    socket.on('vote_cast', (data) => {
      // Update vote statistics in real-time
      const msg = `Vote cast for candidate ${data.candidateId} (Total: ${data.voteCount})`;
      console.log('Vote update received:', data);
      setEvents(prev => [{ time: new Date(), message: msg, type: 'vote' }, ...prev].slice(0, 50));
    });
    
    socket.on('election_status', (data) => {
      // Update election status in real-time
      const msg = `Election ${data.id} status changed to ${data.status}`;
      console.log('Election update received:', data);
      setEvents(prev => [{ time: new Date(), message: msg, type: 'election' }, ...prev].slice(0, 50));
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setEvents(prev => [{ time: new Date(), message: 'Disconnected from server', type: 'system' }, ...prev]);
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
          setError('Failed to fetch system health data');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHealthData();
    
    // Set up interval for periodic updates
    const interval = setInterval(fetchHealthData, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

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
            <h1 className="text-2xl font-bold text-gray-900">System Monitoring</h1>
            <p className="mt-1 text-sm text-gray-500">
              Real-time view of system performance and health
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

          {healthData && (
            <div className="grid grid-cols-1 gap-6">
              {/* System Status */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">System Status</h3>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Database Status</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {healthData.databaseStatus}
                        </span>
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Uptime</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {Math.floor(healthData.uptime / 3600)}h {Math.floor((healthData.uptime % 3600) / 60)}m {Math.floor(healthData.uptime % 60)}s
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
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
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Memory Usage</h3>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">RSS</span>
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
                          <span className="text-sm font-medium text-gray-700">Heap Total</span>
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
                          <span className="text-sm font-medium text-gray-700">Heap Used</span>
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
                          <span className="text-sm font-medium text-gray-700">External</span>
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
                    <h3 className="text-lg leading-6 font-medium text-gray-900">CPU Usage</h3>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-5 sm:p-6">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">User Time</span>
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
                          <span className="text-sm font-medium text-gray-700">System Time</span>
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
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Performance Metrics</h3>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">API Response Time</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className={healthData.apiResponseTime < 100 ? 'text-green-600' : healthData.apiResponseTime < 300 ? 'text-yellow-600' : 'text-red-600'}>
                          {healthData.apiResponseTime.toFixed(2)} ms
                        </span>
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Active Users</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        {healthData.activeUsers}
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Recent Errors</dt>
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
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Security Information</h3>
                </div>
                <div className="border-t border-gray-200">
                  <dl>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Encryption</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          AES-256 Enabled
                        </span>
                      </dd>
                    </div>
                    <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Authentication</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          JWT + 2FA Required
                        </span>
                      </dd>
                    </div>
                    <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500">Audit Trail</dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Immutable Logging
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Real-time Events */}
              <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                <div className="px-4 py-5 sm:px-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">Real-time Events</h3>
                </div>
                <div className="border-t border-gray-200">
                  <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                    {events.length === 0 ? (
                      <li className="px-4 py-4 text-sm text-gray-500">No events yet...</li>
                    ) : (
                      events.map((e, i) => (
                        <li key={i} className="px-4 py-4 sm:px-6">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-cyan-600 truncate">
                              {e.type === 'vote' ? 'Vote Cast' : e.type === 'election' ? 'Election Update' : 'System Update'}
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