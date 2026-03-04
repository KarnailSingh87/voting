import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import { toast } from 'react-toastify';
import Modal from '../../components/Modal';

const Login = () => {
  const navigate = useNavigate();
  // University roll-number based flow state
  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState('');
  const [extraInfo, setExtraInfo] = useState(null); // arbitrary fields from originalObj
  const [studentData, setStudentData] = useState(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [rollDetected, setRollDetected] = useState('');
  // removed unused `voted` state
  const [registeredAtDetected, setRegisteredAtDetected] = useState(null);
  const [originalArrDetected, setOriginalArrDetected] = useState(null);
  const [originalHeadersDetected, setOriginalHeadersDetected] = useState(null);
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState('aadhaar'); // aadhaar | otp
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [missingRecord, setMissingRecord] = useState(false);
  const [needsContact, setNeedsContact] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupTimer = useRef(null);
  const pendingStageTimer = useRef(null);
  const [verifiedRoll, setVerifiedRoll] = useState(false);
  const [isMe, setIsMe] = useState(null); // null = not chosen, true = it's me, false = not me
  const [, setQueryRaised] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  // removed unused emailError state

  // Theme state for login page (no navbar here)
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    const stored = localStorage.getItem('voterTheme');
    if (stored) {
      setTheme(stored);
      document.documentElement.classList.toggle('dark', stored === 'dark');
    } else {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('voterTheme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  // simple roll number format validation (alphanumeric, 4-20 chars)
  const isValidRoll = (v) => /^[A-Za-z0-9_-]{4,20}$/.test(v);

  // Helper function to mask mobile number (show only last 3 digits)
  const maskMobile = (num) => {
    if (!num) return '';
    const digits = num.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    return '*'.repeat(digits.length - 3) + digits.slice(-3);
  };

  const requestOtp = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      // Send OTP via WhatsApp (mobile number) instead of email
      const res = await axios.post('/api/voter/request-otp', { roll, name, mobile, channel: 'whatsapp' });
      setStage('otp');
      setMessage(`OTP sent to WhatsApp: ${maskMobile(mobile)}`);
      toast.success('OTP sent via WhatsApp');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to request OTP';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Attempt to request OTP programmatically when we have roll+name and mobile
  const tryRequestOtp = async (providedMobile) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      // Send OTP via WhatsApp
      const mobileToUse = providedMobile || mobile;
      const res = await axios.post('/api/voter/request-otp', { roll, name, mobile: mobileToUse, channel: 'whatsapp' });
      setMessage(`OTP sent to WhatsApp: ${maskMobile(mobileToUse)}. Preparing OTP entry...`);
      // delay briefly so user sees the confirmation
      if (pendingStageTimer.current) clearTimeout(pendingStageTimer.current);
      pendingStageTimer.current = setTimeout(() => setStage('otp'), 800);
      setNeedsContact(false);
    } catch (err) {
      const msg = err.response?.data?.message || '';
      if (msg && /mobile/i.test(msg)) {
        // Backend requires contact info - ask user
        setNeedsContact(true);
      } else {
        setError(msg || 'Failed to request OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  const reportIdentity = async () => {
    if (!roll || !name) return;
    setReportLoading(true);
    try {
      const payload = { roll, detectedName: name, reason: 'mismatch' };
      if (email) payload.contactProvided = email;
      await axios.post('/api/report-identity', payload);
      setMessage('Query raised. Admin will review.');
      setQueryRaised(true);
      toast.success('Report saved');
    } catch (e) {
      const msg = e.response?.data?.message || 'Failed to report';
      setError(msg);
      toast.error(msg);
    } finally {
      setReportLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const resp = await axios.post('/api/voter/verify-otp', { roll, otp });
      localStorage.setItem('voterToken', resp.data.token);
      // Expect student details in resp.data.student
      if (resp.data.student) {
        setStudentData(resp.data.student);
        setShowStudentModal(true);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Floating theme toggle */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        title="Toggle theme"
        className="fixed top-4 right-4 z-50 p-2.5 rounded-full bg-white shadow-lg hover:shadow-xl transition-all duration-200 text-gray-600 hover:text-gray-800"
      >
        {theme === 'dark' ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 4.5a1 1 0 011 1V7a1 1 0 11-2 0V5.5a1 1 0 011-1zM6.22 6.22a1 1 0 011.415 0L8.64 7.225a1 1 0 11-1.415 1.414L6.22 7.636a1 1 0 010-1.415zM4.5 12a1 1 0 011-1H7a1 1 0 110 2H5.5a1 1 0 01-1-1zM6.22 17.78a1 1 0 010-1.415l1.005-1.005a1 1 0 111.415 1.415L7.636 18.8a1 1 0 01-1.415 0zM12 18.5a1 1 0 011 1V20a1 1 0 11-2 0v-.5a1 1 0 011-1zM17.78 17.78a1 1 0 011.415 0l1.005 1.005a1 1 0 11-1.415 1.415L17.78 19.2a1 1 0 010-1.415zM18.5 12a1 1 0 011-1H20a1 1 0 110 2h-.5a1 1 0 01-1-1zM17.78 6.22a1 1 0 00-1.415-1.415L15.36 6.225a1 1 0 001.415 1.414l1.005-1.005zM12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </button>

      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {stage === 'otp' ? 'Enter OTP' : 'Student Login'}
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
                <p className="mt-2 text-sm text-gray-500 flex items-center">
                  <svg className="w-4 h-4 mr-1 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Check your WhatsApp for the OTP
                </p>
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
                <label htmlFor="roll" className="block text-sm font-medium text-gray-700">University Roll Number</label>
                <input
                  id="roll"
                  name="roll"
                  type="text"
                  required
                  value={roll}
                  onChange={(e)=>{
                    const v = e.target.value.trim();
                    setRoll(v);
                    setError('');
                    setMessage('');
                    setMissingRecord(false);
                    // reset any pending stage switch
                    if (pendingStageTimer.current) { clearTimeout(pendingStageTimer.current); pendingStageTimer.current = null; }
                    // clear previous name until lookup completes
                    if (!v) {
                      setName('');
                      setNeedsContact(false);
                    }
                    // debounce lookup when characters stable and valid
                    if (lookupTimer.current) clearTimeout(lookupTimer.current);
                    if (v && isValidRoll(v)) {
                      const query = v.trim().toUpperCase();
                      lookupTimer.current = setTimeout(async () => {
                        try {
                          setLookupLoading(true);
                          const res = await axios.post('/api/student-lookup', { roll: query });
                            if (res.data?.success) {
                            const s = res.data.student || {};
                            setRollDetected(s.roll || '');
                            setName(s.name || '');
                            // populate contact info if provided by lookup
                            if (s.email) setEmail(s.email);
                            if (s.mobile) setMobile(s.mobile);
                            if (s.photo) setPhoto(s.photo);
                            if (s.originalObj) setExtraInfo(s.originalObj);
                            // `voted` state removed earlier; don't call undefined setter
                            if (s.registeredAt) setRegisteredAtDetected(s.registeredAt);
                            if (Array.isArray(s.originalArr)) setOriginalArrDetected(s.originalArr);
                            if (Array.isArray(s.originalHeaders)) setOriginalHeadersDetected(s.originalHeaders);
                            setStudentData(s);
                            // Prompt user to confirm identity before sending OTP via WhatsApp
                            setMessage('Please confirm your identity to receive OTP via WhatsApp.');
                            // mark as verified (roll exists) but DO NOT auto-request OTP; wait for user confirmation
                            setVerifiedRoll(true);
                            setIsMe(null);
                            setQueryRaised(false);
                            toast.success('Student found');
                            // show a link to full details page
                            // (Login remains the primary flow; details page is for inspection/printing)
                            } else {
                              const respMsg = res.data?.message || 'Student lookup failed';
                              // If backend explicitly indicates Not found, show a neutral message and allow reporting
                              if (respMsg === 'Not found') {
                                setMissingRecord(true);
                              } else {
                                setError(respMsg);
                                toast.error(respMsg);
                              }
                            }
                        } catch (err) {
                            let msg = err.response?.data?.message || 'Student lookup failed';
                            // "Not found" is the raw 404 message from backend; show a friendly hint
              if (err.response?.status === 404 || msg === 'Not found') {
                setMissingRecord(true);
              } else {
                setError(msg);
                toast.error(msg);
              }
                        } finally {
                          setLookupLoading(false);
                        }
                      }, 300);
                    } else if (v) {
                      // invalid format
                      setError('Roll number appears invalid. Use 4–20 alphanumeric characters.');
                    }
                  }}
                  className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-cyan-500 focus:border-cyan-500 focus:z-10 sm:text-sm"
                  placeholder="Roll number"
                />
                {/* When lookup fails, allow the user to report a missing record */}
                {missingRecord && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setLookupLoading(true);
                          const payload = { roll };
                          if (email) payload.contactProvided = email;
                          if (mobile) payload.contactProvided = mobile;
                          const res = await axios.post('/api/report-missing', payload);
                          setMessage(res.data?.message || 'Report submitted');
                          toast.success(res.data?.message || 'Report submitted');
                          setMissingRecord(false);
                        } catch (e) {
                          const msg = e.response?.data?.message || 'Failed to report missing student';
                          setError(msg);
                          toast.error(msg);
                        } finally {
                          setLookupLoading(false);
                        }
                      }}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                    >
                      Report missing record
                    </button>
                  </div>
                )}
                {lookupLoading && <p className="mt-2 text-sm text-gray-500">Verifying roll number...</p>}
                {name && (
                  <div className="mt-2 text-sm text-gray-700">
                    <p>Name: <span className="font-medium">{name}</span></p>
                    <div className="mt-2 flex items-center space-x-3">
                        <label className="inline-flex items-center text-sm">
                        <input
                          type="checkbox"
                          checked={isMe === true}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsMe(checked);
                            if (checked) {
                              // prefill mobile from lookup for WhatsApp OTP and clear query
                              setMobile(studentData?.mobile || '');
                              setEmail(studentData?.email || '');
                              setMessage('');
                              setQueryRaised(false);
                            } else {
                              setMessage('Query raised. Admin will review.');
                              setQueryRaised(true);
                            }
                          }}
                          className="mr-2"
                        />
                        It&apos;s me
                      </label>
                      <button
                        type="button"
                        onClick={async () => { setIsMe(false); await reportIdentity(); }}
                        disabled={reportLoading}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        {reportLoading ? 'Reporting...' : 'Not me / Report'}
                      </button>
                    </div>
                    {rollDetected && <p className="text-sm text-gray-600">Roll: <span className="font-medium">{rollDetected}</span></p>}
                    {stage === 'otp' ? (
                      <>
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
                                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                                </div>
                              </div>
                            </div>
                          )}
                          <div>
                            <label htmlFor="otp" className="block text-sm font-medium text-gray-700">OTP</label>
                            <input
                              id="otp"
                              name="otp"
                              type="text"
                              autoComplete="one-time-code"
                              required
                              value={otp}
                              onChange={e => setOtp(e.target.value)}
                              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                              placeholder="Enter OTP"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700"
                          >
                            {loading ? 'Verifying...' : 'Verify OTP'}
                          </button>
                        </form>
                        <Modal show={showStudentModal} onClose={() => { setShowStudentModal(false); navigate('/dashboard'); }}>
                          {studentData ? (
                            <div>
                              <div className="text-lg font-semibold mb-2">Student Details</div>
                              <div className="mb-2"><strong>Name:</strong> {studentData.name}</div>
                              <div className="mb-2"><strong>Father's Name:</strong> {studentData.fatherName || '-'}</div>
                              <div className="mb-2"><strong>Blood Group:</strong> {studentData.bloodGroup || '-'}</div>
                              <div className="mb-2"><strong>Mobile:</strong> {studentData.mobile}</div>
                              <div className="mb-2"><strong>Program:</strong> {studentData.program || '-'}</div>
                              <div className="mb-2"><strong>Address:</strong> {studentData.address || '-'}</div>
                              <div className="mb-2"><strong>Category:</strong> {studentData.category || '-'}</div>
                              <div className="mb-2"><strong>Batch:</strong> {studentData.batch || '-'}</div>
                              <div className="mb-2"><strong>Roll No:</strong> {studentData.roll}</div>
                              <div className="mb-2"><strong>Registered:</strong> {studentData.registeredAt ? new Date(studentData.registeredAt).toLocaleString() : '-'}</div>
                              <div className="mb-2"><strong>Photo URL:</strong> {studentData.photoUrl ? (<a href={studentData.photoUrl} target="_blank" rel="noopener noreferrer">View Photo</a>) : '-'}</div>
                              {studentData.photoUrl && (
                                <img src={studentData.photoUrl} alt="Student" className="mt-2 w-24 h-24 rounded-full object-cover border" />
                              )}
                            </div>
                          ) : null}
                        </Modal>
                      </>
                      ) : null}

                    {/* removed 'View full details' and raw JSON per user request */}
                  </div>
                )}
              </div>

              {needsContact && (
                <div>
                  <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">
                    <span className="flex items-center">
                      <svg className="w-5 h-5 mr-2 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WhatsApp Number (required)
                    </span>
                  </label>
                  <input
                    id="mobile"
                    name="mobile"
                    type="text"
                    required
                    value={mobile}
                    onChange={(e)=>setMobile(e.target.value.replace(/\D/g, ''))}
                    className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                    placeholder="10-digit WhatsApp number"
                  />
                  <p className="mt-1 text-sm text-gray-500">Enter your WhatsApp-enabled mobile number</p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => tryRequestOtp(mobile)}
                      disabled={loading || mobile.length < 10}
                      className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      {loading ? 'Requesting...' : 'Send OTP via WhatsApp'}
                    </button>
                  </div>
                </div>
              )}
              
              {verifiedRoll ? (
                isMe === true ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      <span className="flex items-center">
                        <svg className="w-5 h-5 mr-2 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        WhatsApp Number for OTP
                      </span>
                    </label>
                    <div className="mt-2 flex items-center space-x-2">
                      <input
                        id="mobile"
                        name="mobile"
                        type="text"
                        readOnly
                        value={maskMobile(mobile)}
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-200 bg-gray-100 placeholder-gray-500 text-gray-900 rounded-md sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => requestOtp()}
                        disabled={loading || !mobile}
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                      >
                        {loading ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Sending...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            Send OTP via WhatsApp
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-gray-500">OTP will be sent to your registered WhatsApp number</p>
                  </div>
                ) : isMe === false ? (
                  <div className="rounded-md bg-yellow-50 p-4">
                    <div className="flex">
                        <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Query raised</h3>
                        <div className="mt-2 text-sm text-yellow-700">We&apos;ve logged a query for this roll; an admin will review it.</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      disabled={true}
                      className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gray-300 cursor-not-allowed"
                    >
                      Enter roll number to verify
                    </button>
                  </div>
                )
              ) : (
                <div>
                  <button
                    type="button"
                    disabled={true}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gray-300 cursor-not-allowed"
                  >
                    Enter roll number to verify
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