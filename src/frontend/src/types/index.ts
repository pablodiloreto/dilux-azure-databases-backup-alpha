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
  schedule: string
  enabled: boolean
  retention_days: number
  backup_destination?: string
  compression: boolean
  tags: Record<string, string>
  created_at: string
  updated_at: string
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
  schedule?: string
  enabled?: boolean
  retention_days?: number
  compression?: boolean
}

export interface UpdateDatabaseInput {
  name?: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  schedule?: string
  enabled?: boolean
  retention_days?: number
  compression?: boolean
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
  name: string
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
