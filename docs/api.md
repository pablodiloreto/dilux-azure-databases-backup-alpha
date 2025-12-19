# Dilux Database Backup - API Reference

## Overview

The API is implemented as an Azure Function App with HTTP triggers. In development, it runs on `http://localhost:7071/api`.

## Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:7071/api` |
| Production | `https://<function-app-name>.azurewebsites.net/api` |

## Authentication

- **Development (AUTH_MODE=mock):** Uses mock user, no Azure AD required
- **Development (AUTH_MODE=azure):** Requires Azure AD Bearer token (from MSAL React frontend)
- **Production:** Azure AD Bearer token required via EasyAuth headers

See `docs/AUTH_SETUP.md` for setup instructions.

---

## Endpoints

### Health Check

#### `GET /api/health`

Check if the API is running.

**Response:**
```json
{
  "status": "healthy",
  "service": "dilux-backup-api",
  "version": "1.0.0",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

---

### Version

#### `GET /api/version`

Get application version and installation info. Used by frontend to check for updates.

**Response:**
```json
{
  "version": "1.0.0",
  "installation_id": "abc123def456",
  "environment": "production"
}
```

| Field | Description |
|-------|-------------|
| `version` | Semantic version of the application |
| `installation_id` | Unique identifier for this deployment (generated during Azure deploy) |
| `environment` | `development` or `production` |

---

### Databases

#### `GET /api/databases`

List database configurations with filtering and pagination.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled_only` | boolean | Filter to only enabled databases |
| `type` | string | Filter by database type (`mysql`, `postgresql`, `sqlserver`, `azure_sql`) |
| `search` | string | Search in name, host, and database_name |
| `host` | string | Filter by host |
| `policy_id` | string | Filter by backup policy ID |
| `engine_id` | string | Filter by engine/server ID |
| `limit` | integer | Results per page (default: 25) |
| `offset` | integer | Skip N results for pagination (default: 0) |

**Response:**
```json
{
  "databases": [
    {
      "id": "db-001",
      "name": "Production MySQL",
      "database_type": "mysql",
      "engine_id": "engine-001",
      "engine_name": "Production MySQL Server",
      "use_engine_credentials": true,
      "host": "mysql.example.com",
      "port": 3306,
      "database_name": "myapp",
      "username": "backup_user",
      "policy_id": "policy-default",
      "enabled": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T00:00:00.000Z"
    }
  ],
  "count": 1,
  "total": 15,
  "has_more": true
}
```

---

#### `POST /api/databases`

Create a new database configuration.

**Request Body:**
```json
{
  "name": "Production MySQL",
  "database_type": "mysql",
  "engine_id": "engine-001",
  "use_engine_credentials": true,
  "host": "mysql.example.com",
  "port": 3306,
  "database_name": "myapp",
  "username": "backup_user",
  "password": "secret123",
  "policy_id": "production-standard",
  "enabled": true,
  "compression": true
}
```

**Required Fields:**
- `name` - Display name
- `database_type` - One of: `mysql`, `postgresql`, `sqlserver`, `azure_sql`
- `host` - Database server hostname
- `port` - Database server port
- `database_name` - Name of the database to backup

**Conditional Fields:**
- If `use_engine_credentials=false`:
  - `username` - Database username (required)
  - `password` - Database password (required for new databases)
- If `use_engine_credentials=true`:
  - `engine_id` - Server/engine ID (required)
  - Credentials are inherited from the engine

**Optional Fields:**
- `engine_id` - ID of the server/engine this database belongs to
- `use_engine_credentials` - Whether to use server credentials (default: `false`)
- `password_secret_name` - Key Vault secret name for password
- `policy_id` - Backup policy ID (default: `production-standard`)
- `enabled` - Whether backups are enabled (default: `true`)
- `compression` - Compress backups (default: `true`)
- `backup_destination` - Custom blob container name
- `tags` - Custom key-value tags

**Response:** `201 Created`
```json
{
  "message": "Database configuration created",
  "database": { ... }
}
```

---

#### `GET /api/databases/{database_id}`

Get a specific database configuration.

**Response:**
```json
{
  "database": {
    "id": "db-001",
    "name": "Production MySQL",
    ...
  }
}
```

**Errors:**
- `404 Not Found` - Database not found

