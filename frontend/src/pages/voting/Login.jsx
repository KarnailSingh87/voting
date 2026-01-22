import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';

const Login = () => {
  const navigate = useNavigate();
  // Aadhaar-based flow state
  const [aadhaar, setAadhaar] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState('aadhaar'); // aadhaar | otp
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [needsContact, setNeedsContact] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimer = useRef(null);
  const pendingStageTimer = useRef(null);

  // Verhoeff algorithm for Aadhaar checksum validation
  const verhoeff = (() => {
    // multiplication table
    const d = [
      [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]
    ];
    const p = [
      [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
    ];
    const inv = [0,4,3,2,1,5,6,7,8,9];
    return {
      validate: (num) => {
        const s = String(num).replace(/\D/g, '');
        if (s.length !== 12) return false;
        let c = 0;
        const arr = s.split('').reverse().map(x => parseInt(x, 10));
        for (let i = 0; i < arr.length; i++) {
          c = d[c][p[(i % 8)][arr[i]]];
        }
        return c === 0;
      }
    };
  })();

  const requestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const resp = await axios.post('/api/voter/request-otp', { aadhaar, name, mobile });
      setStage('otp');
      setMessage('OTP sent (mock console). Enter it below.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request OTP');
    } finally {
      setLoading(false);
    }
  };

  // Attempt to request OTP programmatically when we have aadhaar+name and no explicit submit
  const tryRequestOtp = async (providedMobile) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const resp = await axios.post('/api/voter/request-otp', { aadhaar, name, mobile: providedMobile || mobile });
      // show inline confirmation then switch to OTP entry
      setMessage('OTP sent to your registered contact (mock). Preparing OTP entry...');
      // delay briefly so user sees the confirmation
      if (pendingStageTimer.current) clearTimeout(pendingStageTimer.current);
      pendingStageTimer.current = setTimeout(() => setStage('otp'), 800);
      setNeedsContact(false);
    } catch (err) {
      const msg = err.response?.data?.message || '';
      if (msg && /mobile|email/i.test(msg)) {
        // Backend requires contact info - ask user
        setNeedsContact(true);
      } else {
        setError(msg || 'Failed to request OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const resp = await axios.post('/api/voter/verify-otp', { aadhaar, otp });
      localStorage.setItem('voterToken', resp.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {stage === 'otp' ? 'Enter OTP' : 'Aadhaar Verification'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Secure & Transparent Online Voting System
          </p>
        </div>
        
        {stage === 'otp' ? (
          <form className="mt-8 space-y-6" onSubmit={verifyOtp}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Authentication Error
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="rounded-md space-y-4">
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700">
                  One-Time Password
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  required
                  value={otp}
                  onChange={(e)=>setOtp(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm"
                  placeholder="Enter OTP"
                />
                <p className="mt-2 text-sm text-gray-500">Check console for mock OTP value.</p>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => { setStage('aadhaar'); setOtp(''); }}
                className="group relative flex-1 flex justify-center py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="group relative flex-1 flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
              >
                {loading ? (
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : null}
                {loading ? 'Verifying...' : 'Verify & Proceed'}
              </button>
            </div>
          </form>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={requestOtp}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Login Error
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-md space-y-4">
              <div>
                <label htmlFor="aadhaar" className="block text-sm font-medium text-gray-700">Aadhaar Number</label>
                <input
                  id="aadhaar"
                  name="aadhaar"
                  type="text"
                  required
                  value={aadhaar}
                  onChange={(e)=>{
                    const v = e.target.value.replace(/\D/g, '');
                    setAadhaar(v);
                    setError('');
                    setMessage('');
                    // reset any pending stage switch
                    if (pendingStageTimer.current) { clearTimeout(pendingStageTimer.current); pendingStageTimer.current = null; }
                    // clear previous name until lookup completes
                    if (v.length < 12) {
                      setName('');
                      setNeedsContact(false);
                    }
                    // debounce lookup when digits stable and valid
                    if (lookupTimer.current) clearTimeout(lookupTimer.current);
                    if (v.length === 12 && verhoeff.validate(v)) {
                      lookupTimer.current = setTimeout(async () => {
                        try {
                          setLookupLoading(true);
                          const res = await axios.post('/api/aadhaar-lookup', { aadhaar: v });
                          if (res.data?.success) {
                            setName(res.data.name || '');
                            setMessage(res.data.mock ? 'Aadhaar lookup (mock) successful' : 'Aadhaar verified');
                            // Try to request OTP automatically — backend may require mobile/email; try without mobile first
                            await tryRequestOtp();
                          } else {
                            setError(res.data?.message || 'Aadhaar lookup failed');
                          }
                        } catch (err) {
                          setError(err.response?.data?.message || 'Aadhaar lookup failed');
                        } finally {
                          setLookupLoading(false);
                        }
                      }, 300);
                    } else if (v.length === 12) {
                      // invalid checksum
                      setError('Aadhaar appears invalid (checksum failed). Please check the number.');
                    }
                  }}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm"
                  placeholder="12-digit Aadhaar"
                />
                {lookupLoading && <p className="mt-2 text-sm text-gray-500">Verifying Aadhaar...</p>}
                {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
                {name && <p className="mt-2 text-sm text-gray-700">Detected name: <span className="font-medium">{name}</span></p>}
              </div>

              {needsContact && (
                <div>
                  <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">Mobile Number (required)</label>
                  <input
                    id="mobile"
                    name="mobile"
                    type="text"
                    required
                    value={mobile}
                    onChange={(e)=>setMobile(e.target.value.replace(/\D/g, ''))}
                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm"
                    placeholder="10-digit mobile"
                  />
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => tryRequestOtp(mobile)}
                      disabled={loading}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700"
                    >
                      {loading ? 'Requesting...' : 'Submit mobile & request OTP'}
                    </button>
                  </div>
                </div>
              )}
      
              {!needsContact && (
                <div>
                  <button
                    type="submit"
                    disabled={loading || lookupLoading}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-50"
                  >
                    {loading ? (
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : null}
                    {loading ? 'Requesting OTP...' : 'Request OTP'}
                  </button>
                </div>
              )}
              </div>
            </form>
        )}
        
        <div className="text-sm text-center space-y-2">
          {message && <p className="text-green-600">{message}</p>}
          <button
            onClick={() => navigate('/public')}
            className="font-medium text-cyan-600 hover:text-cyan-500 block"
          >
            View Public Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;