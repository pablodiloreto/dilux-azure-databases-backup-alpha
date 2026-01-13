/**
 * MSAL Authentication Provider
 *
 * Wraps the app with MSAL authentication context.
 * Supports both Azure AD authentication and mock mode for development.
 *
 * Uses lazy initialization to ensure config.json is loaded before checking auth mode.
 */

import { ReactNode, useState } from 'react'
import {
  MsalProvider,
  useMsal,
  useIsAuthenticated,
  useAccount,
} from '@azure/msal-react'
import {
  PublicClientApplication,
  EventType,
  AuthenticationResult,
  AccountInfo,
  InteractionStatus,
} from '@azure/msal-browser'
import { getMsalConfig, loginRequest, getIsAzureAuthEnabled, getAuthMode } from './msalConfig'

// MSAL instance - lazily initialized
let msalInstance: PublicClientApplication | null = null
let msalInitialized = false

/**
 * Initialize MSAL instance lazily (after config.json is loaded)
 */
function initializeMsal(): PublicClientApplication | null {
  // Check if already initialized
  if (msalInitialized) {
    return msalInstance
  }

  // Check if Azure auth is enabled (using fresh config)
  const isEnabled = getIsAzureAuthEnabled()
  console.log('[Auth] Checking Azure auth enabled:', isEnabled, 'Mode:', getAuthMode())

  if (!isEnabled) {
    console.log('[Auth] Azure auth disabled, using mock mode')
    msalInitialized = true
    return null
  }

  // Create MSAL instance with fresh config (after config.json is loaded)
  const msalConfig = getMsalConfig()
  console.log('[Auth] Initializing MSAL instance with clientId:', msalConfig.auth.clientId ? msalConfig.auth.clientId.substring(0, 8) + '...' : '(empty)')
  msalInstance = new PublicClientApplication(msalConfig)

  // Handle redirect promise on page load
  msalInstance.initialize().then(() => {
    // Account selection logic on page load
    const accounts = msalInstance!.getAllAccounts()
    if (accounts.length > 0) {
      msalInstance!.setActiveAccount(accounts[0])
    }

    // Listen for sign-in events
    msalInstance!.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        const payload = event.payload as AuthenticationResult
        msalInstance!.setActiveAccount(payload.account)
      }
    })
  })

  msalInitialized = true
  return msalInstance
}


/**
 * Auth context value type
 */
export interface MsalAuthContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  account: AccountInfo | null
  login: () => Promise<void>
  logout: () => Promise<void>
  getAccessToken: () => Promise<string | null>
  authMode: 'azure' | 'mock'
}

/**
 * Hook to use MSAL authentication
 */
export function useMsalAuth(): MsalAuthContextValue {
  const { instance, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const account = useAccount()

  const login = async () => {
    try {
      await instance.loginPopup(loginRequest)
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await instance.logoutPopup({
        postLogoutRedirectUri: window.location.origin,
      })
    } catch (error) {
      console.error('Logout failed:', error)
      throw error
    }
  }

  const getAccessToken = async (): Promise<string | null> => {
    if (!account) return null

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
      })
      return response.accessToken
    } catch (error) {
      // If silent token acquisition fails, try popup
      try {
        const response = await instance.acquireTokenPopup(loginRequest)
        return response.accessToken
      } catch (popupError) {
        console.error('Token acquisition failed:', popupError)
        return null
      }
    }
  }

  return {
    isAuthenticated,
    isLoading: inProgress !== InteractionStatus.None,
    account: account || null,
    login,
    logout,
    getAccessToken,
    authMode: 'azure',
  }
}

/**
 * Mock auth hook for development without Azure AD
 */
export function useMockAuth(): MsalAuthContextValue {
  const [isAuthenticated, setIsAuthenticated] = useState(true) // Auto-authenticated in mock mode

  return {
    isAuthenticated,
    isLoading: false,
    account: {
      homeAccountId: 'mock-user',
      localAccountId: 'mock-user',
      environment: 'mock',
      tenantId: 'mock-tenant',
      username: 'admin@dilux.tech',
      name: 'Dev Admin',
    } as AccountInfo,
    login: async () => {
      setIsAuthenticated(true)
    },
    logout: async () => {
      setIsAuthenticated(false)
    },
    getAccessToken: async () => null, // No token in mock mode
    authMode: 'mock',
  }
}

/**
 * Provider component props
 */
interface MsalAuthProviderProps {
  children: ReactNode
}

/**
 * MSAL Auth Provider Component
 *
 * Wraps children with MSAL context if Azure auth is enabled,
 * otherwise provides mock auth context.
 *
 * Uses lazy initialization to ensure config.json is loaded first.
 */
export function MsalAuthProvider({ children }: MsalAuthProviderProps) {
  // Initialize MSAL lazily (after config.json is loaded by main.tsx)
  const instance = initializeMsal()

  // Check fresh config values
  const azureEnabled = getIsAzureAuthEnabled()

  if (azureEnabled && instance) {
    return (
      <MsalProvider instance={instance}>
        {children}
      </MsalProvider>
    )
  }

  // Mock mode - just render children directly
  // The AuthContext will handle mock authentication
  return <>{children}</>
}

/**
 * Export the MSAL instance for direct access if needed
 */
export { msalInstance }

/**
 * Export auth mode for conditional rendering
 * These are functions to ensure fresh config values after config.json loads
 */
export { getIsAzureAuthEnabled, getAuthMode }

// Legacy const exports (evaluated at import time - may use stale config)
export const isAzureAuthEnabled = getIsAzureAuthEnabled()
export const AUTH_MODE = getAuthMode()
