/**
 * Runtime Configuration System
 *
 * This module provides runtime configuration that can be loaded from:
 * 1. /config.json (generated during Azure deployment) - PRODUCTION
 * 2. Vite environment variables (import.meta.env) - DEVELOPMENT
 *
 * This allows the same build artifact to work in any environment
 * without rebuilding.
 */

export interface AppConfig {
  apiUrl: string
  azureClientId: string
  azureTenantId: string
  azureRedirectUri: string
  authMode: 'azure' | 'mock'
}

// Default configuration (used in development or as fallback)
const defaultConfig: AppConfig = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  azureClientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
  azureTenantId: import.meta.env.VITE_AZURE_TENANT_ID || '',
  azureRedirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin,
  authMode: (import.meta.env.VITE_AUTH_MODE as 'azure' | 'mock') || 'mock',
}

// Runtime configuration (loaded from /config.json in production)
let runtimeConfig: AppConfig | null = null
let configLoaded = false
let configLoadPromise: Promise<void> | null = null

/**
 * Load configuration from /config.json
 * This file is generated during Azure deployment with the correct URLs
 */
async function loadRuntimeConfig(): Promise<void> {
  if (configLoaded) return

  try {
    const response = await fetch('/config.json', {
      cache: 'no-cache', // Always get fresh config
    })

    if (response.ok) {
      const config = await response.json()
      runtimeConfig = {
        apiUrl: config.apiUrl || config.API_URL || defaultConfig.apiUrl,
        azureClientId: config.azureClientId || config.AZURE_CLIENT_ID || defaultConfig.azureClientId,
        azureTenantId: config.azureTenantId || config.AZURE_TENANT_ID || defaultConfig.azureTenantId,
        azureRedirectUri: config.azureRedirectUri || config.AZURE_REDIRECT_URI || defaultConfig.azureRedirectUri,
        authMode: config.authMode || config.AUTH_MODE || defaultConfig.authMode,
      }
      console.log('[Config] Loaded runtime configuration from /config.json')
    } else {
      console.log('[Config] No /config.json found, using default configuration')
    }
  } catch (error) {
    console.log('[Config] Could not load /config.json, using default configuration')
  }

  configLoaded = true
}

/**
 * Initialize configuration - call this before using getConfig()
 * Returns a promise that resolves when config is loaded
 */
export async function initConfig(): Promise<void> {
  if (!configLoadPromise) {
    configLoadPromise = loadRuntimeConfig()
  }
  return configLoadPromise
}

/**
 * Get current configuration
 * Falls back to default config if runtime config not loaded
 */
export function getConfig(): AppConfig {
  return runtimeConfig || defaultConfig
}

/**
 * Check if Azure AD authentication is enabled and properly configured
 */
export function isAzureAuthEnabled(): boolean {
  const config = getConfig()
  return config.authMode === 'azure' && !!config.azureClientId && !!config.azureTenantId
}

/**
 * Get configuration status for debugging
 */
export function getConfigStatus(): {
  source: 'runtime' | 'default'
  config: AppConfig
  azureAuthEnabled: boolean
} {
  return {
    source: runtimeConfig ? 'runtime' : 'default',
    config: getConfig(),
    azureAuthEnabled: isAzureAuthEnabled(),
  }
}

export default getConfig
