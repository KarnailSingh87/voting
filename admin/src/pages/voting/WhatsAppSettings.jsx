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
  // Add state for tab and code entry
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [waLinkCode, setWaLinkCode] = useState('');

  // Placeholder handler for code entry (backend integration needed)
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
        // Add state for tab and code entry

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
      fetchStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);


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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Disconnect</span>
                    </>
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
