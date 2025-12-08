import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { databasesApi } from '../api/databases'
import type { CreateDatabaseInput, UpdateDatabaseInput } from '../types'

export const DATABASES_QUERY_KEY = ['databases']

interface UseDatabasesOptions {
  enabledOnly?: boolean
  type?: string
  limit?: number
  search?: string
}

export function useDatabases(options?: UseDatabasesOptions) {
  return useQuery({
    queryKey: [...DATABASES_QUERY_KEY, options],
    queryFn: () => databasesApi.getAll(options),
  })
}

export function useDatabase(id: string) {
  return useQuery({
    queryKey: [...DATABASES_QUERY_KEY, id],
    queryFn: () => databasesApi.getById(id),
    enabled: !!id,
  })
}

export function useCreateDatabase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateDatabaseInput) => databasesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATABASES_QUERY_KEY })
    },
  })
}

export function useUpdateDatabase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDatabaseInput }) =>
      databasesApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: DATABASES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: [...DATABASES_QUERY_KEY, variables.id] })
    },
  })
}

interface DeleteDatabaseOptions {
  id: string
  deleteBackups?: boolean
}

export function useDeleteDatabase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (options: string | DeleteDatabaseOptions) => {
      if (typeof options === 'string') {
        return databasesApi.delete(options)
      }
      return databasesApi.delete(options.id, { deleteBackups: options.deleteBackups })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATABASES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useTriggerBackup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => databasesApi.triggerBackup(id),
    onSuccess: () => {
      // Invalidate backups to refresh history
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}
