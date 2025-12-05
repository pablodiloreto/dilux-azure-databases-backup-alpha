import { useMemo } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { useSettings } from '../contexts/SettingsContext'
import { getTheme } from '../theme'

interface ThemeWrapperProps {
  children: React.ReactNode
}

export function ThemeWrapper({ children }: ThemeWrapperProps) {
  const { settings } = useSettings()

  const theme = useMemo(
    () => getTheme(settings.darkMode ? 'dark' : 'light'),
    [settings.darkMode]
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
