import { useMemo } from 'react'
import { ThemeProvider, CssBaseline, GlobalStyles } from '@mui/material'
import { useSettings } from '../contexts/SettingsContext'
import { getTheme } from '../theme'

interface ThemeWrapperProps {
  children: React.ReactNode
}

// Global styles for mobile responsiveness and layout stability
const globalStyles = (
  <GlobalStyles
    styles={{
      html: {
        // Prevent layout shift when scrollbar appears/disappears (e.g., when modals open)
        // Use !important to override MUI's inline styles on body
        overflowY: 'scroll !important' as never,
        scrollbarGutter: 'stable',
      },
      body: {
        // Override MUI Dialog/Modal scroll lock behavior
        overflow: 'visible !important' as never,
        paddingRight: '0 !important' as never,
      },
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
