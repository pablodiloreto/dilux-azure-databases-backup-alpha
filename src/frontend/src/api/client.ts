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
    let message: string
    if (error.response) {
      // Server responded with error - extract message from response body
      message = (error.response.data as { error?: string })?.error || error.message
      console.error(`API Error: ${error.response.status} - ${message}`)
    } else if (error.request) {
      // Request made but no response
      message = 'No response received from server'
      console.error('API Error: No response received')
    } else {
      // Error setting up request
      message = error.message
      console.error(`API Error: ${error.message}`)
    }
    // Create a new error with the extracted message so callers can use err.message
    const enhancedError = new Error(message) as Error & { originalError: AxiosError }
    enhancedError.originalError = error
    return Promise.reject(enhancedError)
  }
)

export default apiClient
