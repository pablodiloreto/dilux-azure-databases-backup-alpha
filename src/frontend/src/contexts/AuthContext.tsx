import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { usersApi } from '../api/users'
import type { User, UserRole } from '../types'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isFirstRun: boolean
  error: string | null
  refetch: () => Promise<void>
  // Role checks
  isAdmin: boolean
  isOperator: boolean
  isViewer: boolean
  canManageUsers: boolean
  canManageDatabases: boolean
  canTriggerBackup: boolean
  canManageSettings: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
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

  // Role checks
  const isAdmin = user?.role === 'admin'
  const isOperator = user?.role === 'operator'
  const isViewer = user?.role === 'viewer'

  const canManageUsers = isAdmin
  const canManageDatabases = isAdmin || isOperator
  const canTriggerBackup = isAdmin || isOperator
  const canManageSettings = isAdmin

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isFirstRun,
    error,
    refetch: fetchUser,
    isAdmin,
    isOperator,
    isViewer,
    canManageUsers,
    canManageDatabases,
    canTriggerBackup,
    canManageSettings,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
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
