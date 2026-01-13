/**
 * MSAL Configuration for Azure AD Authentication
 *
 * This configures the Microsoft Authentication Library (MSAL) for
 * single-page application (SPA) authentication with Azure AD.
 *
 * Configuration is loaded from:
 * - /config.json in production (generated during Azure deployment)
 * - Vite environment variables in development
 */

import { Configuration, LogLevel } from '@azure/msal-browser'
import { getConfig, isAzureAuthEnabled as checkAzureAuth } from '../config'

// Get config from runtime configuration system (always fresh)
const getAuthConfig = () => getConfig()

// Auth mode and enabled status - use functions to get fresh values after config loads
export const getAuthMode = () => getAuthConfig().authMode
export const getIsAzureAuthEnabled = () => checkAzureAuth()

// Legacy exports for backwards compatibility (evaluated at import time - may be stale)
export const AUTH_MODE = getAuthMode()
export const isAzureAuthEnabled = getIsAzureAuthEnabled()

/**
 * MSAL Configuration
 *
 * IMPORTANT: This is a FUNCTION, not a constant, because it must be called
 * AFTER config.json is loaded. If we create a const at module import time,
 * the config values will be empty (config.json hasn't loaded yet).
 */
export function getMsalConfig(): Configuration {
  const config = getAuthConfig()
  return {
    auth: {
      clientId: config.azureClientId,
      authority: `https://login.microsoftonline.com/${config.azureTenantId}`,
      redirectUri: config.azureRedirectUri,
      postLogoutRedirectUri: config.azureRedirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: 'sessionStorage', // Use sessionStorage for better security
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return
          switch (level) {
            case LogLevel.Error:
              console.error('[MSAL]', message)
              break
            case LogLevel.Warning:
              console.warn('[MSAL]', message)
              break
            case LogLevel.Info:
              // Only log in development
              if (import.meta.env.DEV) {
                console.info('[MSAL]', message)
              }
              break
            case LogLevel.Verbose:
              // Only log in development with verbose flag
              if (import.meta.env.DEV && import.meta.env.VITE_MSAL_VERBOSE) {
                console.debug('[MSAL]', message)
              }
              break
          }
        },
        logLevel: import.meta.env.DEV ? LogLevel.Warning : LogLevel.Error,
      },
    },
  }
}

// Legacy export for backwards compatibility - calls the function
export const msalConfig: Configuration = getMsalConfig()

/**
 * Scopes to request during login
 *
 * - openid: Required for authentication
 * - profile: Get user profile info (name, etc.)
 * - email: Get user email
 * - User.Read: Read user's basic profile from Microsoft Graph
 */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
  prompt: 'select_account', // Always show account picker
}

/**
 * Scopes for API calls (if using custom API with Azure AD protection)
 */
export const apiRequest = {
  scopes: [`api://${getAuthConfig().azureClientId}/access_as_user`],
}

/**
 * Check if MSAL is properly configured
 */
export function isMsalConfigured(): boolean {
  const config = getAuthConfig()
  return !!config.azureClientId && !!config.azureTenantId
}

/**
 * Get configuration status for debugging
 */
export function getMsalConfigStatus(): {
  configured: boolean
  clientId: string
  tenantId: string
  redirectUri: string
  authMode: string
} {
  const config = getAuthConfig()
  return {
    configured: isMsalConfigured(),
    clientId: config.azureClientId ? `${config.azureClientId.substring(0, 8)}...` : '(not set)',
    tenantId: config.azureTenantId ? `${config.azureTenantId.substring(0, 8)}...` : '(not set)',
    redirectUri: config.azureRedirectUri,
    authMode: config.authMode,
  }
}
