# Dilux Database Backup - Backend Documentation

## Overview

The backend consists of **3 Azure Function Apps** and a **shared Python package**:

```
src/
├── shared/              # Shared code (used by all Function Apps)
└── functions/
    ├── api/             # Function App 1: HTTP triggers
    ├── scheduler/       # Function App 2: Timer triggers
    └── processor/       # Function App 3: Queue triggers
```

---

## Shared Package (`src/shared/`)

The shared package contains code that is reused across all three Function Apps.

### Structure

```
src/shared/
├── __init__.py
├── requirements.txt
├── config/
│   ├── __init__.py
│   ├── settings.py          # Application settings (from env vars)
│   └── azure_clients.py     # Azure SDK client factory
├── models/
│   ├── __init__.py
│   ├── database.py          # DatabaseConfig, DatabaseType
│   ├── backup.py            # BackupJob, BackupResult, BackupStatus
│   ├── backup_policy.py     # BackupPolicy, TierConfig
│   ├── engine.py            # Engine, EngineType, AuthMethod
│   ├── user.py              # User, UserRole, AccessRequest
│   ├── audit.py             # AuditLog, AuditAction, AuditResourceType
│   └── settings.py          # AppSettings
├── services/
│   ├── __init__.py
│   ├── storage_service.py   # Blob, Queue, Table operations
│   ├── database_config_service.py  # CRUD for database configs
│   ├── engine_service.py    # CRUD for engines + discovery
│   └── audit_service.py     # Audit logging
├── utils/
│   ├── __init__.py
│   └── validators.py        # Input validation functions
└── exceptions/
    └── __init__.py          # Custom exceptions
```

### Key Components

#### `config/settings.py`

Loads configuration from environment variables using Pydantic:

```python
from shared.config import get_settings

settings = get_settings()
print(settings.storage_connection_string)
print(settings.mysql_host)
```

**Key Settings:**
| Setting | Default | Description |
|---------|---------|-------------|
| `storage_connection_string` | `UseDevelopmentStorage=true` | Azure Storage connection |
| `backup_container_name` | `backups` | Blob container for backups |
| `backup_queue_name` | `backup-jobs` | Queue for backup jobs |
| `history_table_name` | `backuphistory` | Table for backup results |
| `config_table_name` | `databaseconfigs` | Table for DB configs |

#### `config/azure_clients.py`

Factory for Azure SDK clients with lazy initialization:

```python
from shared.config import AzureClients

clients = AzureClients()

# Get clients
blob_client = clients.blob_service_client
queue_client = clients.queue_service_client
table_client = clients.table_service_client

# Get specific resources
container = clients.get_blob_container_client("backups")
queue = clients.get_queue_client("backup-jobs")
table = clients.get_table_client("backuphistory")
```

#### `models/database.py`

Database configuration model:

```python
from shared.models import DatabaseConfig, DatabaseType

config = DatabaseConfig(
    id="db-001",
    name="Production MySQL",
    database_type=DatabaseType.MYSQL,
    host="mysql.example.com",
    port=3306,
    database_name="myapp",
    username="backup_user",
    password="secret",
    schedule="0 0 * * *",
    enabled=True,
    retention_days=30,
)

# Convert to/from Azure Table Storage
entity = config.to_table_entity()
config = DatabaseConfig.from_table_entity(entity)
```

**DatabaseType Enum:**
- `MYSQL`
- `POSTGRESQL`
- `SQLSERVER`
- `AZURE_SQL`

#### `models/backup.py`

Backup job and result models:

```python
from shared.models import BackupJob, BackupResult, BackupStatus

# Create a backup job (sent to queue)
job = BackupJob(
    database_id="db-001",
    database_name="Production MySQL",
    database_type=DatabaseType.MYSQL,
    host="mysql",
    port=3306,
    target_database="myapp",
    username="root",
    triggered_by="scheduler",
)

# Serialize for queue
message = job.to_queue_message()

# Create a backup result (stored in table)
result = BackupResult(
    job_id=job.id,
    database_id=job.database_id,
    database_name=job.database_name,
    database_type=job.database_type,
)

result.mark_started()
result.mark_completed(
    blob_name="mysql/db-001/20240115.sql.gz",
    blob_url="https://...",
    file_size_bytes=15728640,
    file_format="sql.gz",
)
# or
result.mark_failed("Connection refused", "ConnectionError")
```

**BackupStatus Enum:**
- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

