import { apiClient } from './client'

export type TimePeriod = '1d' | '7d' | '30d' | 'all'

export interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'unknown'
  message: string
  total?: number
  enabled?: number
}

export interface SystemStatus {
  timestamp: string
  storage: {
    total_size_bytes: number
    total_size_formatted: string
    backup_count: number
  }
  backups: {
    period: TimePeriod
    today: number
    completed: number
    failed: number
    success_rate: number
  }
  services: {
    api: ServiceStatus
    storage: ServiceStatus
    databases: ServiceStatus
  }
}

export interface BackupAlert {
  database_id: string
  database_name: string
  database_type: string
  consecutive_failures: number
  last_failure_at: string
  last_error: string | null
}

export interface BackupAlertsResponse {
  alerts: BackupAlert[]
  count: number
}

export interface FunctionAppVNetInfo {
  name: string
  type: 'api' | 'scheduler' | 'processor'
  vnet_name: string | null
  subnet_name: string | null
  vnet_resource_group: string | null
  is_connected: boolean
  error: string | null
}

export interface VNetGroup {
  vnet_name: string
  vnet_resource_group: string
  subnet_name: string
  connected_apps: string[]
  connection_status: string
  is_complete: boolean
}

export interface VNetStatusResponse {
  has_vnet_integration: boolean
  vnets: VNetGroup[]
  function_apps: FunctionAppVNetInfo[]
  inconsistencies: string[]
  query_error: string | null
}

export const systemApi = {
  /**
   * Get comprehensive system status
   * @param period - Time period for backup stats: 1d, 7d, 30d, all (default: 1d)
   */
  getStatus: async (period: TimePeriod = '1d'): Promise<SystemStatus> => {
    const response = await apiClient.get<SystemStatus>('/system-status', {
      params: { period },
    })
    return response.data
  },

  /**
   * Get backup alerts (databases with consecutive failures)
   * @param consecutiveFailures - Number of consecutive failures to trigger alert (default: 2)
   */
  getBackupAlerts: async (consecutiveFailures: number = 2): Promise<BackupAlertsResponse> => {
    const response = await apiClient.get<BackupAlertsResponse>('/backup-alerts', {
      params: { consecutive_failures: consecutiveFailures },
    })
    return response.data
  },

  /**
   * Get VNet integration status (queries Azure in real-time)
   * Separate endpoint with longer cache time since VNet changes are infrequent
   */
  getVNetStatus: async (): Promise<VNetStatusResponse> => {
    const response = await apiClient.get<VNetStatusResponse>('/vnet-status')
    return response.data
  },
}

export default systemApi
