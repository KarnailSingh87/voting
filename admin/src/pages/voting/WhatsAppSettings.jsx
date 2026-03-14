import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { backendUrl } from '../../config/config';

const WhatsAppSettings = ({ token }) => {
    const [status, setStatus] = useState({ connected: false, hasQR: false, message: '' });
    const [qrCode, setQrCode] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [showCodeEntry, setShowCodeEntry] = useState(false);
    const [waLinkCode, setWaLinkCode] = useState('');

    const handleLinkWithCode = async () => {
      toast.info('Phone number linking is not yet implemented on the backend.');
    };

    const fetchStatus = useCallback(async () => {
      try {
        const res = await axios.get(`${backendUrl}/api/admin/whatsapp-status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          setStatus(res.data);
          if (!res.data.connected && res.data.hasQR) {
            fetchQRCode();
          } else {
            setQrCode(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch WhatsApp status:', err);
        toast.error('Failed to fetch WhatsApp status');
      } finally {
        setLoading(false);
      }
    }, [token]);

    const fetchQRCode = async () => {
      try {
        const res = await axios.get(`${backendUrl}/api/admin/whatsapp-qr`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success && res.data.qrCode) {
          setQrCode(res.data.qrCode);
        }
      } catch (err) {
        console.error('Failed to fetch QR code:', err);
      }
    };

    const handleDisconnect = async () => {
      if (!window.confirm('Are you sure you want to disconnect WhatsApp? You will need to scan a new QR code to reconnect.')) {
        return;
      }
      setActionLoading(true);
      try {
        const res = await axios.post(`${backendUrl}/api/admin/whatsapp-disconnect`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          toast.success('WhatsApp disconnected successfully');
          setStatus({ connected: false, hasQR: false, message: 'Disconnected' });
          setQrCode(null);
          setTimeout(() => fetchStatus(), 2000);
        }
      } catch (err) {
        console.error('Failed to disconnect WhatsApp:', err);
        toast.error('Failed to disconnect WhatsApp');
      } finally {
        setActionLoading(false);
      }
    };

    const handleReconnect = async () => {
      setActionLoading(true);
      try {
        const res = await axios.post(`${backendUrl}/api/admin/whatsapp-reconnect`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.success) {
          toast.success(res.data.message);
          setTimeout(() => fetchStatus(), 1000);
        }
      } catch (err) {
        console.error('Failed to reconnect WhatsApp:', err);
        toast.error('Failed to reconnect WhatsApp');
      } finally {
        setActionLoading(false);
      }
    };

    useEffect(() => {
      fetchStatus();
      const interval = setInterval(() => {
        fetchStatus();
      }, 2000);
      return () => clearInterval(interval);
    }, [fetchStatus]);

    return (
  <div className="max-w-3xl mx-auto px-2 sm:px-4">
  <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
                  Manage WhatsApp connection for sending OTP messages to voters
                </p>
              </div>

              {/* QR Code & Code Entry Section */}
              {!status.connected && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-4 sm:mb-6">
                  <div className="p-3 sm:p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Connect WhatsApp</h3>
                    <div className="mb-4 flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0">
                      <button
                        className={`w-full sm:w-auto px-4 py-2 rounded-t-lg font-medium focus:outline-none ${!showCodeEntry ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                        onClick={() => setShowCodeEntry(false)}
                        type="button"
                      >
                        Scan QR Code
                      </button>
                      <button
                        className={`w-full sm:w-auto px-4 py-2 rounded-t-lg font-medium focus:outline-none ${showCodeEntry ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                        onClick={() => setShowCodeEntry(true)}
                        type="button"
                      >
                        Link with Phone Number
                      </button>
                    </div>
                    <div>
                      {!showCodeEntry ? (
                        qrCode ? (
                          <div className="flex flex-col items-center">
                            <div className="p-2 sm:p-4 bg-white rounded-lg border-2 border-green-200 shadow-sm">
                              <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48 sm:w-64 sm:h-64" />
                            </div>
                            <p className="mt-3 sm:mt-4 text-sm text-gray-600 text-center">
                              Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-6 sm:py-8">
                            <div className="animate-pulse bg-gray-200 w-48 h-48 sm:w-64 sm:h-64 rounded-lg mb-4"></div>
                            <p className="text-sm text-gray-500">Waiting for QR code...</p>
                            <button
                              onClick={handleReconnect}
                              disabled={actionLoading}
                              className="mt-4 w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              {actionLoading ? 'Initializing...' : 'Generate QR Code'}
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex flex-col items-center py-6 sm:py-8 w-full max-w-xs mx-auto">
                          {/* Mobile-specific instructions */}
                          <div className="block sm:hidden w-full mb-4">
                            <div className="text-base font-semibold text-gray-800 mb-2 text-center">How to Link WhatsApp on Mobile</div>
                            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 mb-2">
                              <li>Open <b>WhatsApp</b> on your phone.</li>
                              <li>Go to <b>Settings</b> &gt; <b>Linked Devices</b> &gt; <b>Link a Device</b>.</li>
                              <li>Choose <b>Link with phone number</b> if available.</li>
                              <li>Follow the on-screen instructions to complete linking.</li>
                            </ol>
                            <div className="text-xs text-blue-700 bg-blue-50 rounded p-2 mb-2 text-center">
                              You do not need to use a PC or WhatsApp Web for this process on mobile.
                            </div>
                          </div>
                          {/* Desktop instructions hidden on mobile */}
                          <div className="hidden sm:block w-full mb-4">
                            <div className="text-base font-semibold text-gray-800 mb-2">How to Link WhatsApp via Phone Number & OTP (Desktop)</div>
                            <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1 mb-2">
                              <li>On your computer, open <b>WhatsApp Web</b> or the <b>Windows WhatsApp app</b>.</li>
                              <li>Click <b>Link with phone number</b> or <b>Login via phone number</b>.</li>
                              <li>Select your country and enter your phone number, then click <b>Next</b>.</li>
                              <li>WhatsApp Web/Windows will show you an <b>8-character code</b>.</li>
                              <li>On your <b>primary phone</b>, tap the notification or go to <b>Settings &gt; Linked Devices &gt; Link a Device &gt; Link with phone number instead</b>.</li>
                              <li>Follow the prompts for biometric or PIN verification.</li>
                              <li>Enter the <b>8-character code</b> from WhatsApp Web/Windows into your phone to complete linking.</li>
                            </ol>
                            <div className="text-xs text-blue-700 bg-blue-50 rounded p-2 mb-2 text-center">
                              This feature is only available for WhatsApp Web and WhatsApp for Windows. The code is generated by WhatsApp Web/Windows, not by this admin panel.
                            </div>
                          </div>
                          <label htmlFor="wa-link-code" className="block text-sm font-medium text-gray-700 mb-2">Enter Code from WhatsApp</label>
                          <input
                            id="wa-link-code"
                            type="text"
                            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-200 mb-4 text-base sm:text-lg"
                            placeholder="123-456"
                            value={waLinkCode}
                            onChange={e => setWaLinkCode(e.target.value)}
                            maxLength={8}
                            autoComplete="off"
                          />
                          <button
                            onClick={handleLinkWithCode}
                            disabled={actionLoading || !waLinkCode.trim()}
                            className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {actionLoading ? 'Linking...' : 'Link Device'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Actions Section */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-4 sm:mt-6">
                <div className="p-3 sm:p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                  <div className="space-y-4">
                    {status.connected ? (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <h4 className="font-medium text-gray-900">Disconnect WhatsApp</h4>
                          <p className="text-sm text-gray-500">Remove the currently connected device</p>
                        </div>
                        <button
                          onClick={handleDisconnect}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
                        >
                          {actionLoading ? (
                            <span>
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Disconnecting...
                            </span>
                          ) : (
                            <span>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Disconnect
                            </span>
                          )}
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900">Check Status</h4>
                        <p className="text-sm text-gray-500">Refresh the connection status</p>
                      </div>
                      <button
                        onClick={async () => { setRefreshing(true); await fetchStatus(); setRefreshing(false); }}
                        disabled={refreshing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
                      >
                        <svg className={`w-4 h-4 transition-transform ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>{refreshing ? 'Checking...' : 'Refresh'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Section */}
              <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex flex-col sm:flex-row">
                  <svg className="w-5 h-5 text-blue-600 mr-0 sm:mr-3 mb-2 sm:mb-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-blue-900">How it works</h4>
                    <p className="mt-1 text-sm text-blue-700">
                      WhatsApp is used to send OTP codes to voters during login. When connected, 
                      OTPs are delivered instantly via WhatsApp. If disconnected, OTPs are logged 
                      to the server console (development mode).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        };

export default WhatsAppSettings;
