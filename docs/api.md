# Dilux Database Backup - API Reference

## Overview

The API is implemented as an Azure Function App with HTTP triggers. In development, it runs on `http://localhost:7071/api`.

## Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:7071/api` |
| Production | `https://<function-app-name>.azurewebsites.net/api` |

## Authentication

- **Development:** No authentication required
- **Production:** Azure AD Bearer token required

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
  "version": "0.1.0",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

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
  "default_compression": true
}
```

**Response:**
```json
{
  "message": "Settings updated",
  "settings": {
    "dark_mode": true,
    "default_retention_days": 30,
    "default_compression": true,
    "updated_at": "2024-01-15T12:00:00.000Z"
  }
}
```

---

### Engines (Servers)

#### `GET /api/engines`

List all engine (server) configurations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by engine type (`mysql`, `postgresql`, `sqlserver`) |
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
| `settings_updated` | `changes`
