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
  offset?: number
  search?: string
  host?: string
  policyId?: string
  engineId?: string
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

interface TestConnectionRequest {
  database_type: string
  host: string
  port: number
  database_name: string
  username?: string
  password?: string
  engine_id?: string
  use_engine_credentials?: boolean
}

interface TestConnectionResponse {
  success: boolean
  message: string
  error_type?: string
  duration_ms?: number
}

interface BackupStatsResponse {
  database_id: string
  count: number
  total_size_bytes: number
  total_size_formatted: string
}

interface DeleteOptions {
  deleteBackups?: boolean
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
    if (options?.offset) params.append('offset', options.offset.toString())
    if (options?.search) params.append('search', options.search)
    if (options?.host) params.append('host', options.host)
    if (options?.policyId) params.append('policy_id', options.policyId)
    if (options?.engineId) params.append('engine_id', options.engineId)

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
  delete: async (id: string, options?: DeleteOptions): Promise<void> => {
    const params = new URLSearchParams()
    if (options?.deleteBackups) params.append('delete_backups', 'true')
    await apiClient.delete(`/databases/${id}`, { params })
  },

  /**
   * Get backup statistics for a database
   */
  getBackupStats: async (id: string): Promise<BackupStatsResponse> => {
    const response = await apiClient.get<BackupStatsResponse>(`/databases/${id}/backup-stats`)
    return response.data
  },

  /**
   * Trigger a manual backup
   */
  triggerBackup: async (id: string): Promise<TriggerBackupResponse> => {
    const response = await apiClient.post<TriggerBackupResponse>(`/databases/${id}/backup`)
    return response.data
  },

  /**
   * Test database connection
   */
  testConnection: async (data: TestConnectionRequest): Promise<TestConnectionResponse> => {
    const response = await apiClient.post<TestConnectionResponse>('/databases/test-connection', data)
    return response.data
  },
}

export default databasesApi
