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

List all database configurations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `enabled_only` | boolean | Filter to only enabled databases |
| `type` | string | Filter by database type (`mysql`, `postgresql`, `sqlserver`, `azure_sql`) |

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
      "schedule": "0 0 * * *",
      "enabled": true,
      "retention_days": 30,
      "compression": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T00:00:00.000Z"
    }
  ],
  "count": 1
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

Get backup history.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `database_id` | string | Filter by database ID |
| `start_date` | string | Filter from date (YYYY-MM-DD) |
| `end_date` | string | Filter until date (YYYY-MM-DD) |
| `limit` | integer | Maximum results (default: 100) |

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
  "count": 1
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
