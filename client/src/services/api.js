import axios from 'axios'
import { useAuthStore } from '@/stores/useAuthStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request Interceptor - fügt Token hinzu
api.interceptors.request.use(
  (config) => {
    try {
      const authStore = useAuthStore()
      if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`
      }
    } catch (error) {
      console.warn('Auth store not available:', error)
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response Interceptor - behandelt Auth-Fehler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      try {
        const authStore = useAuthStore()
        authStore.clearAuth()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      } catch (err) {
        console.warn('Auth store not available:', err)
      }
    }
    return Promise.reject(error)
  }
)

export default api

