import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { settingsApi, type AppSettings as ApiSettings } from '../api'

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
  toggleDarkMode: () => Promise<void>
  refetch: () => Promise<void>
}

const defaultSettings: Settings = {
  darkMode: false,
  defaultRetentionDays: 30,
  defaultCompression: true,
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

// Convert API format to frontend format
function apiToFrontend(api: ApiSettings): Settings {
  return {
    darkMode: api.dark_mode,
    defaultRetentionDays: api.default_retention_days,
    defaultCompression: api.default_compression,
  }
}

// Convert frontend format to API format
function frontendToApi(settings: Partial<Settings>): Partial<Omit<ApiSettings, 'updated_at'>> {
  const result: Partial<Omit<ApiSettings, 'updated_at'>> = {}
  if (settings.darkMode !== undefined) result.dark_mode = settings.darkMode
  if (settings.defaultRetentionDays !== undefined) result.default_retention_days = settings.defaultRetentionDays
  if (settings.defaultCompression !== undefined) result.default_compression = settings.defaultCompression
  return result
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load settings from API on mount
  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const apiSettings = await settingsApi.get()
      setSettings(apiToFrontend(apiSettings))
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

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    setError(null)
    try {
      const apiUpdates = frontendToApi(updates)
      const savedSettings = await settingsApi.update(apiUpdates)
      setSettings(apiToFrontend(savedSettings))
    } catch (err) {
      console.error('Failed to save settings:', err)
      setError('Failed to save settings')
      throw err
    }
  }, [])

  const toggleDarkMode = useCallback(async () => {
    await updateSettings({ darkMode: !settings.darkMode })
  }, [settings.darkMode, updateSettings])

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
