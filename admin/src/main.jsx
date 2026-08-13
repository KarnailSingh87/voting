import ReactDOM from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.jsx'
import './index.css'
import './i18n'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Initialize theme globally (default to light mode unless explicitly set to dark in localStorage)
(() => {
  try {
    const stored = localStorage.getItem('adminTheme');
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      if (!stored) {
        localStorage.setItem('adminTheme', 'light');
      }
    }
  } catch (e) {
    // ignore
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Create a router and opt into React Router v7 future flags */}
    <RouterProvider router={createBrowserRouter([
      { path: '*', element: <App /> }
    ], {
      future: {
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }
    })} />
  </StrictMode>
)
