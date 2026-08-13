import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';

import PublicDashboard from './pages/voting/PublicDashboard';

// Lazy-loaded secondary pages for code splitting
const Register = lazy(() => import('./pages/voting/Register'));
const Login = lazy(() => import('./pages/voting/Login'));
const Dashboard = lazy(() => import('./pages/voting/Dashboard'));
const Ballot = lazy(() => import('./pages/voting/Ballot'));
const History = lazy(() => import('./pages/voting/History'));
const Verify = lazy(() => import('./pages/voting/Verify'));
const Profile = lazy(() => import('./pages/voting/Profile'));
const PublicElection = lazy(() => import('./pages/voting/PublicElection'));
const PublicLedger = lazy(() => import('./pages/voting/PublicLedger'));
const StudentDetail = lazy(() => import('./pages/voting/StudentDetail'));

const LoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center">
    <svg className="animate-spin h-10 w-10 text-cyan-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  </div>
);

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Voting System routes */}
          <Route path='/' element={<PublicDashboard />} />
          <Route path='/register' element={<Register />} />
          <Route path='/login' element={<Login />} />
          <Route path='/student/:roll' element={<StudentDetail />} />
          <Route path='/dashboard' element={<Dashboard />} />
          <Route path='/ballot/:id' element={<Ballot />} />
          <Route path='/history' element={<History />} />
          <Route path='/profile' element={<Profile />} />
          <Route path='/verify/:id' element={<Verify />} />
          <Route path='/public' element={<PublicDashboard />} />
          <Route path='/public/election/:id' element={<PublicElection />} />
          <Route path='/public/election/:id/ledger' element={<PublicLedger />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;