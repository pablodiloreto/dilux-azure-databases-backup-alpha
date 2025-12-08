import { apiClient } from './client'
import type { Engine, EnginesResponse, CreateEngineInput, UpdateEngineInput, DiscoveredDatabase } from '../types'

export const enginesApi = {
  async getAll(params?: { limit?: number; offset?: number; search?: string; engine_type?: string }): Promise<EnginesResponse> {
    const response = await apiClient.get('/engines', { params })
    return response.data
  },

  async getById(id: string): Promise<Engine> {
    const response = await apiClient.get(`/engines/${id}`)
    return response.data
  },

  async create(input: CreateEngineInput): Promise<{ engine: Engine; discovered_databases?: DiscoveredDatabase[] }> {
    const response = await apiClient.post('/engines', input)
    return response.data
  },

  async update(id: string, input: UpdateEngineInput): Promise<{ engine: Engine; databases_updated?: number }> {
    const response = await apiClient.put(`/engines/${id}`, input)
    return response.data
  },

  async delete(id: string, options?: { deleteDatabases?: boolean; deleteBackups?: boolean }): Promise<{
    deleted: boolean
    databases_deleted?: number
    backups_deleted?: { deleted_files: number; deleted_records: number; errors: string[] }
  }> {
    const params = new URLSearchParams()
    if (options?.deleteDatabases) params.append('delete_databases', 'true')
    if (options?.deleteBackups) params.append('delete_backups', 'true')
    const response = await apiClient.delete(`/engines/${id}`, { params })
    return response.data
  },

  async testConnection(id: string): Promise<{ success: boolean; message: string; latency_ms?: number }> {
    const response = await apiClient.post(`/engines/${id}/test`)
    return response.data
  },

  async discoverDatabases(id: string): Promise<{ databases: DiscoveredDatabase[]; last_discovery: string }> {
    const response = await apiClient.post(`/engines/${id}/discover`)
    return response.data
  },

  async addDatabases(id: string, databases: Array<{ name: string; alias?: string; policy_id?: string }>, useEngineCredentials: boolean = true): Promise<{ created: unknown[]; errors: unknown[]; total_created: number; total_errors: number }> {
    const response = await apiClient.post(`/engines/${id}/databases`, {
      databases,
      use_engine_credentials: useEngineCredentials,
    })
    return response.data
  },
}