#### `models/engine.py`

Engine (database server) configuration:

```python
from shared.models import Engine, EngineType, AuthMethod

engine = Engine(
    id="engine-001",
    name="Production MySQL Server",
    engine_type=EngineType.MYSQL,
    host="mysql.example.com",
    port=3306,
    auth_method=AuthMethod.USER_PASSWORD,
    username="backup_user",
    password="secret",
    discovery_enabled=True,
)

# Convert to/from Azure Table Storage
entity = engine.to_table_entity()
engine = Engine.from_table_entity(entity)
```

**EngineType Enum:**
- `MYSQL`
- `POSTGRESQL`
- `SQLSERVER`

**AuthMethod Enum:**
- `USER_PASSWORD`
- `MANAGED_IDENTITY`
- `AZURE_AD`
- `CONNECTION_STRING`

#### `models/audit.py`

Audit logging model:

```python
from shared.models import AuditLog, AuditAction, AuditResourceType, AuditStatus

log = AuditLog(
    action=AuditAction.DATABASE_CREATED,
    resource_type=AuditResourceType.DATABASE,
    resource_id="db-001",
    resource_name="Production MySQL",
    user_id="user-001",
    user_email="admin@example.com",
    status=AuditStatus.SUCCESS,
    details={
        "database_type": "mysql",
        "engine_id": "engine-001",
        "host": "mysql.example.com",
        "port": 3306,
    },
    ip_address="192.168.1.1",
)
```

**AuditAction Enum:**
- `DATABASE_CREATED`, `DATABASE_UPDATED`, `DATABASE_DELETED`
- `BACKUP_TRIGGERED`, `BACKUP_DOWNLOADED`, `BACKUP_DELETED`, `BACKUP_DELETED_BULK`
- `CREATE`, `UPDATE`, `DELETE` (for ENGINE resource type)
- `POLICY_CREATED`, `POLICY_UPDATED`, `POLICY_DELETED`
- `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`
- `ACCESS_REQUEST_APPROVED`, `ACCESS_REQUEST_REJECTED`
- `SETTINGS_UPDATED`

**AuditResourceType Enum:**
- `DATABASE`, `ENGINE`, `BACKUP`, `POLICY`, `USER`, `ACCESS_REQUEST`, `SETTINGS`

**Audit Details by Resource Type:**

| Resource Type | Common Details Fields |
|---------------|----------------------|
| DATABASE | `database_type`, `engine_id`, `host`, `port`, `database_name`, `policy_id` |
| ENGINE | `engine_id`, `engine_type`, `host`, `port` |
| BACKUP | `database_id`, `database_alias`, `database_type`, `engine_id` |
| USER | `role`, `name` |
| POLICY | `description`, `summary`, `is_system` |

#### `services/storage_service.py`

Unified service for all Azure Storage operations:

```python
from shared.services import StorageService

storage = StorageService()

# Blob operations
url = storage.upload_backup("mysql/db-001/backup.sql.gz", file_data)
data = storage.download_backup("mysql/db-001/backup.sql.gz")
sas_url = storage.get_backup_url("mysql/db-001/backup.sql.gz", expiry_hours=24)
files = storage.list_backups(prefix="mysql/", max_results=100)
storage.delete_backup("mysql/db-001/old-backup.sql.gz")

# Queue operations
message_id = storage.send_backup_job(job.to_queue_message())
messages = storage.receive_backup_jobs(max_messages=5)
storage.delete_queue_message(message_id, pop_receipt)

# Table operations
storage.save_backup_result(result)
history = storage.get_backup_history(database_id="db-001", limit=50)
```

#### `services/database_config_service.py`

CRUD operations for database configurations:

```python
from shared.services import DatabaseConfigService

service = DatabaseConfigService()

# CRUD
config = service.create(config)
config = service.get("db-001")
configs = service.get_all(enabled_only=True)
configs = service.get_by_type(DatabaseType.MYSQL)
config = service.update(config)
service.delete("db-001")

# Helpers
service.enable("db-001")
service.disable("db-001")
service.update_schedule("db-001", "0 */6 * * *")
```

#### `services/audit_service.py`

Audit logging service:

