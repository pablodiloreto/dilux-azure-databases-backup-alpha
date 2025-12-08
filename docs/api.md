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
  "host": "mysql.example.com",
  "port": 3306,
  "database_name": "myapp",
  "username": "backup_user",
  "password": "secret123",
  "schedule": "0 0 * * *",
  "enabled": true,
  "retention_days": 30,
  "compression": true
}
```

**Required Fields:**
- `name` - Display name
- `database_type` - One of: `mysql`, `postgresql`, `sqlserver`, `azure_sql`
- `host` - Database server hostname
- `port` - Database server port
- `database_name` - Name of the database to backup
- `username` - Database username

**Optional Fields:**
- `password` - Database password (for dev only, use Key Vault in production)
- `password_secret_name` - Key Vault secret name for password
- `schedule` - Cron expression (default: `0 0 * * *` = daily at midnight)
- `enabled` - Whether backups are enabled (default: `true`)
- `retention_days` - Days to keep backups (default: `30`)
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
| `status` | string | Filter by status (`completed`, `failed`, `in_progress`) |
| `triggered_by` | string | Filter by trigger (`manual`, `scheduler`) |
| `database_type` | string | Filter by database type (`mysql`, `postgresql`, `sqlserver`) |
| `start_date` | string | Filter from date (YYYY-MM-DD) |
| `end_date` | string | Filter until date (YYYY-MM-DD) |
| `page_size` | integer | Results per page (default: 25) |
| `continuation_token` | string | Token for next page (from previous response) |

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
      "status": "completed",
      "started_at": "2024-01-15T00:00:05.000Z",
      "completed_at": "2024-01-15T00:01:23.000Z",
      "duration_seconds": 78.5,
      "blob_name": "mysql/db-001/20240115_000005.sql.gz",
      "file_size_bytes": 15728640,
      "file_format": "sql.gz",
      "triggered_by": "scheduler",
      "created_at": "2024-01-15T00:00:00.000Z"
    }
  ],
  "count": 1,
  "continuation_token": "eyJuZXh0UGFnZSI6dHJ1ZX0=",
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

### DatabaseConfig

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Display name |
| `database_type` | enum | `mysql`, `postgresql`, `sqlserver`, `azure_sql` |
| `host` | string | Database server hostname |
| `port` | integer | Database server port |
| `database_name` | string | Name of the database |
| `username` | string | Database username |
| `password_secret_name` | string | Key Vault secret name |
| `schedule` | string | Cron expression |
| `enabled` | boolean | Whether backups are enabled |
| `retention_days` | integer | Days to retain backups |
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
| `database_name` | string | Display name |
| `database_type` | enum | Database type |
| `status` | enum | `pending`, `in_progress`, `completed`, `failed`, `cancelled` |
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

**Request Body:**
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

**Response (Success):**
```json
{
  "success": true,
  "message": "Connection successful",
  "details": {
    "server_version": "8.0.35",
    "connection_time_ms": 45
  }
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
| `action` | string | Filter by action type (e.g., `create_database`, `trigger_backup`) |
| `resource_type` | string | Filter by resource type (`backup`, `database`, `policy`, `user`, `system`) |
| `status` | string | Filter by status (`success`, `failed`) |
| `search` | string | Search in resource names and user emails |
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
      "action": "create_database",
      "resource_type": "database",
      "resource_id": "db-001",
      "resource_name": "Production MySQL",
      "user_id": "user-001",
      "user_email": "admin@example.com",
      "status": "success",
      "details": { "database_type": "mysql" },
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
    { "value": "policy", "label": "Policy" },
    { "value": "user", "label": "User" },
    { "value": "system", "label": "System" }
  ]
}
