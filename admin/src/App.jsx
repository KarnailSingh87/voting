import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { backendUrl } from './config/config';

// Voting System Admin pages
import Login from './pages/Voting/Login';
import Dashboard from './pages/Voting/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';
import Elections from './pages/Voting/Elections';
import ElectionDetail from './pages/Voting/ElectionDetail';
import Monitoring from './pages/Voting/Monitoring';
import ImportStudents from './pages/Voting/ImportStudents';
import AdminVoters from './pages/Voting/AdminVoters';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

// Export for other components
export { backendUrl };

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');

  useEffect(() => {
    const storedToken = localStorage.getItem('adminToken');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  const ProtectedRoute = ({ children }) => {
    if (!token) {
      return <Navigate to="/" replace />;
    }
    return children;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <ToastContainer 
        position="top-right" 
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      {token && <Navbar setToken={setToken} />}
      <div className="flex">
        {token && <Sidebar />}
        <div className={`flex-1 ${token ? 'ml-[280px] mt-[72px]' : ''} p-6 sm:p-10 min-h-screen`}>
        <Routes>
          {/* Public route */}
          <Route path='/' element={<Login setToken={(token) => {
            setToken(token);
            localStorage.setItem('adminToken', token);
          }} />}/>
          
          {/* Protected routes - Voting System */}
          <Route path='/dashboard' element={
            <ProtectedRoute>
              <ErrorBoundary>
                <Dashboard token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          <Route path='/elections' element={
            <ProtectedRoute>
              <ErrorBoundary>
                <Elections token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          <Route path='/elections/:id' element={
            <ProtectedRoute>
              <ElectionDetail token={token} />
            </ProtectedRoute>
          }/>
          <Route path='/monitoring' element={
            <ProtectedRoute>
              <ErrorBoundary>
                <Monitoring token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          <Route path='/import' element={
            <ProtectedRoute>
              <ImportStudents token={token} />
            </ProtectedRoute>
          }/>
          <Route path='/voters' element={
            <ProtectedRoute>
              <AdminVoters token={token} />
            </ProtectedRoute>
          }/>
          {/* Audit page removed */}
        </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;