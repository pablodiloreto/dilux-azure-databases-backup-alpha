import { useQuery } from '@tanstack/react-query'
import { backupsApi } from '../api/backups'

export const BACKUPS_QUERY_KEY = ['backups']

export function useBackupHistory(options?: {
  databaseId?: string
  startDate?: string
  endDate?: string
  limit?: number
}) {
  return useQuery({
    queryKey: [...BACKUPS_QUERY_KEY, 'history', options],
    queryFn: () => backupsApi.getHistory(options),
  })
}

export function useBackupFiles(options?: {
  prefix?: string
  limit?: number
}) {
  return useQuery({
    queryKey: [...BACKUPS_QUERY_KEY, 'files', options],
    queryFn: () => backupsApi.getFiles(options),
  })
}

export function useDownloadUrl(blobName: string, enabled = false) {
  return useQuery({
    queryKey: [...BACKUPS_QUERY_KEY, 'download', blobName],
    queryFn: () => backupsApi.getDownloadUrl(blobName),
    enabled,
  })
}
