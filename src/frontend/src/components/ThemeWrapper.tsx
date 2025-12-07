import { useMemo } from 'react'
import { ThemeProvider, CssBaseline, GlobalStyles } from '@mui/material'
import { useSettings } from '../contexts/SettingsContext'
import { getTheme } from '../theme'

interface ThemeWrapperProps {
  children: React.ReactNode
}

// Global styles for mobile responsiveness
const globalStyles = (
  <GlobalStyles
    styles={{
      'html, body': {
        overflowX: 'hidden',
        width: '100%',
        margin: 0,
        padding: 0,
      },
      '#root': {
        overflowX: 'hidden',
        width: '100%',
      },
    }}
  />
)

export function ThemeWrapper({ children }: ThemeWrapperProps) {
  const { settings } = useSettings()

  const theme = useMemo(
    () => getTheme(settings.darkMode ? 'dark' : 'light'),
    [settings.darkMode]
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {globalStyles}
      {children}
    </ThemeProvider>
  )
}
