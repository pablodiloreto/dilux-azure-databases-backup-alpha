import axios, { AxiosInstance, AxiosError } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    // TODO: Add Azure AD token when auth is implemented
    // const token = getAccessToken()
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      // Server responded with error
      const message = (error.response.data as { error?: string })?.error || error.message
      console.error(`API Error: ${error.response.status} - ${message}`)
    } else if (error.request) {
      // Request made but no response
      console.error('API Error: No response received')
    } else {
      // Error setting up request
      console.error(`API Error: ${error.message}`)
    }
    return Promise.reject(error)
  }
)

export default apiClient
