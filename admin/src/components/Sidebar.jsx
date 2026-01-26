/* JSX runtime — no default React import required */
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  const adminToken = localStorage.getItem('adminToken');
  
  if (!adminToken) {
    return null;
  }

  return (
    <div className='sidebar'>
      <div className="sidebar-header">
        <h2>Voting Admin</h2>
      </div>
      <ul className="sidebar-menu">
        <li>
          <NavLink to='/dashboard' className={({ isActive }) => isActive ? 'active' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
            </svg>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to='/elections' className={({ isActive }) => isActive ? 'active' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            Elections
          </NavLink>
        </li>
        <li>
          <NavLink to='/monitoring' className={({ isActive }) => isActive ? 'active' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            Monitoring
          </NavLink>
        </li>
        <li>
          <NavLink to='/voters' className={({ isActive }) => isActive ? 'active' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a4 4 0 100 8 4 4 0 000-8zm-8 16a8 8 0 0116 0H2z" />
            </svg>
            All Voters
          </NavLink>
        </li>
        <li>
          <NavLink to='/import' className={({ isActive }) => isActive ? 'active' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 3v4h4V3H3zm0 10v4h4v-4H3zM13 3v4h4V3h-4zm0 10v4h4v-4h-4z" />
            </svg>
            Import Voters
          </NavLink>
        </li>
        <li>
          <NavLink to='/audit' className={({ isActive }) => isActive ? 'active' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
            </svg>
            Audit
          </NavLink>
        </li>
      </ul>
    </div>
  );
}

export default Sidebar;