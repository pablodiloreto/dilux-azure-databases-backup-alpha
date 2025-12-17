/**
 * MSAL Configuration for Azure AD Authentication
 *
 * This configures the Microsoft Authentication Library (MSAL) for
 * single-page application (SPA) authentication with Azure AD.
 */

import { Configuration, LogLevel } from '@azure/msal-browser'

// Environment variables
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || ''
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || ''
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin

// Auth mode: 'azure' for real auth, 'mock' for development without Azure AD
export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || 'mock'
export const isAzureAuthEnabled = AUTH_MODE === 'azure' && !!clientId && !!tenantId

/**
 * MSAL Configuration
 */
export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
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
  scopes: [`api://${clientId}/access_as_user`],
}

/**
 * Check if MSAL is properly configured
 */
export function isMsalConfigured(): boolean {
  return !!clientId && !!tenantId
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
  return {
    configured: isMsalConfigured(),
    clientId: clientId ? `${clientId.substring(0, 8)}...` : '(not set)',
    tenantId: tenantId ? `${tenantId.substring(0, 8)}...` : '(not set)',
    redirectUri,
    authMode: AUTH_MODE,
  }
}
