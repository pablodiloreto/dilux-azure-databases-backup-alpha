import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { SettingsProvider } from './contexts/SettingsContext'
import { ThemeWrapper } from './components/ThemeWrapper'
import { initConfig } from './config'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

// Initialize runtime configuration before rendering the app
// This loads /config.json in production with Azure URLs
initConfig().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <ThemeWrapper>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ThemeWrapper>
        </SettingsProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  )
})
