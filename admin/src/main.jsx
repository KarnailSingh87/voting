import ReactDOM from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.jsx'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

// Initialize theme globally so all pages/components honor it on first render
(() => {
  try {
    const stored = localStorage.getItem('adminTheme');
    if (stored) {
      document.documentElement.classList.toggle('dark', stored === 'dark');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
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