```python
from shared.services import AuditService
from shared.models import AuditAction, AuditResourceType

audit = AuditService()

# Log an action
audit.log(
    action=AuditAction.DATABASE_CREATED,
    resource_type=AuditResourceType.DATABASE,
    resource_id="db-001",
    resource_name="Production MySQL",
    user_id="user-001",
    user_email="admin@example.com",
    details={
        "database_type": "mysql",
        "engine_id": "engine-001",
        "host": "mysql.example.com",
        "port": 3306,
        "database_name": "myapp",
        "policy_id": "production-standard",
    },
    ip_address="192.168.1.1",
)

# Query logs with filters
logs, total = audit.get_logs(
    action=AuditAction.DATABASE_CREATED,
    resource_type=AuditResourceType.DATABASE,
    database_type="mysql",
    engine_id="engine-001",
    resource_name="Production",  # partial match
    start_date=datetime(2025, 1, 1),
    end_date=datetime(2025, 12, 31),
    limit=50,
    offset=0,
)

# Get filter options
actions = audit.get_available_actions()
resource_types = audit.get_available_resource_types()
```

#### `utils/validators.py`

Input validation functions:

```python
from shared.utils import validate_cron_expression, validate_database_name

is_valid, error = validate_cron_expression("0 */6 * * *")
is_valid, error = validate_database_name("my_database")
```

#### `exceptions/__init__.py`

Custom exceptions:

```python
from shared.exceptions import (
    DiluxBackupError,      # Base exception
    ConfigurationError,    # Config issues
    DatabaseConnectionError,
    BackupExecutionError,
    StorageError,
    AuthenticationError,
    ValidationError,
    NotFoundError,
    DuplicateError,
)
```

---

## Function App 1: API (`src/functions/api/`)

HTTP triggers for the REST API.

### Structure

```
src/functions/api/
├── function_app.py           # Main entry point (V2 model)
├── host.json                 # Function App configuration
├── local.settings.example.json
└── requirements.txt
```

### Endpoints

| Method | Route | Function | Description |
|--------|-------|----------|-------------|
| GET | `/api/health` | `health_check` | Health check |
| GET | `/api/databases` | `list_databases` | List all databases |
| POST | `/api/databases` | `create_database` | Create database config |
| GET | `/api/databases/{id}` | `get_database` | Get database by ID |
| PUT | `/api/databases/{id}` | `update_database` | Update database |
| DELETE | `/api/databases/{id}` | `delete_database` | Delete database |
| POST | `/api/databases/{id}/backup` | `trigger_backup` | Trigger manual backup |
| POST | `/api/databases/test-connection` | `test_connection` | Test DB connectivity |
| GET | `/api/backups` | `list_backups` | Get backup history |
| GET | `/api/backups/files` | `list_backup_files` | List backup files |
| GET | `/api/backups/download` | `download_backup` | Get download URL |
| DELETE | `/api/backups/delete` | `delete_backup` | Delete backup file |
| POST | `/api/backups/delete-bulk` | `delete_backups_bulk` | Delete multiple backups |
| GET | `/api/engines` | `list_engines` | List all engines |
| POST | `/api/engines` | `create_engine` | Create engine |
| GET | `/api/engines/{id}` | `get_engine` | Get engine by ID |
| PUT | `/api/engines/{id}` | `update_engine` | Update engine |
| DELETE | `/api/engines/{id}` | `delete_engine` | Delete engine |
| POST | `/api/engines/{id}/discover` | `discover_databases` | Discover databases |
| GET | `/api/backup-policies` | `list_policies` | List backup policies |
| POST | `/api/backup-policies` | `create_policy` | Create policy |
| GET | `/api/backup-policies/{id}` | `get_policy` | Get policy by ID |
| PUT | `/api/backup-policies/{id}` | `update_policy` | Update policy |
| DELETE | `/api/backup-policies/{id}` | `delete_policy` | Delete policy |
| GET | `/api/users` | `list_users` | List users |
| POST | `/api/users` | `create_user` | Create user |
| PUT | `/api/users/{id}` | `update_user` | Update user |
| DELETE | `/api/users/{id}` | `delete_user` | Delete user |
| GET | `/api/audit` | `list_audit_logs` | Get audit logs with filters |
| GET | `/api/audit/actions` | `get_audit_actions` | Get available actions |
| GET | `/api/audit/resource-types` | `get_resource_types` | Get available resource types |
| GET | `/api/settings` | `get_settings` | Get app settings |
| PUT | `/api/settings` | `update_settings` | Update settings |
| GET | `/api/system-status` | `system_status` | System health info |

### Running Locally

