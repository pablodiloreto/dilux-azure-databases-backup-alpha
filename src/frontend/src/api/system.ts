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
}

export default systemApi
