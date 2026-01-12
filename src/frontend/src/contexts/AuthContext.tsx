import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useIsAuthenticated, useMsal, useAccount } from '@azure/msal-react'
import { InteractionStatus } from '@azure/msal-browser'
import { usersApi, authApi } from '../api/users'
import { getIsAzureAuthEnabled, loginRequest } from '../auth'
import type { User, UserRole } from '../types'

interface AuthContextType {
  // User state
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isMsalAuthenticated: boolean
  isFirstRun: boolean
  error: string | null
  authMode: 'azure' | 'mock'

  // Actions
  login: () => Promise<void>
  logout: () => Promise<void>
  refetch: () => Promise<void>

  // Role checks
  isAdmin: boolean
  isOperator: boolean
  isViewer: boolean
  canManageUsers: boolean
  canManageDatabases: boolean
  canTriggerBackup: boolean
  canDeleteBackups: boolean
  canManageSettings: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Auth Provider for Azure AD mode
 */
function AzureAuthProvider({ children }: AuthProviderProps) {
  const { instance, inProgress } = useMsal()
  const isMsalAuthenticated = useIsAuthenticated()
  const account = useAccount()

  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if a real login just happened (user clicked login button)
  const pendingLoginRef = useRef(false)

  // Fetch user from backend after MSAL authentication
  const fetchUser = useCallback(async () => {
    if (!isMsalAuthenticated || !account) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const response = await usersApi.getCurrentUser()
      setUser(response.user)
      setIsFirstRun(response.is_first_run)

      // Log login event only if this was a real login (not page refresh)
      if (pendingLoginRef.current) {
        pendingLoginRef.current = false
        authApi.logEvent('login')
      }
    } catch (err: unknown) {
      console.error('Failed to fetch current user:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate'
      setError(errorMessage)
      setUser(null)
      pendingLoginRef.current = false
      // Clear MSAL cache on auth error so user can try different account
      await instance.clearCache()
    } finally {
      setIsLoading(false)
    }
  }, [isMsalAuthenticated, account, instance])

  // Fetch user when MSAL authentication state changes
  useEffect(() => {
    if (inProgress === InteractionStatus.None) {
      fetchUser()
    }
  }, [fetchUser, inProgress, isMsalAuthenticated])

  // Login with Azure AD
  const login = useCallback(async () => {
    try {
      // Mark that a real login is in progress
      pendingLoginRef.current = true
      await instance.loginPopup(loginRequest)
    } catch (err) {
      pendingLoginRef.current = false
      console.error('Login failed:', err)
      throw err
    }
  }, [instance])

  // Logout from app only (not from Azure AD)
  const logout = useCallback(async () => {
    try {
      // Log logout event before clearing session
      if (user) {
        await authApi.logEvent('logout')
      }
      setUser(null)
      // Clear only the local session, don't sign out of Azure AD
      const accounts = instance.getAllAccounts()
      if (accounts.length > 0) {
        // Remove the account from MSAL cache
        await instance.clearCache()
      }
    } catch (err) {
      console.error('Logout failed:', err)
      throw err
    }
  }, [instance, user])

  // Role checks
  const isAdmin = user?.role === 'admin'
  const isOperator = user?.role === 'operator'
  const isViewer = user?.role === 'viewer'

  const value: AuthContextType = {
    user,
    isLoading: isLoading || inProgress !== InteractionStatus.None,
    isAuthenticated: !!user,
    isMsalAuthenticated,
    isFirstRun,
    error,
    authMode: 'azure',
    login,
    logout,
    refetch: fetchUser,
    isAdmin,
    isOperator,
    isViewer,
    canManageUsers: isAdmin,
    canManageDatabases: isAdmin || isOperator,
    canTriggerBackup: isAdmin || isOperator,
    canDeleteBackups: isAdmin || isOperator,
    canManageSettings: isAdmin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Auth Provider for Mock mode (development without Azure AD)
 */
function MockAuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUser = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await usersApi.getCurrentUser()
      setUser(response.user)
      setIsFirstRun(response.is_first_run)
    } catch (err: unknown) {
      console.error('Failed to fetch current user:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate'
      setError(errorMessage)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  // Mock login/logout (simplified in mock mode)
  const login = useCallback(async () => {
    await fetchUser()
    // Log login event
    authApi.logEvent('login')
  }, [fetchUser])

  const logout = useCallback(async () => {
    // Log logout event before clearing session
    if (user) {
      await authApi.logEvent('logout')
    }
    // In mock mode, just clear user state temporarily
    setUser(null)
    // Re-fetch to get mock user back
    setTimeout(() => fetchUser(), 100)
  }, [fetchUser, user])

  // Role checks
  const isAdmin = user?.role === 'admin'
  const isOperator = user?.role === 'operator'
  const isViewer = user?.role === 'viewer'

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isMsalAuthenticated: true, // Always "authenticated" in mock mode
    isFirstRun,
    error,
    authMode: 'mock',
    login,
    logout,
    refetch: fetchUser,
    isAdmin,
    isOperator,
    isViewer,
    canManageUsers: isAdmin,
    canManageDatabases: isAdmin || isOperator,
    canTriggerBackup: isAdmin || isOperator,
    canDeleteBackups: isAdmin || isOperator,
    canManageSettings: isAdmin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Main Auth Provider - delegates to Azure or Mock provider based on config
 */
export function AuthProvider({ children }: AuthProviderProps) {
  // Use function to get fresh config value (after config.json is loaded)
  if (getIsAzureAuthEnabled()) {
    return <AzureAuthProvider>{children}</AzureAuthProvider>
  }
  return <MockAuthProvider>{children}</MockAuthProvider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Helper hook for role-based rendering
export function useRequireRole(requiredRoles: UserRole[]): {
  hasAccess: boolean
  isLoading: boolean
} {
  const { user, isLoading } = useAuth()

  const hasAccess = user ? requiredRoles.includes(user.role) : false

  return { hasAccess, isLoading }
}
