import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { settingsApi, type AppSettings as ApiSettings } from '../api'

// localStorage key for dark mode (instant load, no flash)
const DARK_MODE_KEY = 'dilux-dark-mode'

interface Settings {
  darkMode: boolean
  defaultRetentionDays: number
  defaultCompression: boolean
}

interface SettingsContextType {
  settings: Settings
  isLoading: boolean
  error: string | null
  updateSettings: (updates: Partial<Settings>) => Promise<void>
  toggleDarkMode: () => void
  refetch: () => Promise<void>
}

// Read dark mode from localStorage synchronously (prevents flash)
function getInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(DARK_MODE_KEY)
  if (stored !== null) {
    return stored === 'true'
  }
  // Fall back to system preference
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

const defaultSettings: Settings = {
  darkMode: getInitialDarkMode(),
  defaultRetentionDays: 30,
  defaultCompression: true,
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

// Convert API format to frontend format (excluding darkMode which is local)
function apiToFrontend(api: ApiSettings, currentDarkMode: boolean): Settings {
  return {
    darkMode: currentDarkMode, // Keep local value
    defaultRetentionDays: api.default_retention_days,
    defaultCompression: api.default_compression,
  }
}

// Convert frontend format to API format (excluding darkMode)
function frontendToApi(settings: Partial<Settings>): Partial<Omit<ApiSettings, 'updated_at' | 'dark_mode'>> {
  const result: Partial<Omit<ApiSettings, 'updated_at'>> = {}
  if (settings.defaultRetentionDays !== undefined) result.default_retention_days = settings.defaultRetentionDays
  if (settings.defaultCompression !== undefined) result.default_compression = settings.defaultCompression
  return result
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load non-UI settings from API on mount
  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const apiSettings = await settingsApi.get()
      setSettings(prev => apiToFrontend(apiSettings, prev.darkMode))
    } catch (err) {
      console.error('Failed to load settings from API:', err)
      setError('Failed to load settings')
      // Fall back to defaults on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Toggle dark mode - saves to localStorage only (instant, no API call)
  const toggleDarkMode = useCallback(() => {
    setSettings(prev => {
      const newDarkMode = !prev.darkMode
      localStorage.setItem(DARK_MODE_KEY, String(newDarkMode))
      return { ...prev, darkMode: newDarkMode }
    })
  }, [])

  // Update other settings (retention, compression) - saves to API
  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    // Handle dark mode locally
    if (updates.darkMode !== undefined) {
      localStorage.setItem(DARK_MODE_KEY, String(updates.darkMode))
      setSettings(prev => ({ ...prev, darkMode: updates.darkMode! }))
    }

    // Handle API settings
    const apiUpdates = frontendToApi(updates)
    if (Object.keys(apiUpdates).length > 0) {
      setError(null)
      try {
        const savedSettings = await settingsApi.update(apiUpdates)
        setSettings(prev => apiToFrontend(savedSettings, prev.darkMode))
      } catch (err) {
        console.error('Failed to save settings:', err)
        setError('Failed to save settings')
        throw err
      }
    }
  }, [])

  const value = useMemo(
    () => ({
      settings,
      isLoading,
      error,
      updateSettings,
      toggleDarkMode,
      refetch: fetchSettings,
    }),
    [settings, isLoading, error, updateSettings, toggleDarkMode, fetchSettings]
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
