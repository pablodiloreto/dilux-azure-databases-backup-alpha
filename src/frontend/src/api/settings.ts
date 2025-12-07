import { apiClient } from './client'

export interface AppSettings {
  dark_mode: boolean
  default_retention_days: number
  default_compression: boolean
  access_requests_enabled: boolean
  updated_at: string
}

interface SettingsResponse {
  settings: AppSettings
}

interface UpdateSettingsResponse {
  message: string
  settings: AppSettings
}

export const settingsApi = {
  /**
   * Get application settings from server
   */
  get: async (): Promise<AppSettings> => {
    const response = await apiClient.get<SettingsResponse>('/settings')
    return response.data.settings
  },

  /**
   * Update application settings on server
   */
  update: async (updates: Partial<Omit<AppSettings, 'updated_at'>>): Promise<AppSettings> => {
    const response = await apiClient.put<UpdateSettingsResponse>('/settings', updates)
    return response.data.settings
  },
}

export default settingsApi
