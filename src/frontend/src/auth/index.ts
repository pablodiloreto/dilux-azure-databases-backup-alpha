/**
 * Authentication module exports
 */

export {
  msalConfig,
  loginRequest,
  apiRequest,
  isAzureAuthEnabled,
  AUTH_MODE,
  getIsAzureAuthEnabled,
  getAuthMode,
  isMsalConfigured,
  getMsalConfigStatus,
} from './msalConfig'

export {
  MsalAuthProvider,
  useMsalAuth,
  useMockAuth,
  msalInstance,
} from './MsalAuthProvider'

export type { MsalAuthContextValue } from './MsalAuthProvider'
