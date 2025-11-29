import { apiClient } from './client'
import type { BackupResult, BackupFile } from '../types'

interface BackupsResponse {
  backups: BackupResult[]
  count: number
}

interface BackupFilesResponse {
  files: BackupFile[]
  count: number
}

interface DownloadUrlResponse {
  download_url: string
  blob_name: string
  expires_in_hours: number
}

export const backupsApi = {
  /**
   * Get backup history
   */
  getHistory: async (options?: {
    databaseId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<BackupResult[]> => {
    const params = new URLSearchParams()
    if (options?.databaseId) params.append('database_id', options.databaseId)
    if (options?.startDate) params.append('start_date', options.startDate)
    if (options?.endDate) params.append('end_date', options.endDate)
    if (options?.limit) params.append('limit', options.limit.toString())

    const response = await apiClient.get<BackupsResponse>('/backups', { params })
    return response.data.backups
  },

  /**
   * Get backup files list
   */
  getFiles: async (options?: {
    prefix?: string
    limit?: number
  }): Promise<BackupFile[]> => {
    const params = new URLSearchParams()
    if (options?.prefix) params.append('prefix', options.prefix)
    if (options?.limit) params.append('limit', options.limit.toString())

    const response = await apiClient.get<BackupFilesResponse>('/backups/files', { params })
    return response.data.files
  },

  /**
   * Get download URL for a backup file
   */
  getDownloadUrl: async (blobName: string, expiryHours?: number): Promise<string> => {
    const params = new URLSearchParams()
    params.append('blob_name', blobName)
    if (expiryHours) params.append('expiry_hours', expiryHours.toString())

    const response = await apiClient.get<DownloadUrlResponse>('/backups/download', { params })
    return response.data.download_url
  },
}

export default backupsApi
