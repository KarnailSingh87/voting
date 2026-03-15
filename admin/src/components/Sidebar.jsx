import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  const adminToken = localStorage.getItem('adminToken');

  if (!adminToken) return null;

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    window.location.href = '/';
  };

  return (
    <div className='sidebar'>
      <div className="sidebar-header">
        <h2 className="sidebar-title">Admin</h2>
      </div>
      <ul className="sidebar-menu">
        <li>
          <NavLink to='/dashboard' className={({ isActive }) => isActive ? 'active' : ''}>
            Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink to='/elections' className={({ isActive }) => isActive ? 'active' : ''}>
            Elections
          </NavLink>
        </li>
        <li>
          <NavLink to='/monitoring' className={({ isActive }) => isActive ? 'active' : ''}>
            Monitoring
          </NavLink>
        </li>
        <li>
          <NavLink to='/voters' className={({ isActive }) => isActive ? 'active' : ''}>
            All Voters
          </NavLink>
        </li>
        <li>
          <NavLink to='/queries' className={({ isActive }) => isActive ? 'active' : ''}>
            Queries
          </NavLink>
        </li>
        <li>
          <NavLink to='/simple-import' className={({ isActive }) => isActive ? 'active' : ''}>
            Import Voters
          </NavLink>
        </li>
        <li>
          <NavLink to='/whatsapp' className={({ isActive }) => isActive ? 'active' : ''}>
            WhatsApp
          </NavLink>
        </li>
      </ul>

      <div style={{ marginTop: '2rem' }}>
        <button onClick={handleLogout} className="sidebar-logout">
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
