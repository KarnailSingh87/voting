/* global Promise */
import axios from 'axios';

// In production (same origin), leave blank so requests go to the same host.
// In development, use the env variable or fallback to localhost.
const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5005';

const axiosInstance = axios.create({
  baseURL: backendUrl
});

// Add request interceptor to include auth token and set Content-Type
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Only set Content-Type to JSON if not FormData (let axios set multipart/form-data automatically for FormData)
    if (!(config.data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default axiosInstance;
