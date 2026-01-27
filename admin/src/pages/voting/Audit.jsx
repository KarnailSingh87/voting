import { Navigate } from 'react-router-dom';

// Audit UI has been removed per project request. Keep a lightweight
// redirect so any lingering links won't break the admin app.
const Audit = () => {
  return <Navigate to="/dashboard" replace />;
};

export default Audit;