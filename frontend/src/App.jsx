import React from 'react';
import { Routes, Route } from 'react-router-dom';

// Voting System pages
import Register from './pages/voting/Register';
import Login from './pages/voting/Login';
import Dashboard from './pages/voting/Dashboard';
import Ballot from './pages/voting/Ballot';
import History from './pages/voting/History';
import Verify from './pages/voting/Verify';
import PublicDashboard from './pages/voting/PublicDashboard';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* Voting System routes */}
        <Route path='/' element={<PublicDashboard />} />
        <Route path='/register' element={<Register />} />
        <Route path='/login' element={<Login />} />
        <Route path='/dashboard' element={<Dashboard />} />
        <Route path='/ballot/:id' element={<Ballot />} />
        <Route path='/history' element={<History />} />
        <Route path='/verify/:id' element={<Verify />} />
        <Route path='/public' element={<PublicDashboard />} />
      </Routes>
    </div>
  );
}

export default App;