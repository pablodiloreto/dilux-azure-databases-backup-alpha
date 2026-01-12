import axios, { AxiosInstance, AxiosError } from 'axios'
import { msalInstance, getIsAzureAuthEnabled, loginRequest } from '../auth'
import { getConfig } from '../config'

// Get API URL from runtime config (loaded from /config.json in production)
const getApiUrl = () => {
  const config = getConfig()
  // In production, config.json provides the full API URL
  // In development, we use /api which gets proxied by Vite
  return config.apiUrl
}

// Create axios instance - baseURL will be updated by interceptor after config loads
export const apiClient: AxiosInstance = axios.create({
  // Don't set baseURL here - let the interceptor handle it dynamically
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Get access token from MSAL for API requests
 */
async function getAccessToken(): Promise<string | null> {
  if (!getIsAzureAuthEnabled() || !msalInstance) {
    return null
  }

  const accounts = msalInstance.getAllAccounts()
  if (accounts.length === 0) {
    return null
  }

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    })
    return response.accessToken
  } catch (error) {
    console.warn('Silent token acquisition failed, user may need to re-authenticate')
    return null
  }
}

// Request interceptor for adding auth token and updating baseURL
apiClient.interceptors.request.use(
  async (config) => {
    // ALWAYS get fresh baseURL from runtime config
    // This is critical because config.json loads async after the app starts
    const apiUrl = getApiUrl()
    config.baseURL = apiUrl

    // Debug log in development
    if (import.meta.env.DEV) {
      console.log('[API] Request to:', apiUrl + config.url)
    }

    // Get Azure AD token if available
    const token = await getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
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
      // Handle 401 unauthorized - may need to re-authenticate
      if (error.response.status === 401 && getIsAzureAuthEnabled()) {
        console.warn('Received 401 - user may need to re-authenticate')
        // Could trigger re-authentication here if needed
      }

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