---

#### `PUT /api/databases/{database_id}`

Update a database configuration.

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Name",
  "host": "new-host.example.com",
  "schedule": "0 */6 * * *",
  "enabled": false
}
```

**Response:**
```json
{
  "message": "Database configuration updated",
  "database": { ... }
}
```

---

#### `DELETE /api/databases/{database_id}`

Delete a database configuration.

**Response:**
```json
{
  "message": "Database 'db-001' deleted"
}
```

---

### Backups

#### `POST /api/databases/{database_id}/backup`

Trigger a manual backup for a database.

**Response:** `202 Accepted`
```json
{
  "message": "Backup job queued",
  "job_id": "job-123",
  "queue_message_id": "msg-456"
}
```

---

#### `GET /api/backups`

Get backup history with server-side pagination.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `database_id` | string | Filter by database ID |
| `engine_id` | string | Filter by server/engine ID |
| `status` | string | Filter by status (`completed`, `failed`, `in_progress`) |
| `triggered_by` | string | Filter by trigger (`manual`, `scheduler`) |
| `database_type` | string | Filter by database type (`mysql`, `postgresql`, `sqlserver`) |
| `start_date` | string | Filter from date (YYYY-MM-DD) |
| `end_date` | string | Filter until date (YYYY-MM-DD) |
| `page_size` | integer | Results per page (default: 25, max: 100) |
| `page` | integer | Page number, 1-based (default: 1) |

**Response:**
```json
{
  "backups": [
    {
      "id": "result-001",
      "job_id": "job-123",
      "database_id": "db-001",
      "database_name": "Production MySQL",
      "database_type": "mysql",
      "engine_id": "engine-001",
      "engine_name": "Production MySQL Server",
      "status": "completed",
      "started_at": "2024-01-15T00:00:05.000Z",
      "completed_at": "2024-01-15T00:01:23.000Z",
      "duration_seconds": 78.5,
      "blob_name": "mysql/db-001/20240115_000005.sql.gz",
      "file_size_bytes": 15728640,
      "file_format": "sql.gz",
      "triggered_by": "scheduler",
      "tier": "daily",
      "created_at": "2024-01-15T00:00:00.000Z"
    }
  ],
  "count": 1,
  "total_count": 150,
  "page": 1,
  "page_size": 25,
  "has_more": true
}
```

**Backup Status Values:**
| Status | Description |
|--------|-------------|
| `pending` | Job queued, not yet started |
| `in_progress` | Backup is running |
| `completed` | Backup finished successfully |
| `failed` | Backup failed (see `error_message`) |
| `cancelled` | Backup was cancelled |

---

#### `GET /api/backups/files`

List backup files in blob storage.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `prefix` | string | Filter by blob name prefix (e.g., `mysql/db-001/`) |
| `limit` | integer | Maximum results (default: 100) |

**Response:**
```json
{
  "files": [
    {
      "name": "mysql/db-001/20240115_000005.sql.gz",
      "size": 15728640,
      "created_at": "2024-01-15T00:01:23.000Z",
      "last_modified": "2024-01-15T00:01:23.000Z",
      "content_type": "application/gzip"
    }
  ],
  "count": 1
}
```

---

#### `GET /api/backups/download`

Get a download URL for a backup file.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `blob_name` | string | Yes | Name of the blob to download |
| `expiry_hours` | integer | No | Hours until URL expires (default: 24) |

**Response:**
```json
{
  "download_url": "https://storage.blob.core.windows.net/backups/mysql/db-001/20240115_000005.sql.gz?sv=...",
  "blob_name": "mysql/db-001/20240115_000005.sql.gz",
  "expires_in_hours": 24
}
```

---

#### `DELETE /api/backups/delete`

Delete a single backup file from blob storage.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `blob_name` | string | Yes | Name of the blob to delete |

**Response (Success):**
```json
{
  "message": "Backup 'mysql/db-001/20240115_000005.sql.gz' deleted successfully",
  "blob_name": "mysql/db-001/20240115_000005.sql.gz"
}
```

**Errors:**
- `400 Bad Request` - blob_name parameter is required
- `404 Not Found` - Backup file not found

---

#### `POST /api/backups/delete-bulk`

Delete multiple backup files from blob storage.

**Request Body:**
```json
{
  "blob_names": [
    "mysql/db-001/20240115_000005.sql.gz",
    "mysql/db-001/20240114_000005.sql.gz"
  ]
}
```

**Response:**
```json
{
  "message": "Deleted 2 backup(s)",
  "deleted_count": 2,
  "not_found_count": 0,
  "error_count": 0,
  "results": {
    "deleted": ["mysql/db-001/20240115_000005.sql.gz", "mysql/db-001/20240114_000005.sql.gz"],
    "not_found": [],
    "errors": []
  }
}
```

**Errors:**
- `400 Bad Request` - blob_names array is required or must be an array

---

#### `DELETE /api/backups/{backup_id}`

Delete a specific backup record by ID.

**Response:**
```json
{
  "message": "Backup 'backup-001' deleted"
}
```

**Errors:**
- `404 Not Found` - Backup record not found

---

#### `GET /api/backup-alerts`

Get backup alerts (failed backups and databases with no recent backups).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `include_warning` | boolean | Include warning-level alerts (default: `true`) |
| `hours` | integer | Consider backups in last N hours (default: 24) |

**Response:**
```json
{
  "alerts": [
    {
      "type": "backup_failed",
      "severity": "error",
      "database_id": "db-001",
      "database_name": "Production MySQL",
      "message": "Backup failed: Connection refused",
      "timestamp": "2024-01-15T12:00:00.000Z"
    },
    {
      "type": "no_recent_backup",
      "severity": "warning",
      "database_id": "db-002",
      "database_name": "Analytics DB",
      "message": "No backup in last 24 hours",
      "last_backup": "2024-01-14T00:00:00.000Z"
    }
  ],
  "count": 2
}
```

---

#### `GET /api/databases/{database_id}/backup-stats`

Get backup statistics for a specific database.

**Response:**
```json
{
  "database_id": "db-001",
  "total_backups": 150,
  "completed": 145,
  "failed": 5,
  "success_rate": 96.7,
  "last_backup": {
    "id": "backup-001",
    "status": "completed",
    "timestamp": "2024-01-15T02:00:00.000Z",
    "file_size_bytes": 15728640
  },
  "total_size_bytes": 2359296000,
  "by_tier": {
    "hourly": 24,
    "daily": 7,
    "weekly": 4,
    "monthly": 12
  }
}
```

---

#### `GET /api/storage-stats`

Get overall storage statistics.

**Response:**
```json
{
  "total_size_bytes": 15728640000,
  "total_size_formatted": "14.6 GB",
  "blob_count": 450,
  "by_database": [
    {
      "database_id": "db-001",
      "database_name": "Production MySQL",
      "size_bytes": 5242880000,
      "backup_count": 150
    }
  ],
  "by_type": {
    "mysql": { "size_bytes": 8000000000, "count": 200 },
    "postgresql": { "size_bytes": 5000000000, "count": 150 },
    "sqlserver": { "size_bytes": 2728640000, "count": 100 }
  }
}
```

---

## Data Models

### Engine

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Display name |
| `engine_type` | enum | `mysql`, `postgresql`, `sqlserver` |
| `host` | string | Server hostname |
| `port` | integer | Server port |
| `auth_method` | enum | `user_password`, `managed_identity`, `azure_ad`, `connection_string` |
| `username` | string | Database username (for user_password) |
| `discovery_enabled` | boolean | Whether database discovery is allowed |
| `database_count` | integer | Number of databases using this engine |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

### DatabaseConfig

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Display name |
| `database_type` | enum | `mysql`, `postgresql`, `sqlserver`, `azure_sql` |
| `engine_id` | string | ID of the server/engine (optional) |
| `engine_name` | string | Name of the server (from API response) |
| `use_engine_credentials` | boolean | Whether to use server credentials |
| `host` | string | Database server hostname |
| `port` | integer | Database server port |
| `database_name` | string | Name of the database |
| `username` | string | Database username (if not using engine credentials) |
| `password_secret_name` | string | Key Vault secret name |
| `policy_id` | string | Backup policy ID |
| `enabled` | boolean | Whether backups are enabled |
| `backup_destination` | string | Custom blob container |
| `compression` | boolean | Whether to compress backups |
| `tags` | object | Custom tags |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

### BackupResult

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `job_id` | string | ID of the backup job |
| `database_id` | string | ID of the database |
| `database_alias` | string | Display name of database |
| `database_type` | enum | Database type |
| `engine_id` | string | ID of the server/engine |
| `status` | enum | `pending`, `in_progress`, `completed`, `failed`, `cancelled` |
| `tier` | string | Backup tier (`hourly`, `daily`, `weekly`, `monthly`, `yearly`) |
| `started_at` | datetime | When backup started |
| `completed_at` | datetime | When backup finished |
| `duration_seconds` | float | Duration in seconds |
| `blob_name` | string | Path in blob storage |
| `blob_url` | string | Direct URL to blob |
| `file_size_bytes` | integer | Size of backup file |
| `file_format` | string | File format (`sql.gz`, `bak`, etc.) |
| `error_message` | string | Error message if failed |
| `triggered_by` | string | `scheduler` or `manual` |
| `created_at` | datetime | Record creation time |

---

## Cron Schedule Examples

| Schedule | Cron Expression |
|----------|-----------------|
| Every 15 minutes | `*/15 * * * *` |
| Every hour | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Daily at midnight | `0 0 * * *` |
| Daily at 2 AM | `0 2 * * *` |
| Weekly on Sunday | `0 0 * * 0` |
| First day of month | `0 0 1 * *` |

---

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Database 'db-001' not found"
}
```

