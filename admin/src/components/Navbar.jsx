import React from 'react';
import './Navbar.css';

const Navbar = ({ setToken }) => {
  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    if (setToken) setToken('');
    window.location.href = '/';
  };

  return (
    <div className='navbar'>
      <div className="navbar-left">
        <h2>Voting System</h2>
      </div>
      <div className="navbar-right">
        <div className="admin-info">
          <div className="admin-avatar">
            A
          </div>
          <div className="admin-details">
            <span className="admin-name">Admin User</span>
            <span className="admin-role">Super Admin</span>
          </div>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  );
}

export default Navbar;