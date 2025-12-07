export type DatabaseType = 'mysql' | 'postgresql' | 'sqlserver' | 'azure_sql'

export type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

export interface DatabaseConfig {
  id: string
  name: string
  database_type: DatabaseType
  host: string
  port: number
  database_name: string
  username: string
  policy_id: string
  enabled: boolean
  backup_destination?: string
  compression: boolean
  tags: Record<string, string>
  created_at: string
  updated_at: string
  // Legacy fields (deprecated)
  schedule?: string
  retention_days?: number
}

export interface BackupResult {
  id: string
  job_id: string
  database_id: string
  database_name: string
  database_type: DatabaseType
  status: BackupStatus
  started_at?: string
  completed_at?: string
  duration_seconds?: number
  blob_name?: string
  blob_url?: string
  file_size_bytes?: number
  file_format?: string
  error_message?: string
  triggered_by: string
  created_at: string
}

export interface BackupFile {
  name: string
  size: number
  created_at: string
  last_modified: string
  content_type?: string
}

export interface CreateDatabaseInput {
  name: string
  database_type: DatabaseType
  host: string
  port: number
  database_name: string
  username: string
  password: string
  policy_id?: string
  enabled?: boolean
  compression?: boolean
}

export interface UpdateDatabaseInput {
  name?: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  policy_id?: string
  enabled?: boolean
  compression?: boolean
}

// Backup Policy types
export type BackupTier = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface TierConfig {
  enabled: boolean
  keep_count: number
  interval_hours?: number  // for hourly tier
  time?: string            // HH:MM format for daily/weekly/monthly/yearly
  day_of_week?: number     // 0-6 (0=Sunday) for weekly
  day_of_month?: number    // 1-28 for monthly/yearly
  month?: number           // 1-12 for yearly
}

export interface BackupPolicy {
  id: string
  name: string
  description?: string
  is_system: boolean
  hourly: TierConfig
  daily: TierConfig
  weekly: TierConfig
  monthly: TierConfig
  yearly: TierConfig
  created_at: string
  updated_at: string
}

export interface CreateBackupPolicyInput {
  name: string
  description?: string
  hourly?: Partial<TierConfig>
  daily?: Partial<TierConfig>
  weekly?: Partial<TierConfig>
  monthly?: Partial<TierConfig>
  yearly?: Partial<TierConfig>
}

export interface BackupPoliciesResponse {
  policies: BackupPolicy[]
  count: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  count: number
  total?: number
  page?: number
  page_size?: number
}

export interface BackupsPagedResponse {
  backups: BackupResult[]
  count: number
  total_count: number
  page: number
  page_size: number
  has_more: boolean
}

export interface BackupFilters {
  databaseId?: string
  status?: BackupStatus | ''
  triggeredBy?: 'manual' | 'scheduler' | ''
  databaseType?: DatabaseType | ''
  startDate?: string
  endDate?: string
}

// User types
export type UserRole = 'admin' | 'operator' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  enabled: boolean
  created_at: string
  updated_at: string
  last_login: string | null
  created_by: string | null
}

export interface CreateUserInput {
  email: string
  name?: string
  role?: UserRole
}

export interface UpdateUserInput {
  name?: string
  role?: UserRole
  enabled?: boolean
}

export interface CurrentUserResponse {
  user: User
  is_first_run: boolean
}

export interface UsersPagedResponse {
  users: User[]
  count: number
  total_count: number
  page: number
  page_size: number
  has_more: boolean
  pending_requests_count: number
}

export interface AccessRequest {
  id: string
  email: string
  name: string
  azure_ad_id: string
  status: 'pending' | 'approved' | 'rejected'
  requested_at: string
}

export interface AccessRequestsResponse {
  requests: AccessRequest[]
  count: number
}
