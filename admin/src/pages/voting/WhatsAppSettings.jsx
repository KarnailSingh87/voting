import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { backendUrl } from '../../config/config';

const WhatsAppSettings = ({ token }) => {
  const [status, setStatus] = useState({ connected: false, hasQR: false, message: '' });
  const [qrCode, setQrCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/admin/whatsapp-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setStatus(res.data);
        // If not connected and has QR, fetch the QR code
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
        // Wait a moment then refresh to get new QR
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
        // Refresh status to get new QR code
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
    // Poll status every 2 seconds when not connected (faster polling for QR)
    const interval = setInterval(() => {
      if (!status.connected) {
        fetchStatus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.connected]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage WhatsApp connection for sending OTP messages to voters
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* WhatsApp Icon */}
              <div className={`p-3 rounded-full ${status.connected ? 'bg-green-100' : 'bg-gray-100'}`}>
                <svg className={`w-8 h-8 ${status.connected ? 'text-green-600' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {status.connected ? 'Connected' : 'Not Connected'}
                </h3>
                <p className="text-sm text-gray-500">{status.message}</p>
              </div>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              status.connected 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {status.connected ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Section */}
      {!status.connected && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Scan QR Code to Connect</h3>
            
            {qrCode ? (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-white rounded-lg border-2 border-green-200 shadow-sm">
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                </div>
                <p className="mt-4 text-sm text-gray-600 text-center">
                  Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <div className="animate-pulse bg-gray-200 w-64 h-64 rounded-lg mb-4"></div>
                <p className="text-sm text-gray-500">Waiting for QR code...</p>
                <button
                  onClick={handleReconnect}
                  disabled={actionLoading}
                  className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Initializing...' : 'Generate QR Code'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
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
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Disconnecting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>Disconnect</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <h4 className="font-medium text-gray-900">Refresh Connection</h4>
                  <p className="text-sm text-gray-500">Try to reconnect or generate a new QR code</p>
                </div>
                <button
                  onClick={handleReconnect}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
                >
                  {actionLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Reconnecting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Reconnect</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Check Status</h4>
                <p className="text-sm text-gray-500">Refresh the connection status</p>
              </div>
              <button
                onClick={fetchStatus}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
