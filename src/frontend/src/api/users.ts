import { apiClient } from './client'
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  CurrentUserResponse,
  UsersPagedResponse,
  AccessRequest,
  AccessRequestsResponse,
  UserRole,
} from '../types'

interface UserResponse {
  user: User
  message?: string
}

interface UserPreferences {
  dark_mode?: boolean
  page_size?: number
}

interface UsersQueryParams {
  page?: number
  page_size?: number
  search?: string
  status?: 'active' | 'disabled' | ''
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
   * Update current user's preferences (dark_mode, page_size)
   */
  updatePreferences: async (preferences: UserPreferences): Promise<User> => {
    const response = await apiClient.put<UserResponse>('/users/me/preferences', preferences)
    return response.data.user
  },

  /**
   * List users with pagination and filters (admin only)
   */
  getAll: async (params?: UsersQueryParams): Promise<UsersPagedResponse> => {
    const response = await apiClient.get<UsersPagedResponse>('/users', { params })
    return response.data
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

export const accessRequestsApi = {
  /**
   * List pending access requests (admin only)
   */
  getAll: async (): Promise<AccessRequest[]> => {
    const response = await apiClient.get<AccessRequestsResponse>('/access-requests')
    return response.data.requests
  },

  /**
   * Approve an access request (admin only)
   */
  approve: async (requestId: string, role?: UserRole): Promise<User> => {
    const response = await apiClient.post<{ user: User; message: string }>(
      `/access-requests/${requestId}/approve`,
      { role }
    )
    return response.data.user
  },

  /**
   * Reject an access request (admin only)
   */
  reject: async (requestId: string, reason?: string): Promise<void> => {
    await apiClient.post(`/access-requests/${requestId}/reject`, { reason })
  },
}

export default usersApi
