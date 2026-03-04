import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';
import Modal from '../../components/Modal';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    roll: '',
    name: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: ''
  });

  const [step, setStep] = useState(1);
  const [rollLoading, setRollLoading] = useState(false);
  const [rollError, setRollError] = useState('');
  const [rollValid, setRollValid] = useState(null); // null = unknown, true = valid, false = invalid
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showStudentFound, setShowStudentFound] = useState(false);

  const rollDebounceRef = useRef(null);
  const nameRef = useRef(null);
  const emailRef = useRef(null);

  // helper: validate roll (alphanumeric 4-20 chars)
  const isValidRoll = (v) => /^[A-Za-z0-9_-]{4,20}$/.test(v);

  // Debounced lookup when roll input changes
  useEffect(() => {
    const v = (formData.roll || '').toString().trim().toUpperCase();
    if (!v) return;
    if (rollDebounceRef.current) clearTimeout(rollDebounceRef.current);
    rollDebounceRef.current = setTimeout(() => {
      doRollLookup(v, false);
    }, 300);
  return () => { if (rollDebounceRef.current) clearTimeout(rollDebounceRef.current); };
  }, [formData.roll]);

  // focus the name field when auto-advanced to step 2
  useEffect(() => {
    if (step === 2) {
      // tiny timeout to wait for DOM update
      setTimeout(() => {
        nameRef.current?.focus?.();
      }, 50);
    }
  }, [step]);

  const doRollLookup = async (roll, autoAdvance = false) => {
    setRollError('');
    setRollLoading(true);
    setRollValid(null);
    try {
      const res = await axios.post('/api/student-lookup', { roll });
      const name = res?.data?.name || '';
      if (name) {
        setRollValid(true);
        setFormData((s) => ({ ...s, name: name || s.name }));
        setShowStudentFound(true);
        if (autoAdvance) setStep(2);
      } else {
        setRollValid(false);
        setRollError('No record found for this roll');
      }
    } catch (e) {
      setRollValid(false);
      setRollError(e?.response?.data?.message || 'Lookup failed');
    } finally {
      setRollLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'roll') {
      const normalized = value.toUpperCase().slice(0, 20);
      setFormData((s) => ({ ...s, roll: normalized }));
      setRollError('');
      setRollValid(null);
    } else {
      setFormData((s) => ({ ...s, [name]: value }));
    }
  };

  const handleRollContinue = async () => {
    const r = (formData.roll || '').toString().trim().toUpperCase();
    if (!isValidRoll(r)) {
      setRollError('Please enter a valid roll (4-20 alphanumeric chars)');
      return;
    }
    await doRollLookup(r, true);
  };

  const handleBackToRoll = () => {
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      // send request to backend to request OTP (it will create voter record if absent)
      const payload = {
        roll: formData.roll,
        name: formData.name,
        email: formData.email,
        mobile: formData.mobile
      };
      const res = await axios.post('/api/voter/request-otp', payload);
      if (res?.data?.message) {
        setSuccess(true);
        // optionally redirect after a delay
        setTimeout(() => navigate('/verify'), 1500);
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white py-8 px-6 shadow rounded-lg">
        <h2 className="mb-6 text-center text-2xl font-semibold">Register</h2>

        {success && (
          <div className="rounded-md bg-green-50 p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">Registration Successful!</h3>
                <div className="mt-2 text-sm text-green-700"><p>OTP sent — please verify to continue.</p></div>
              </div>
            </div>
          </div>
        )}

        {!success && step === 1 && (
          <>
            <Modal show={showStudentFound} onClose={() => setShowStudentFound(false)}>
              <div className="text-lg font-semibold text-green-700 mb-2">Student found</div>
              <div className="text-gray-700">A student record was found for this roll number.</div>
            </Modal>
            <div>
              <label htmlFor="roll" className="block text-sm font-medium text-gray-700">University Roll Number</label>
              <div className="relative">
                <input
                  id="roll"
                  name="roll"
                  type="text"
                  value={formData.roll}
                  onChange={handleChange}
                  className="mt-1 mb-3 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter your roll number"
                  aria-describedby="roll-status"
                />
                {/* right-side status: spinner, check or cross */}
                <div className="absolute right-2 top-3">
                  {rollLoading ? (
                    <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : formData.roll.length >= 4 && rollValid === true ? (
                    <svg className="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879A1 1 0 003.293 9.293l4 4a1 1 0 001.414 0l8-8z" clipRule="evenodd" />
                    </svg>
                  ) : formData.roll.length >= 4 && rollValid === false ? (
                    <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9V6a1 1 0 112 0v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3z" clipRule="evenodd" />
                    </svg>
                  ) : null}
                </div>
              </div>
              <div id="roll-status" aria-live="polite" className="mt-1 flex items-center justify-between">
                <div>
                  {rollLoading && <p className="text-sm text-gray-500">Looking up name...</p>}
                  {rollError && <p className="text-sm text-red-600">{rollError}</p>}
                </div>
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Your Name: </span>
                  <span className="ml-2">{formData.name || '—'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRollContinue}
                className="mt-4 w-full inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700"
              >
                {rollLoading ? 'Looking up...' : 'Continue'}
              </button>
            </div>
          </>
        )}

        {!success && step === 2 && (
          <form className="mt-6" onSubmit={handleSubmit}>
            {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700">Roll</label>
              <input readOnly value={formData.roll} className="mt-1 block w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-md" />
            </div>

            <div className="mb-3">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
              <input id="name" name="name" ref={nameRef} value={formData.name} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>

            <div className="mb-3">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input id="email" name="email" ref={emailRef} type="email" value={formData.email} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>

            <div className="mb-3">
              <label htmlFor="mobile" className="block text-sm font-medium text-gray-700">Mobile Number</label>
              <input id="mobile" name="mobile" type="text" inputMode="numeric" maxLength={10} value={formData.mobile} onChange={handleChange} placeholder="10-digit mobile" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>

            <div className="mb-3">
              <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700">Date of Birth</label>
              <input id="dateOfBirth" name="dateOfBirth" type="date" value={formData.dateOfBirth} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>

            <div className="mb-3">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>

            <div className="mb-3">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
            </div>

            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBackToRoll} className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md">Back</button>
              <button type="submit" disabled={loading} className="inline-flex justify-center py-2 px-4 bg-cyan-600 text-white rounded-md">
                {loading ? 'Registering...' : 'Register'}
              </button>
            </div>
          </form>
        )}

        <div className="text-sm text-center mt-6">
          <button onClick={() => navigate('/login')} className="font-medium text-cyan-600 hover:text-cyan-500">Already have an account? Sign in</button>
        </div>
      </div>
    </div>
  );
};

export default Register;
