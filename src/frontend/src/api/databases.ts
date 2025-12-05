import { apiClient } from './client'
import type { DatabaseConfig, CreateDatabaseInput, UpdateDatabaseInput } from '../types'

interface DatabasesResponse {
  databases: DatabaseConfig[]
  count: number
  total: number
  has_more: boolean
}

interface GetAllOptions {
  enabledOnly?: boolean
  type?: string
  limit?: number
  search?: string
}

interface DatabaseResponse {
  database: DatabaseConfig
  message?: string
}

interface TriggerBackupResponse {
  message: string
  job_id: string
  queue_message_id: string
}

export const databasesApi = {
  /**
   * Get all database configurations
   */
  getAll: async (options?: GetAllOptions): Promise<DatabasesResponse> => {
    const params = new URLSearchParams()
    if (options?.enabledOnly) params.append('enabled_only', 'true')
    if (options?.type) params.append('type', options.type)
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.search) params.append('search', options.search)

    const response = await apiClient.get<DatabasesResponse>('/databases', { params })
    return response.data
  },

  /**
   * Get a single database configuration
   */
  getById: async (id: string): Promise<DatabaseConfig> => {
    const response = await apiClient.get<DatabaseResponse>(`/databases/${id}`)
    return response.data.database
  },

  /**
   * Create a new database configuration
   */
  create: async (data: CreateDatabaseInput): Promise<DatabaseConfig> => {
    const response = await apiClient.post<DatabaseResponse>('/databases', data)
    return response.data.database
  },

  /**
   * Update a database configuration
   */
  update: async (id: string, data: UpdateDatabaseInput): Promise<DatabaseConfig> => {
    const response = await apiClient.put<DatabaseResponse>(`/databases/${id}`, data)
    return response.data.database
  },

  /**
   * Delete a database configuration
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/databases/${id}`)
  },

  /**
   * Trigger a manual backup
   */
  triggerBackup: async (id: string): Promise<TriggerBackupResponse> => {
    const response = await apiClient.post<TriggerBackupResponse>(`/databases/${id}/backup`)
    return response.data
  },
}

export default databasesApi
