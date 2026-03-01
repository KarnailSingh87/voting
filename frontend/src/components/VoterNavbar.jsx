import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '../utils/axios';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${backendUrl}${url}`;
};

const navLinks = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/history', label: 'Voting History' },
  { path: '/profile', label: 'Profile' },
  { path: '/public', label: 'Public Dashboard' },
];

const VoterNavbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [voter, setVoter] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('voterToken');
        if (!token) return;
        const res = await axios.get('/api/voter/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data.success && res.data.profile) {
          setVoter(res.data.profile);
        }
      } catch {
        // silent – navbar still works without profile
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('voterToken');
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const initials = (voter?.name || '')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <nav className="bg-white shadow sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left – logo + links */}
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1
                className="text-xl font-bold text-cyan-700 cursor-pointer"
                onClick={() => navigate('/dashboard')}
              >
                SecureVote
              </h1>
            </div>

            {/* Desktop links */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navLinks.map((link) => (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    isActive(link.path)
                      ? 'border-cyan-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right – avatar + logout (desktop) */}
          <div className="hidden sm:flex sm:items-center sm:space-x-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
            >
              {voter?.photoUrl ? (
                <img
                  src={getImageUrl(voter.photoUrl)}
                  alt={voter.name}
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-cyan-200"
                />
              ) : (
                <span className="h-8 w-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-800 text-xs font-bold">
                  {initials || '?'}
                </span>
              )}
              <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">
                {voter?.name || 'Voter'}
              </span>
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors px-3 py-1.5 rounded-md hover:bg-red-50"
            >
              Logout
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t">
          {/* Voter info */}
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center space-x-3">
            {voter?.photoUrl ? (
              <img
                src={getImageUrl(voter.photoUrl)}
                alt={voter.name}
                className="h-10 w-10 rounded-full object-cover ring-2 ring-cyan-200"
              />
            ) : (
              <span className="h-10 w-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-800 text-sm font-bold">
                {initials || '?'}
              </span>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{voter?.name || 'Voter'}</p>
              {voter?.roll && <p className="text-xs text-gray-500">{voter.roll}</p>}
            </div>
          </div>
          {/* Links */}
          <div className="pt-2 pb-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => { navigate(link.path); setMobileMenuOpen(false); }}
                className={`block w-full text-left pl-4 pr-4 py-2 text-base font-medium ${
                  isActive(link.path)
                    ? 'bg-cyan-50 border-l-4 border-cyan-500 text-cyan-700'
                    : 'border-l-4 border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="block w-full text-left pl-4 pr-4 py-2 text-base font-medium text-red-600 hover:bg-red-50 border-l-4 border-transparent"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default VoterNavbar;
