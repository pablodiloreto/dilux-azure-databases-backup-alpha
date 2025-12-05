import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { databasesApi } from '../api/databases'
import type { CreateDatabaseInput, UpdateDatabaseInput } from '../types'

export const DATABASES_QUERY_KEY = ['databases']

export function useDatabases(enabledOnly?: boolean, type?: string) {
  return useQuery({
    queryKey: [...DATABASES_QUERY_KEY, { enabledOnly, type }],
    queryFn: () => databasesApi.getAll(enabledOnly, type),
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

export function useDeleteDatabase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => databasesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DATABASES_QUERY_KEY })
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
