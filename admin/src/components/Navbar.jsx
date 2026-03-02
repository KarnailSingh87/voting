/* JSX runtime — no default React import required */
import { useEffect, useState } from 'react';
import './Navbar.css';

const Navbar = ({ setToken }) => {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    const stored = localStorage.getItem('adminTheme');
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
    localStorage.setItem('adminTheme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <div className='navbar'>
      <div className="navbar-left">
        <h2>Voting System</h2>
      </div>
      <div className="navbar-right">
        {/* Theme toggle icon */}
        <button aria-label="Toggle theme" title="Toggle theme" className="theme-toggle" onClick={toggleTheme}>
          {theme === 'dark' ? (
            // Sun icon for light
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 4.5a1 1 0 011 1V7a1 1 0 11-2 0V5.5a1 1 0 011-1zM6.22 6.22a1 1 0 011.415 0L8.64 7.225a1 1 0 11-1.415 1.414L6.22 7.636a1 1 0 010-1.415zM4.5 12a1 1 0 011-1H7a1 1 0 110 2H5.5a1 1 0 01-1-1zM6.22 17.78a1 1 0 010-1.415l1.005-1.005a1 1 0 111.415 1.415L7.636 18.8a1 1 0 01-1.415 0zM12 18.5a1 1 0 011 1V20a1 1 0 11-2 0v-.5a1 1 0 011-1zM17.78 17.78a1 1 0 011.415 0l1.005 1.005a1 1 0 11-1.415 1.415L17.78 19.2a1 1 0 010-1.415zM18.5 12a1 1 0 011-1H20a1 1 0 110 2h-.5a1 1 0 01-1-1zM17.78 6.22a1 1 0 00-1.415-1.415L15.36 6.225a1 1 0 001.415 1.414l1.005-1.005zM12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          ) : (
            // Moon icon for dark
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>

        {/* Navbar intentionally minimal; admin info moved to sidebar for alignment */}
      </div>
    </div>
  );
}

export default Navbar;