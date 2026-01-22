import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../utils/axios';

const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    aadhaar: '',
    name: '',
    mobile: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: ''
  });

  const [step, setStep] = useState(1);
  const [aadhaarLoading, setAadhaarLoading] = useState(false);
  const [aadhaarError, setAadhaarError] = useState('');
  const [aadhaarValid, setAadhaarValid] = useState(null); // null = unknown, true = valid, false = invalid
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const aadhaarDebounceRef = useRef(null);
  const nameRef = useRef(null);
  const emailRef = useRef(null);

  // helper: validate Aadhaar (12 digits)
  const isValidAadhaar = (v) => /^[0-9]{12}$/.test(v);

  // Debounced lookup when aadhaar reaches 12 digits
  useEffect(() => {
    const aad = formData.aadhaar.replace(/\D/g, '');
    if (aad.length >= 12) {
      // normalize to first 12
      const normalized = aad.slice(0, 12);
      if (normalized !== formData.aadhaar) {
        setFormData((s) => ({ ...s, aadhaar: normalized }));
        return;
      }
      // debounce lookup
      if (aadhaarDebounceRef.current) clearTimeout(aadhaarDebounceRef.current);
      aadhaarDebounceRef.current = setTimeout(() => {
        doAadhaarLookup(normalized, true);
      }, 250);
    }
    return () => {
      if (aadhaarDebounceRef.current) clearTimeout(aadhaarDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.aadhaar]);

  // focus the name field when auto-advanced to step 2
  useEffect(() => {
    if (step === 2) {
      // tiny timeout to wait for DOM update
      setTimeout(() => {
        nameRef.current?.focus?.();
      }, 50);
    }
  }, [step]);

  const doAadhaarLookup = async (aadhaar, autoAdvance = false) => {
    setAadhaarError('');
    setAadhaarLoading(true);
    setAadhaarValid(null);
    try {
      const res = await axios.post('/aadhaar-lookup', { aadhaar });
      // backend udiService returns { name } or { name, dob }
      const name = res?.data?.name || '';
      const dob = res?.data?.dateOfBirth || res?.data?.dob || '';
      if (name) {
        setAadhaarValid(true);
        setFormData((s) => ({ ...s, name: name || s.name, dateOfBirth: dob || s.dateOfBirth }));
        if (autoAdvance) setStep(2);
      } else {
        setAadhaarValid(false);
        setAadhaarError('No record found for this Aadhaar');
      }
    } catch (e) {
      setAadhaarValid(false);
      setAadhaarError(e?.response?.data?.message || 'Lookup failed');
    } finally {
      setAadhaarLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'aadhaar') {
      // allow only digits, limit to 12
      const digits = value.replace(/\D/g, '').slice(0, 12);
      setFormData((s) => ({ ...s, aadhaar: digits }));
      setAadhaarError('');
      setAadhaarValid(null);
    } else {
      setFormData((s) => ({ ...s, [name]: value }));
    }
  };

  const handleAadhaarContinue = async () => {
    const aad = formData.aadhaar.replace(/\D/g, '');
    if (!isValidAadhaar(aad)) {
      setAadhaarError('Please enter a valid 12-digit Aadhaar');
      return;
    }
    await doAadhaarLookup(aad, true);
  };

  const handleBackToAadhaar = () => {
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
        aadhaar: formData.aadhaar,
        name: formData.name,
        email: formData.email,
        mobile: formData.mobile
      };
      const res = await axios.post('/voter/request-otp', payload);
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
          <div>
              <label htmlFor="aadhaar" className="block text-sm font-medium text-gray-700">Aadhaar Number</label>
              <div className="relative">
                <input
                  id="aadhaar"
                  name="aadhaar"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={formData.aadhaar}
                  onChange={handleChange}
                  className="mt-1 mb-3 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter 12-digit Aadhaar"
                  aria-describedby="aadhaar-status"
                />
                {/* right-side status: spinner, check or cross */}
                <div className="absolute right-2 top-3">
                  {aadhaarLoading ? (
                    <svg className="animate-spin h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : formData.aadhaar.length === 12 && aadhaarValid === true ? (
                    <svg className="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L8 11.172 4.707 7.879A1 1 0 003.293 9.293l4 4a1 1 0 001.414 0l8-8z" clipRule="evenodd" />
                    </svg>
                  ) : formData.aadhaar.length === 12 && aadhaarValid === false ? (
                    <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9V6a1 1 0 112 0v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3z" clipRule="evenodd" />
                    </svg>
                  ) : null}
                </div>
              </div>
              <div id="aadhaar-status" aria-live="polite" className="mt-1 flex items-center justify-between">
                <div>
                  {aadhaarLoading && <p className="text-sm text-gray-500">Looking up name...</p>}
                  {aadhaarError && <p className="text-sm text-red-600">{aadhaarError}</p>}
                </div>
                <div className="text-sm text-gray-700">
                  <span className="font-medium">Your Name: </span>
                  <span className="ml-2">{formData.name || '—'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAadhaarContinue}
                className="mt-4 w-full inline-flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700"
              >
                {aadhaarLoading ? 'Looking up...' : 'Continue'}
              </button>
            </div>
        )}

        {!success && step === 2 && (
          <form className="mt-6" onSubmit={handleSubmit}>
            {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700">Aadhaar</label>
              <input readOnly value={formData.aadhaar} className="mt-1 block w-full px-3 py-2 border border-gray-200 bg-gray-100 rounded-md" />
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
              <button type="button" onClick={handleBackToAadhaar} className="inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md">Back</button>
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