```bash
cd src/functions/api
cp local.settings.example.json local.settings.json
func start --port 7071
```

---

## Function App 2: Scheduler (`src/functions/scheduler/`)

Timer triggers for scheduling backup jobs.

### Structure

```
src/functions/scheduler/
├── function_app.py
├── host.json
├── local.settings.example.json
└── requirements.txt
```

### Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `dynamic_scheduler` | Every 15 min | Evaluates all databases, queues backups as needed |
| `health_monitor` | Every 6 hours | Checks system health, logs status |

### How Scheduling Works

1. `dynamic_scheduler` runs every 15 minutes
2. Gets all enabled database configurations
3. For each database, checks if backup should run based on:
   - Cron schedule expression
   - Last backup timestamp
4. If backup is due, creates `BackupJob` and sends to queue
5. Processor picks up job and executes backup

### Running Locally

```bash
cd src/functions/scheduler
cp local.settings.example.json local.settings.json
func start --port 7072
```

---

## Function App 3: Processor (`src/functions/processor/`)

Queue triggers for executing backups.

### Structure

```
src/functions/processor/
├── function_app.py
├── host.json
├── local.settings.example.json
├── requirements.txt
└── backup_engines/
    ├── __init__.py
    ├── base_engine.py        # Abstract base class
    ├── mysql_engine.py       # MySQL (mysqldump)
    ├── postgres_engine.py    # PostgreSQL (pg_dump)
    └── sqlserver_engine.py   # SQL Server (sqlcmd)
```

### Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `backup_processor` | Queue | Processes backup jobs |
| `cleanup_old_backups` | Timer (daily 2 AM) | Deletes expired backups |

### Backup Engines

Each database type has its own backup engine:

```python
from backup_engines import get_backup_engine
from shared.models import DatabaseType

engine = get_backup_engine(DatabaseType.MYSQL)
backup_data, file_format = engine.execute_backup(
    host="mysql",
    port=3306,
    database="testdb",
    username="root",
    password="secret",
    compress=True,
)
# Returns: (BytesIO with backup data, "sql.gz")
```

**Engine Details:**

| Engine | Command | Output Format |
|--------|---------|---------------|
| MySQL | `mysqldump` | `.sql` or `.sql.gz` |
| PostgreSQL | `pg_dump` | `.sql` or `.sql.gz` |
| SQL Server | `sqlcmd` | `.sql` or `.sql.gz` |

### Backup Flow

```
1. Queue message received
2. Parse BackupJob from message
3. Create BackupResult (status: in_progress)
4. Get password from config/Key Vault
5. Get appropriate backup engine
6. Execute backup command
7. Compress output (if enabled)
8. Upload to blob storage
9. Update BackupResult (status: completed/failed)
```

### Running Locally

```bash
cd src/functions/processor
cp local.settings.example.json local.settings.json
func start --port 7073
```

---

## Dependencies

### Shared Package (`src/shared/requirements.txt`)

```
azure-storage-blob>=12.19.0
azure-storage-queue>=12.9.0
azure-data-tables>=12.5.0
azure-identity>=1.15.0
azure-keyvault-secrets>=4.7.0
pydantic>=2.5.0
pydantic-settings>=2.1.0
python-dotenv>=1.0.0
python-dateutil>=2.8.2
structlog>=24.1.0
```

### Function Apps

Each Function App has its own `requirements.txt` that includes:
- `azure-functions>=1.17.0`
- All shared package dependencies
- Any function-specific dependencies (e.g., `croniter` for scheduler)

---

## Environment Variables

All Function Apps use these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `STORAGE_CONNECTION_STRING` | Yes | Azure Storage connection |
| `FUNCTIONS_WORKER_RUNTIME` | Yes | Must be `python` |
| `ENVIRONMENT` | No | `development` or `production` |
| `LOG_LEVEL` | No | Logging level (default: INFO) |

Database connections (for processor):
| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_HOST` | `mysql` | MySQL hostname |
| `MYSQL_PORT` | `3306` | MySQL port |
| `POSTGRES_HOST` | `postgres` | PostgreSQL hostname |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `SQLSERVER_HOST` | `sqlserver` | SQL Server hostname |
| `SQLSERVER_PORT` | `1433` | SQL Server port |

---

## Testing

### Running All Function Apps

Open 3 terminals:

```bash
# Terminal 1: API
cd src/functions/api && func start --port 7071

# Terminal 2: Scheduler
cd src/functions/scheduler && func start --port 7072

