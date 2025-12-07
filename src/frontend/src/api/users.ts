import { apiClient } from './client'
import type { User, CreateUserInput, UpdateUserInput, CurrentUserResponse } from '../types'

interface UsersResponse {
  users: User[]
  count: number
}

interface UserResponse {
  user: User
  message?: string
}

export const usersApi = {
  /**
   * Get current authenticated user
   */
  getCurrentUser: async (): Promise<CurrentUserResponse> => {
    const response = await apiClient.get<CurrentUserResponse>('/users/me')
    return response.data
  },

  /**
   * List all users (admin only)
   */
  getAll: async (): Promise<User[]> => {
    const response = await apiClient.get<UsersResponse>('/users')
    return response.data.users
  },

  /**
   * Get a specific user
   */
  get: async (userId: string): Promise<User> => {
    const response = await apiClient.get<UserResponse>(`/users/${userId}`)
    return response.data.user
  },

  /**
   * Create a new user (admin only)
   */
  create: async (input: CreateUserInput): Promise<User> => {
    const response = await apiClient.post<UserResponse>('/users', input)
    return response.data.user
  },

  /**
   * Update a user (admin only)
   */
  update: async (userId: string, input: UpdateUserInput): Promise<User> => {
    const response = await apiClient.put<UserResponse>(`/users/${userId}`, input)
    return response.data.user
  },

  /**
   * Delete a user (admin only)
   */
  delete: async (userId: string): Promise<void> => {
    await apiClient.delete(`/users/${userId}`)
  },
}

export default usersApi
