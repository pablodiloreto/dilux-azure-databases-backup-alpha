import { apiClient } from './client'
import type {
  AuditLogsResponse,
  AuditFilters,
  AuditActionOption,
  AuditResourceTypeOption,
} from '../types'

interface GetAuditLogsParams {
  limit?: number
  offset?: number
  filters?: AuditFilters
}

export const auditApi = {
  async getLogs(params?: GetAuditLogsParams): Promise<AuditLogsResponse> {
    const queryParams = new URLSearchParams()

    if (params?.limit) queryParams.append('limit', params.limit.toString())
    if (params?.offset) queryParams.append('offset', params.offset.toString())

    if (params?.filters) {
      if (params.filters.startDate) queryParams.append('start_date', params.filters.startDate)
      if (params.filters.endDate) queryParams.append('end_date', params.filters.endDate)
      if (params.filters.userId) queryParams.append('user_id', params.filters.userId)
      if (params.filters.action) queryParams.append('action', params.filters.action)
      if (params.filters.resourceType) queryParams.append('resource_type', params.filters.resourceType)
      if (params.filters.status) queryParams.append('status', params.filters.status)
      if (params.filters.search) queryParams.append('search', params.filters.search)
      if (params.filters.databaseType) queryParams.append('database_type', params.filters.databaseType)
      if (params.filters.resourceName) queryParams.append('resource_name', params.filters.resourceName)
    }

    const query = queryParams.toString()
    const response = await apiClient.get<AuditLogsResponse>(`/audit${query ? `?${query}` : ''}`)
    return response.data
  },

  async getActions(): Promise<AuditActionOption[]> {
    const response = await apiClient.get<{ actions: AuditActionOption[] }>('/audit/actions')
    return response.data.actions
  },

  async getResourceTypes(): Promise<AuditResourceTypeOption[]> {
    const response = await apiClient.get<{ resource_types: AuditResourceTypeOption[] }>('/audit/resource-types')
    return response.data.resource_types
  },

  async getStats(startDate?: string, endDate?: string): Promise<{
    total: number
    by_action: Record<string, number>
    by_resource_type: Record<string, number>
    by_status: Record<string, number>
  }> {
    const queryParams = new URLSearchParams()
    if (startDate) queryParams.append('start_date', startDate)
    if (endDate) queryParams.append('end_date', endDate)

    const query = queryParams.toString()
    const response = await apiClient.get(`/audit/stats${query ? `?${query}` : ''}`)
    return response.data
  },
}