**HTTP Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (async operation queued) |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Additional Endpoints

### Test Connection

#### `POST /api/databases/test-connection`

Test database connectivity before saving configuration.

**Request Body (Custom Credentials):**
```json
{
  "database_type": "mysql",
  "host": "mysql.example.com",
  "port": 3306,
  "database_name": "myapp",
  "username": "backup_user",
  "password": "secret123"
}
```

**Request Body (Using Engine Credentials):**
```json
{
  "database_type": "mysql",
  "host": "mysql.example.com",
  "port": 3306,
  "database_name": "myapp",
  "engine_id": "engine-001",
  "use_engine_credentials": true
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Connection successful",
  "duration_ms": 45
}
```

**Response (Failure):**
```json
{
  "success": false,
  "message": "Connection failed: Access denied for user 'backup_user'",
  "error_type": "AuthenticationError"
}
```

---

### System Status

#### `GET /api/system-status`

Get comprehensive system status and health information.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `include` | string | Components to include: `all`, `storage`, `databases`, `backups` (default: `all`) |

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "services": {
    "api": {
      "status": "healthy",
      "message": "API is running"
    },
    "storage": {
      "status": "healthy",
      "message": "Storage is accessible"
    },
    "databases": {
      "status": "healthy",
      "message": "2 databases configured",
      "total": 2,
      "enabled": 2
    }
  },
  "storage": {
    "total_size_bytes": 157286400,
    "total_size_formatted": "150.0 MB",
    "backup_count": 45
  },
  "backups": {
    "completed": 42,
    "failed": 3,
    "success_rate": 93.3
  }
}
```

---

### Settings

#### `GET /api/settings`

Get application settings.

**Response:**
```json
{
  "dark_mode": true,
  "default_retention_days": 30,
  "default_compression": true,
  "updated_at": "2024-01-15T12:00:00.000Z"
}
```

---

#### `PUT /api/settings`

Update application settings.

**Request Body:**
```json
{
  "dark_mode": true,
  "default_retention_days": 30,
  "default_compression": true,
  "access_requests_enabled": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `dark_mode` | bool | Enable dark mode in UI |
| `default_retention_days` | int | Default retention period (1-365) |
| `default_compression` | bool | Default compression for new databases |
| `access_requests_enabled` | bool | Allow unauthorized users to request access |

**Response:**
```json
{
  "message": "Settings updated",
  "settings": {
    "dark_mode": true,
    "default_retention_days": 30,
    "default_compression": true,
    "access_requests_enabled": true,
    "updated_at": "2024-01-15T12:00:00.000Z"
  }
}
```

---

### Authentication Events

#### `POST /api/auth/events`

Log authentication events (login/logout). Called by frontend when actual login/logout occurs.

**Request Body:**
```json
{
  "event": "login"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | Yes | Event type: `login` or `logout` |

**Response (Success):**
```json
{
  "success": true
}
```

**Errors:**
- `400 Bad Request` - Invalid event type (must be "login" or "logout")
- `401 Unauthorized` - User not authenticated

**Notes:**
- This endpoint should only be called by the frontend when the user actually performs a login (clicks login button and completes Azure AD popup) or logout action.
- It should NOT be called on page navigation or token refresh.
- The backend middleware validates the token but does NOT log login events on every request - that would create false audit entries.

---

### Engines (Servers)

#### `GET /api/engines`

List all engine (server) configurations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `engine_type` | string | Filter by engine type (`mysql`, `postgresql`, `sqlserver`) |
| `search` | string | Search by name or host |
| `limit` | integer | Results per page (default: 100) |
| `offset` | integer | Skip N results for pagination (default: 0) |

**Response:**
```json
{
  "items": [
    {
      "id": "engine-001",
      "name": "Production MySQL Server",
      "engine_type": "mysql",
      "host": "mysql.example.com",
      "port": 3306,
      "auth_method": "user_password",
      "username": "backup_user",
      "discovery_enabled": true,
      "database_count": 5,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

#### `POST /api/engines`

Create a new engine (server) configuration.

**Request Body:**
```json
{
  "name": "Production MySQL Server",
  "engine_type": "mysql",
  "host": "mysql.example.com",
  "port": 3306,
  "auth_method": "user_password",
  "username": "backup_user",
  "password": "secret123",
  "discovery_enabled": true,
  "discover_databases": true
}
```

**Required Fields:**
- `name` - Display name
- `engine_type` - One of: `mysql`, `postgresql`, `sqlserver`
- `host` - Server hostname
- `port` - Server port

**Optional Fields:**
- `auth_method` - Authentication method: `user_password`, `managed_identity`, `azure_ad`, `connection_string` (default: `user_password`)
- `username` - Database username (required for `user_password`)
- `password` - Database password (required for `user_password`)
- `discovery_enabled` - Allow discovering databases on this server (default: `true`)
- `discover_databases` - Immediately discover databases after creation (default: `false`)

**Response:** `201 Created`
```json
{
  "engine": { ... },
  "discovered_databases": [
    { "id": "db-001", "name": "myapp", ... },
    { "id": "db-002", "name": "analytics", ... }
  ]
}
```

---

#### `GET /api/engines/{engine_id}`

Get a specific engine configuration.

**Response:**
```json
{
  "engine": {
    "id": "engine-001",
    "name": "Production MySQL Server",
    ...
  }
}
```

---

#### `PUT /api/engines/{engine_id}`

Update an engine configuration.

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Server Name",
  "username": "new_user",
  "password": "new_password",
  "apply_to_all_databases": true
}
```

**Special Fields:**
- `apply_to_all_databases` - If `true`, updates all databases using this engine to use `use_engine_credentials=true`

**Response:**
```json
{
  "engine": { ... },
  "databases_updated": 5
}
```

---

#### `DELETE /api/engines/{engine_id}`

Delete an engine configuration.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `delete_databases` | boolean | If `true`, cascade delete all associated databases |
| `delete_backups` | boolean | If `true` (and `delete_databases=true`), also delete backup files |

**Response (No databases):**
```json
{
  "message": "Engine 'engine-001' deleted"
}
```

**Response (With cascade):**
```json
{
  "message": "Engine 'engine-001' deleted",
  "databases_deleted": 5,
  "backups_deleted": 150
}
```

**Errors:**
- `400 Bad Request` - Engine has databases and `delete_databases` is not set
- `404 Not Found` - Engine not found

---

#### `POST /api/engines/{engine_id}/databases`

Import discovered databases from an engine.

**Request Body:**
```json
{
  "databases": ["myapp", "analytics"],
  "policy_id": "production-standard"
}
```

**Response:** `201 Created`
```json
{
  "message": "Imported 2 database(s)",
  "imported": [
    { "id": "db-001", "name": "myapp", ... },
    { "id": "db-002", "name": "analytics", ... }
  ]
}
```

---

#### `POST /api/engines/{engine_id}/test`

Test connection to an engine.

**Response (Success):**
```json
{
  "success": true,
  "message": "Connection successful",
  "duration_ms": 45
}
```

---

#### `POST /api/engines/{engine_id}/discover`

Discover databases on an engine.

**Request Body:**
```json
{
  "import_databases": ["myapp", "analytics"],
  "policy_id": "production-standard"
}
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `import` | boolean | If `true`, import selected databases (default: `false`) |

**Response (List only):**
```json
{
  "engine_id": "engine-001",
  "databases": ["myapp", "analytics", "staging", "test"],
  "existing": ["myapp"],
  "available": ["analytics", "staging", "test"]
}
```

**Response (With import):**
```json
{
  "engine_id": "engine-001",
  "imported": [
    { "id": "db-002", "name": "analytics", ... },
    { "id": "db-003", "name": "staging", ... }
  ],
  "skipped": ["test"]
}
```

---

### Backup Policies

#### `GET /api/backup-policies`

List all backup policies.

**Response:**
```json
{
  "policies": [
    {
      "id": "policy-default",
      "name": "Default Policy",
      "description": "Standard backup retention",
      "is_system": true,
      "hourly": { "enabled": false, "keep_count": 0 },
      "daily": { "enabled": true, "keep_count": 7, "time": "02:00" },
      "weekly": { "enabled": true, "keep_count": 4, "time": "02:00", "day_of_week": 0 },
      "monthly": { "enabled": true, "keep_count": 12, "time": "02:00", "day_of_month": 1 },
      "yearly": { "enabled": false, "keep_count": 0 },
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

#### `POST /api/backup-policies`

Create a new backup policy.

**Request Body:**
```json
{
  "name": "High Retention Policy",
  "description": "For critical databases",
  "hourly": { "enabled": true, "keep_count": 24, "interval_hours": 1 },
  "daily": { "enabled": true, "keep_count": 30, "time": "02:00" },
  "weekly": { "enabled": true, "keep_count": 8, "time": "02:00", "day_of_week": 0 },
  "monthly": { "enabled": true, "keep_count": 24, "time": "02:00", "day_of_month": 1 },
  "yearly": { "enabled": true, "keep_count": 5, "time": "02:00", "day_of_month": 1, "month": 1 }
}
```

**Response:** `201 Created`
```json
{
  "message": "Backup policy created",
  "policy": { ... }
}
```

---

#### `GET /api/backup-policies/{policy_id}`

Get a specific backup policy.

**Response:**
```json
{
  "policy": {
    "id": "policy-001",
    "name": "High Retention Policy",
    ...
  }
}
```

---

#### `PUT /api/backup-policies/{policy_id}`

Update a backup policy.

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Policy Name",
  "daily": { "enabled": true, "keep_count": 14, "time": "03:00" }
}
```

**Response:**
```json
{
  "message": "Backup policy updated",
  "policy": { ... }
}
```

---

#### `DELETE /api/backup-policies/{policy_id}`

Delete a backup policy. System policies cannot be deleted.

**Response:**
```json
{
  "message": "Backup policy 'policy-001' deleted"
}
```

**Errors:**
- `400 Bad Request` - Cannot delete system policy
- `404 Not Found` - Policy not found

---

### Users

#### `GET /api/users`

List all users. **Requires Admin role.**

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `role` | string | Filter by role (`admin`, `operator`, `viewer`) |
| `status` | string | Filter by status (`active`, `pending`, `disabled`) |
| `search` | string | Search by name or email |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Skip N results (default: 0) |

**Response:**
```json
{
  "users": [
    {
      "id": "user-001",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "admin",
      "status": "active",
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_login": "2024-01-15T12:00:00.000Z"
    }
  ],
  "total": 10
}
```

---

#### `GET /api/users/me`

Get current authenticated user's profile.

**Response:**
```json
{
  "user": {
    "id": "user-001",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    "status": "active",
    "dark_mode": true,
    "page_size": 25,
    "created_at": "2024-01-01T00:00:00.000Z",
    "last_login": "2024-01-15T12:00:00.000Z"
  },
  "is_first_run": false
}
```

---

#### `PUT /api/users/me/preferences`

Update current user's preferences.

**Request Body:**
```json
{
  "dark_mode": true,
  "page_size": 50
}
```

| Field | Type | Description |
|-------|------|-------------|
| `dark_mode` | bool | Enable dark mode in UI |
| `page_size` | int | Items per page (10-100) |

**Response:**
```json
{
  "message": "Preferences updated",
  "user": {
    "dark_mode": true,
    "page_size": 50
  }
}
```

---

#### `GET /api/users/{user_id}`

Get a specific user. **Requires Admin role.**

**Response:**
```json
{
  "user": {
    "id": "user-001",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin",
    ...
  }
}
```

---

#### `POST /api/users`

Create a new user. **Requires Admin role.**

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "operator"
}
```

**Response:** `201 Created`
```json
{
  "message": "User created",
  "user": { ... }
}
```

---

#### `PUT /api/users/{user_id}`

Update a user. **Requires Admin role.**

**Request Body:**
```json
{
  "name": "Updated Name",
  "role": "admin"
}
```

**Response:**
```json
{
  "message": "User updated",
  "user": { ... }
}
```

---

#### `DELETE /api/users/{user_id}`

Delete a user. **Requires Admin role.**

**Response:**
```json
{
  "message": "User 'user-001' deleted"
}
```

---

### Access Requests

#### `GET /api/access-requests`

List access requests. **Requires Admin role.**

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (`pending`, `approved`, `rejected`) |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Skip N results (default: 0) |

**Response:**
```json
{
  "requests": [
    {
      "id": "request-001",
      "email": "newuser@example.com",
      "name": "New User",
      "requested_role": "operator",
      "status": "pending",
      "message": "I need access to manage backups",
      "created_at": "2024-01-15T12:00:00.000Z"
    }
  ],
  "total": 5
}
```

---

#### `POST /api/access-requests/{request_id}/approve`

Approve an access request. **Requires Admin role.**

**Request Body:**
```json
{
  "role": "operator"
}
```

**Response:**
```json
{
  "message": "Access request approved",
  "user": {
    "id": "user-002",
    "email": "newuser@example.com",
    "role": "operator"
  }
}
```

---

#### `POST /api/access-requests/{request_id}/reject`

Reject an access request. **Requires Admin role.**

**Request Body:**
```json
{
  "reason": "Insufficient justification"
}
```

**Response:**
```json
{
  "message": "Access request rejected"
}
```

---

### Audit Logs

#### `GET /api/audit`

Get audit logs with filtering and pagination. **Requires Admin role.**

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | string | Filter by action type (e.g., `database_created`, `backup_triggered`) |
| `resource_type` | string | Filter by resource type (`backup`, `database`, `engine`, `policy`, `user`, `settings`, `access_request`) |
| `status` | string | Filter by status (`success`, `failed`) |
| `search` | string | Search in resource names and user emails |
| `database_type` | string | Filter by engine type (`mysql`, `postgresql`, `sqlserver`) |
| `engine_id` | string | Filter by engine/server ID |
| `resource_name` | string | Filter by alias/target name (partial match) |
| `start_date` | string | Filter from date (YYYY-MM-DD) |
| `end_date` | string | Filter until date (YYYY-MM-DD) |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Skip N results for pagination (default: 0) |

**Response:**
```json
{
  "logs": [
    {
      "id": "audit-001",
      "action": "database_created",
      "resource_type": "database",
      "resource_id": "db-001",
      "resource_name": "Production MySQL",
      "user_id": "user-001",
      "user_email": "admin@example.com",
      "status": "success",
      "details": {
        "database_type": "mysql",
        "engine_id": "engine-001",
        "host": "mysql.example.com",
        "port": 3306,
        "database_name": "myapp",
        "policy_id": "production-standard"
      },
      "error_message": null,
      "ip_address": "192.168.1.1",
      "timestamp": "2024-01-15T12:00:00.000Z"
    }
  ],
  "total": 100,
  "has_more": true
}
```

---

#### `GET /api/audit/actions`

Get list of available audit action types for filters.

**Response:**
```json
{
  "actions": [
    { "value": "create_database", "label": "Create Database" },
    { "value": "update_database", "label": "Update Database" },
    { "value": "delete_database", "label": "Delete Database" },
    { "value": "trigger_backup", "label": "Trigger Backup" },
    { "value": "delete_backup", "label": "Delete Backup" },
    { "value": "create_policy", "label": "Create Policy" },
    { "value": "update_policy", "label": "Update Policy" },
    { "value": "delete_policy", "label": "Delete Policy" },
    { "value": "create_user", "label": "Create User" },
    { "value": "update_user", "label": "Update User" },
    { "value": "delete_user", "label": "Delete User" },
    { "value": "approve_access", "label": "Approve Access" },
    { "value": "reject_access", "label": "Reject Access" }
  ]
}
```

---

#### `GET /api/audit/resource-types`

Get list of available resource types for filters.

**Response:**
```json
{
  "resource_types": [
    { "value": "backup", "label": "Backup" },
    { "value": "database", "label": "Database" },
    { "value": "engine", "label": "Engine" },
    { "value": "policy", "label": "Policy" },
    { "value": "user", "label": "User" },
    { "value": "settings", "label": "Settings" },
    { "value": "access_request", "label": "Access Request" }
  ]
}
```

---

#### `GET /api/audit/stats`

Get audit log statistics. **Requires Admin role.**

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Start date for stats (YYYY-MM-DD) |
| `end_date` | string | End date for stats (YYYY-MM-DD) |

**Response:**
```json
{
  "total": 1500,
  "by_action": {
    "database_created": 45,
    "database_updated": 120,
    "backup_triggered": 890,
    "backup_downloaded": 234,
    "user_login": 156
  },
  "by_resource_type": {
    "database": 200,
    "backup": 1100,
    "user": 150,
    "engine": 50
  },
  "by_status": {
    "success": 1480,
    "failed": 20
  },
  "by_user": [
    { "user_id": "user-001", "email": "admin@example.com", "count": 500 },
    { "user_id": "user-002", "email": "operator@example.com", "count": 350 }
  ]
}
```

---

### Audit Log Details by Action

Each audit action includes specific fields in the `details` object:

#### Database Actions

| Action | Details Fields |
|--------|----------------|
| `database_created` | `database_type`, `engine_id`, `host`, `port`, `database_name`, `policy_id` |
| `database_updated` | `database_type`, `engine_id`, `changes` |
| `database_deleted` | `database_type`, `engine_id`, `host`, `port`, `database_name`, `backups_deleted`, `records_deleted` |

#### Engine Actions

| Action | Details Fields |
|--------|----------------|
| `create` (ENGINE) | `engine_id`, `engine_type`, `host`, `port` |
| `update` (ENGINE) | `engine_id`, `engine_type`, `updated_fields` |
| `delete` (ENGINE) | `engine_id`, `engine_type`, `host`, `cascade_databases`, `cascade_backups`, `databases_deleted` |

#### Backup Actions

| Action | Details Fields |
|--------|----------------|
| `backup_triggered` | `database_id`, `database_alias`, `database_type`, `engine_id`, `triggered_by` |
| `backup_downloaded` | `blob_name`, `file_name`, `database_type`, `database_id`, `database_alias`, `engine_id`, `expiry_hours` |
| `backup_deleted` | `blob_name`, `file_name`, `database_type`, `database_id`, `database_alias`, `engine_id`, `type` |
| `backup_deleted_bulk` | `deleted_count`, `deleted_files`, `not_found_count`, `error_count` |

#### User Actions

| Action | Details Fields |
|--------|----------------|
| `user_created` | `role`, `name` |
| `user_updated` | `changes` |
| `user_deleted` | `name`, `role` |

#### Policy Actions

| Action | Details Fields |
|--------|----------------|
| `policy_created` | `description`, `summary` |
| `policy_updated` | `updated_fields`, `summary` |
| `policy_deleted` | `description`, `summary`, `is_system` |

#### Access Request Actions

| Action | Details Fields |
|--------|----------------|
| `access_request_approved` | `role` |
| `access_request_rejected` | `reason` |

#### Settings Actions

| Action | Details Fields |
|--------|----------------|
| `settings_updated` | `changes` |

#### Authentication Actions

| Action | Details Fields |
|--------|----------------|
| `user_login` | `event: login` |
| `user_logout` | `event: logout` |

**Note:** Login/logout events are logged when the frontend calls `POST /api/auth/events`. The backend middleware does NOT log login events on every API request - only when the user actually performs a login (via Azure AD popup) or logout action.