# Terminal 3: Processor
cd src/functions/processor && func start --port 7073
```

### Testing the API

```bash
# Health check
curl http://localhost:7071/api/health

# List databases
curl http://localhost:7071/api/databases

# Create database
curl -X POST http://localhost:7071/api/databases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test MySQL",
    "database_type": "mysql",
    "host": "mysql",
    "port": 3306,
    "database_name": "testdb",
    "username": "root",
    "password": "DevPassword123!"
  }'

# Trigger backup
curl -X POST http://localhost:7071/api/databases/{id}/backup
```

---

## Azure Table Storage Schema

### `databaseconfigs` Table

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | Always `"database"` |
| RowKey | string | Database ID |
| name | string | Display name |
| database_type | string | `mysql`, `postgresql`, etc. |
| host | string | Server hostname |
| port | int | Server port |
| ... | ... | Other config fields |

### `backuphistory` Table

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | Date (`YYYY-MM-DD`) |
| RowKey | string | Inverted timestamp + ID (see below) |
| job_id | string | Backup job ID |
| database_id | string | Database ID |
| status | string | `completed`, `failed`, etc. |
| ... | ... | Other result fields |

**RowKey Format (Inverted Timestamp):**

Para lograr orden descendente por fecha (backups más recientes primero), el RowKey usa un timestamp invertido:

```
RowKey = "{MAX_TICKS - current_ticks:019d}_{backup_id}"
```

- `MAX_TICKS` = 3155378975999999999 (DateTime.MaxValue.Ticks en .NET)
- `current_ticks` = timestamp en ticks (segundos × 10,000,000)
- El resultado es un número de 19 dígitos seguido de underscore y el UUID

**Ejemplo:**
- Backup creado: 2025-12-05 10:00:00
- `current_ticks` = 17333280000000000
- `inverted_ticks` = 3138045695999999999
- `RowKey` = `3138045695999999999_abc123...`

Los backups más nuevos tienen valores de `inverted_ticks` más pequeños, por lo que aparecen primero cuando Azure Table Storage ordena por RowKey ascendente.

**Migración de datos legacy:**

Registros anteriores usan RowKey = UUID solamente. El script `scripts/migrate_backup_rowkeys.py` convierte registros legacy al nuevo formato.

### `auditlogs` Table

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | Date (`YYYY-MM-DD`) |
| RowKey | string | Inverted timestamp + ID |
| action | string | Action performed (e.g., `database_created`) |
| resource_type | string | `database`, `engine`, `backup`, etc. |
| resource_id | string | ID of the affected resource |
| resource_name | string | Name/alias of the resource |
| user_id | string | ID of user who performed action |
| user_email | string | Email of user |
| status | string | `success` or `failed` |
| details | string | JSON with action-specific fields |
| ip_address | string | Client IP address |
| timestamp | datetime | When action occurred |

**Details Field Contents:**

The `details` field contains action-specific information:

| Resource Type | Common Fields |
|---------------|---------------|
| DATABASE | `database_type`, `engine_id`, `host`, `port`, `database_name`, `policy_id`, `changes` |
| ENGINE | `engine_id`, `engine_type`, `host`, `port`, `updated_fields` |
| BACKUP | `database_id`, `database_alias`, `database_type`, `engine_id`, `blob_name` |
| USER | `role`, `name`, `changes` |
| POLICY | `description`, `summary`, `is_system`, `updated_fields` |

### `engines` Table

| Column | Type | Description |
|--------|------|-------------|
| PartitionKey | string | Always `"engine"` |
| RowKey | string | Engine ID |
| name | string | Display name |
| engine_type | string | `mysql`, `postgresql`, `sqlserver` |
| host | string | Server hostname |
| port | int | Server port |
| auth_method | string | Authentication method |
| username | string | Database username |
| discovery_enabled | bool | Can discover databases |
| ... | ... | Other config fields |

---

## Blob Storage Structure

Backups are stored in the `backups` container with this naming convention:

```
backups/
├── mysql/
│   └── {database_id}/
│       ├── 20240115_000000.sql.gz
│       ├── 20240116_000000.sql.gz
│       └── ...
├── postgresql/
│   └── {database_id}/
│       └── ...
└── sqlserver/
    └── {database_id}/
        └── ...
```

**Naming Pattern:** `{db_type}/{database_id}/{YYYYMMDD_HHMMSS}.{format}`
