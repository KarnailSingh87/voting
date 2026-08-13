import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { Web3Provider } from './context/Web3Context'
import RouteErrorBoundary from './components/RouteErrorBoundary'

// Initialize theme globally (default to light mode unless explicitly set to dark in localStorage)
(() => {
  try {
    const stored = localStorage.getItem('voterTheme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      if (!stored) {
        localStorage.setItem('voterTheme', 'light');
      }
    }
  } catch (e) {
    // ignore
  }
})();

const router = createBrowserRouter([
  { path: '*', element: <App />, errorElement: <RouteErrorBoundary /> }
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <Web3Provider>
      <RouterProvider router={router} />
    </Web3Provider>
    <ToastContainer position="top-right" autoClose={3000} />
  </>
)
