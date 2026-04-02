import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Initialize theme globally so pages render with the correct theme instantly
(() => {
  try {
    const stored = localStorage.getItem('voterTheme');
    if (stored) {
      document.documentElement.classList.toggle('dark', stored === 'dark');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    // ignore
  }
})();

const router = createBrowserRouter([
  { path: '*', element: <App /> }
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <>
    <RouterProvider router={router} />
    <ToastContainer position="top-right" autoClose={3000} />
  </>
)
