import { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { backendUrl } from './config/config';

// Eagerly loaded (needed immediately on all pages)
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

// Lazy-loaded pages for code splitting
const Login = lazy(() => import('./pages/voting/Login'));
const Dashboard = lazy(() => import('./pages/voting/Dashboard'));
const ErrorBoundary = lazy(() => import('./components/ErrorBoundary'));
const Elections = lazy(() => import('./pages/voting/Elections'));
const ElectionDetail = lazy(() => import('./pages/voting/ElectionDetail'));
const Monitoring = lazy(() => import('./pages/voting/Monitoring'));
const SimpleImport = lazy(() => import('./pages/voting/SimpleImport'));
const AdminVoters = lazy(() => import('./pages/voting/AdminVoters'));
const WhatsAppSettings = lazy(() => import('./pages/voting/WhatsAppSettings'));

// Export for other components
export { backendUrl };

// ProtectedRoute defined outside App to avoid re-mounts
const ProtectedRoute = ({ token, children }) => {
  if (!token) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const App = () => {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');

  useEffect(() => {
    const storedToken = localStorage.getItem('adminToken');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

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
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <svg className="animate-spin h-10 w-10 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        }>
        <Routes>
          {/* Public route */}
          <Route path='/' element={<Login setToken={(token) => {
            setToken(token);
            localStorage.setItem('adminToken', token);
          }} />}/>
          
          {/* Protected routes - Voting System */}
          <Route path='/dashboard' element={
            <ProtectedRoute token={token}>
              <ErrorBoundary>
                <Dashboard token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          <Route path='/elections' element={
            <ProtectedRoute token={token}>
              <ErrorBoundary>
                <Elections token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          <Route path='/elections/:id' element={
            <ProtectedRoute token={token}>
              <ElectionDetail token={token} />
            </ProtectedRoute>
          }/>
          <Route path='/monitoring' element={
            <ProtectedRoute token={token}>
              <ErrorBoundary>
                <Monitoring token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          <Route path='/simple-import' element={
            <ProtectedRoute token={token}>
              <SimpleImport token={token} />
            </ProtectedRoute>
          }/>
          <Route path='/voters' element={
            <ProtectedRoute token={token}>
              <AdminVoters token={token} />
            </ProtectedRoute>
          }/>
          <Route path='/whatsapp' element={
            <ProtectedRoute token={token}>
              <ErrorBoundary>
                <WhatsAppSettings token={token} />
              </ErrorBoundary>
            </ProtectedRoute>
          }/>
          {/* Audit page removed */}
        </Routes>
        </Suspense>
        </div>
      </div>
    </div>
  );
}

export default App;