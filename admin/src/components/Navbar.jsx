/* JSX runtime — no default React import required */
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
        {/* Navbar intentionally minimal; admin info moved to sidebar for alignment */}
      </div>
    </div>
  );
}

export default Navbar;