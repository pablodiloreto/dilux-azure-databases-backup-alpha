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
  policy_id: string | null
  use_engine_policy?: boolean
  engine_id?: string
  engine_name?: string
  use_engine_credentials?: boolean
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
  engine_id?: string
  engine_name?: string
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
  tier?: string
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
  use_engine_policy?: boolean
  engine_id?: string
  use_engine_credentials?: boolean
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
  use_engine_policy?: boolean
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
  engineId?: string
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
  // User preferences (per-user settings)
  dark_mode: boolean
  page_size: number
  // Metadata
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

// Audit types
export type AuditAction =
  | 'backup_completed'
  | 'backup_failed'
  | 'backup_deleted'
  | 'backup_deleted_bulk'
  | 'backup_deleted_retention'
  | 'backup_triggered'
  | 'backup_downloaded'
  | 'database_created'
  | 'database_updated'
  | 'database_deleted'
  | 'database_test_connection'
  | 'policy_created'
  | 'policy_updated'
  | 'policy_deleted'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_login'
  | 'access_request_approved'
  | 'access_request_rejected'
  | 'settings_updated'

export type AuditResourceType =
  | 'backup'
  | 'database'
  | 'policy'
  | 'user'
  | 'settings'
  | 'access_request'

export type AuditStatus = 'success' | 'failed'

export interface AuditLog {
  id: string
  timestamp: string
  user_id: string
  user_email: string
  action: AuditAction
  resource_type: AuditResourceType
  resource_id: string
  resource_name: string
  details?: Record<string, unknown>
  status: AuditStatus
  error_message?: string
  ip_address?: string
}

export interface AuditLogsResponse {
  logs: AuditLog[]
  count: number
  total: number
  has_more: boolean
}

export interface AuditFilters {
  startDate?: string
  endDate?: string
  userId?: string
  action?: AuditAction | ''
  resourceType?: AuditResourceType | ''
  status?: AuditStatus | ''
  search?: string
  databaseType?: string  // Engine type filter (mysql, postgresql, sqlserver)
  engineId?: string      // Server filter (engine ID)
  resourceName?: string  // Alias/Target filter (partial match on resource_name)
}

export interface AuditActionOption {
  value: string
  label: string
}

export interface AuditResourceTypeOption {
  value: string
  label: string
}

// Engine types
export type EngineType = 'mysql' | 'postgresql' | 'sqlserver'

export type AuthMethod = 'user_password' | 'managed_identity' | 'azure_ad' | 'connection_string'

export interface Engine {
  id: string
  name: string
  engine_type: EngineType
  host: string
  port: number
  auth_method: AuthMethod | null
  username: string | null
  password_secret_name: string | null
  connection_string: string | null
  policy_id: string | null
  discovery_enabled: boolean
  last_discovery: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  database_count?: number
}

export interface CreateEngineInput {
  name: string
  engine_type: EngineType
  host: string
  port?: number
  auth_method?: AuthMethod
  username?: string
  password?: string
  connection_string?: string
  policy_id?: string
  discover_databases?: boolean
}

export interface UpdateEngineInput {
  name?: string
  auth_method?: AuthMethod | null
  username?: string
  password?: string
  connection_string?: string
  policy_id?: string | null
  apply_to_all_databases?: boolean
  apply_policy_to_all_databases?: boolean
}

export interface EnginesResponse {
  items: Engine[]
  total: number
  limit: number
  offset: number
}

export interface DiscoveredDatabase {
  name: string
  exists: boolean
  is_system: boolean
}
