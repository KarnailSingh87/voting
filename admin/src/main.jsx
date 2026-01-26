import ReactDOM from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.jsx'
import './index.css'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

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
