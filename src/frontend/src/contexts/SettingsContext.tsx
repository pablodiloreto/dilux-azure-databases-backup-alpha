import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

interface Settings {
  darkMode: boolean
  defaultRetentionDays: number
  defaultCompression: boolean
}

interface SettingsContextType {
  settings: Settings
  updateSettings: (updates: Partial<Settings>) => void
  toggleDarkMode: () => void
}

const defaultSettings: Settings = {
  darkMode: false,
  defaultRetentionDays: 30,
  defaultCompression: true,
}

const STORAGE_KEY = 'dilux-backup-settings'

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    // Load from localStorage on initial render
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        return { ...defaultSettings, ...JSON.parse(stored) }
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage:', e)
    }
    return defaultSettings
  })

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (e) {
      console.error('Failed to save settings to localStorage:', e)
    }
  }, [settings])

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...updates }))
  }

  const toggleDarkMode = () => {
    setSettings((prev) => ({ ...prev, darkMode: !prev.darkMode }))
  }

  const value = useMemo(
    () => ({ settings, updateSettings, toggleDarkMode }),
    [settings]
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
