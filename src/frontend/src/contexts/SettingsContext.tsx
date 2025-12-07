import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { settingsApi, type AppSettings as ApiSettings } from '../api'
import { usersApi } from '../api/users'

// localStorage key for dark mode (instant load, no flash)
const DARK_MODE_KEY = 'dilux-dark-mode'
const PAGE_SIZE_KEY = 'dilux-page-size'

// User preference settings (stored per-user in Table Storage)
interface UserPreferences {
  darkMode: boolean
  pageSize: number
}

// System settings (stored globally in Table Storage)
interface SystemSettings {
  defaultRetentionDays: number
  defaultCompression: boolean
  accessRequestsEnabled: boolean
}

// Combined settings interface
interface Settings extends UserPreferences, SystemSettings {}

interface SettingsContextType {
  settings: Settings
  isLoading: boolean
  error: string | null
  updateUserPreferences: (updates: Partial<UserPreferences>) => Promise<void>
  updateSystemSettings: (updates: Partial<SystemSettings>) => Promise<void>
  toggleDarkMode: () => void
  refetch: () => Promise<void>
}

// Read dark mode from localStorage synchronously (prevents flash on load)
function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(DARK_MODE_KEY)
  if (stored !== null) {
    return stored === 'true'
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function getInitialPageSize(): number {
  if (typeof window === 'undefined') return 25
  const stored = localStorage.getItem(PAGE_SIZE_KEY)
  return stored ? parseInt(stored, 10) : 25
}

const defaultSettings: Settings = {
  // User preferences (will be loaded from user record)
  darkMode: getInitialDarkMode(),
  pageSize: getInitialPageSize(),
  // System settings (will be loaded from settings API)
  defaultRetentionDays: 30,
  defaultCompression: true,
  accessRequestsEnabled: true,
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load settings on mount
  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Load system settings from /api/settings
      const systemSettings = await settingsApi.get()

      // Try to load user preferences from /users/me
      // This will fail if user is not logged in, which is fine
      let userPrefs = { darkMode: settings.darkMode, pageSize: settings.pageSize }
      try {
        const currentUser = await usersApi.getCurrentUser()
        if (currentUser.user) {
          userPrefs = {
            darkMode: currentUser.user.dark_mode,
            pageSize: currentUser.user.page_size,
          }
          // Update localStorage for instant load next time
          localStorage.setItem(DARK_MODE_KEY, String(userPrefs.darkMode))
          localStorage.setItem(PAGE_SIZE_KEY, String(userPrefs.pageSize))
        }
      } catch {
        // User not logged in or error - use localStorage values
      }

      setSettings({
        darkMode: userPrefs.darkMode,
        pageSize: userPrefs.pageSize,
        defaultRetentionDays: systemSettings.default_retention_days,
        defaultCompression: systemSettings.default_compression,
        accessRequestsEnabled: systemSettings.access_requests_enabled,
      })
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError('Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }, [settings.darkMode, settings.pageSize])

  useEffect(() => {
    fetchSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toggle dark mode - updates both localStorage (instant) and server (persistent)
  const toggleDarkMode = useCallback(() => {
    setSettings(prev => {
      const newDarkMode = !prev.darkMode
      localStorage.setItem(DARK_MODE_KEY, String(newDarkMode))

      // Update server in background (fire and forget)
      usersApi.updatePreferences({ dark_mode: newDarkMode }).catch(err => {
        console.error('Failed to save dark mode preference:', err)
      })

      return { ...prev, darkMode: newDarkMode }
    })
  }, [])

  // Update user preferences (dark_mode, page_size)
  const updateUserPreferences = useCallback(async (updates: Partial<UserPreferences>) => {
    // Update local state immediately
    setSettings(prev => ({
      ...prev,
      ...(updates.darkMode !== undefined && { darkMode: updates.darkMode }),
      ...(updates.pageSize !== undefined && { pageSize: updates.pageSize }),
    }))

    // Update localStorage for instant load
    if (updates.darkMode !== undefined) {
      localStorage.setItem(DARK_MODE_KEY, String(updates.darkMode))
    }
    if (updates.pageSize !== undefined) {
      localStorage.setItem(PAGE_SIZE_KEY, String(updates.pageSize))
    }

    // Update server
    try {
      const apiUpdates: { dark_mode?: boolean; page_size?: number } = {}
      if (updates.darkMode !== undefined) apiUpdates.dark_mode = updates.darkMode
      if (updates.pageSize !== undefined) apiUpdates.page_size = updates.pageSize

      if (Object.keys(apiUpdates).length > 0) {
        await usersApi.updatePreferences(apiUpdates)
      }
    } catch (err) {
      console.error('Failed to save user preferences:', err)
      setError('Failed to save preferences')
      throw err
    }
  }, [])

  // Update system settings (retention, compression, access requests)
  const updateSystemSettings = useCallback(async (updates: Partial<SystemSettings>) => {
    setError(null)
    try {
      const apiUpdates: Partial<ApiSettings> = {}
      if (updates.defaultRetentionDays !== undefined) {
        apiUpdates.default_retention_days = updates.defaultRetentionDays
      }
      if (updates.defaultCompression !== undefined) {
        apiUpdates.default_compression = updates.defaultCompression
      }
      if (updates.accessRequestsEnabled !== undefined) {
        apiUpdates.access_requests_enabled = updates.accessRequestsEnabled
      }

      if (Object.keys(apiUpdates).length > 0) {
        const savedSettings = await settingsApi.update(apiUpdates)
        setSettings(prev => ({
          ...prev,
          defaultRetentionDays: savedSettings.default_retention_days,
          defaultCompression: savedSettings.default_compression,
          accessRequestsEnabled: savedSettings.access_requests_enabled,
        }))
      }
    } catch (err) {
      console.error('Failed to save system settings:', err)
      setError('Failed to save settings')
      throw err
    }
  }, [])

  const value = useMemo(
    () => ({
      settings,
      isLoading,
      error,
      updateUserPreferences,
      updateSystemSettings,
      toggleDarkMode,
      refetch: fetchSettings,
    }),
    [settings, isLoading, error, updateUserPreferences, updateSystemSettings, toggleDarkMode, fetchSettings]
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
