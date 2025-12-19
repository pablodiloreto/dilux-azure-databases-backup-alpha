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
│   ├── database.py          # DatabaseConfig, DatabaseType, BackupSchedule
│   ├── backup.py            # BackupJob, BackupResult, BackupStatus, BackupTier
│   ├── backup_policy.py     # BackupPolicy, TierConfig, DayOfWeek, get_default_policies()
│   ├── engine.py            # Engine, EngineType, AuthMethod, CreateEngineInput, UpdateEngineInput, DiscoveredDatabase
│   ├── user.py              # User, UserRole, AccessRequest, AccessRequestStatus, CreateUserInput, UpdateUserInput
│   ├── audit.py             # AuditLog, AuditAction, AuditResourceType, AuditStatus, AuditLogCreate
│   └── settings.py          # AppSettings
├── services/
│   ├── __init__.py
│   ├── storage_service.py   # Blob, Queue, Table operations + Users, Policies, Settings
│   ├── database_config_service.py  # CRUD for database configs
│   ├── engine_service.py    # CRUD for engines + discovery
│   ├── audit_service.py     # Audit logging
│   └── connection_tester.py # Database connection testing
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
    engine_id="engine-001",              # Link to Engine
    use_engine_credentials=True,         # Inherit credentials from engine
    policy_id="production-standard",     # Backup policy ID
    use_engine_policy=False,             # If True, inherit policy from engine
    enabled=True,
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

**BackupSchedule Enum (predefined schedules):**
- `EVERY_15_MIN` = `"*/15 * * * *"`
- `HOURLY` = `"0 * * * *"`
- `EVERY_6_HOURS` = `"0 */6 * * *"`
- `DAILY` = `"0 0 * * *"`
- `WEEKLY` = `"0 0 * * 0"`

**DatabaseConfig Fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | str | required | Unique identifier |
| `name` | str | required | Display name |
| `database_type` | DatabaseType | required | Type of database |
| `engine_id` | str | None | ID of engine this database belongs to |
| `use_engine_credentials` | bool | `True` | Use credentials from engine |
| `host` | str | required | Database host/server |
| `port` | int | required | Database port (1-65535) |
| `database_name` | str | required | Name of database to backup |
| `auth_method` | AuthMethod | None | Auth method (if not using engine) |
| `username` | str | None | Username (if not using engine) |
| `password` | str | None | Password (dev only, use Key Vault in prod) |
| `password_secret_name` | str | None | Key Vault secret name |
| `policy_id` | str | `"production-standard"` | Backup policy ID |
| `use_engine_policy` | bool | `False` | Inherit policy from engine |
| `enabled` | bool | `True` | Whether backups are enabled |
| `backup_destination` | str | None | Custom blob container |
| `compression` | bool | `True` | Whether to compress backups |
| `tags` | dict | `{}` | Custom key-value tags |
| `schedule` | str | None | [DEPRECATED] Use policy_id |
| `retention_days` | int | None | [DEPRECATED] Use policy_id |
| `created_at` | datetime | auto | Creation timestamp |
| `updated_at` | datetime | auto | Last update timestamp |
| `created_by` | str | None | ID of user who created |

**DatabaseConfig Methods:**
- `get_connection_string()` - Generate connection string based on database type
- `to_table_entity(include_password=False)` - Convert to Azure Table entity
- `from_table_entity(entity)` - Create from Azure Table entity

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

**BackupTier Enum (for tiered retention):**
- `HOURLY`
- `DAILY`
- `WEEKLY`
- `MONTHLY`
- `YEARLY`

#### `models/backup_policy.py`

Backup policy configuration for tiered retention:

```python
from shared.models import BackupPolicy, TierConfig, DayOfWeek, get_default_policies

# TierConfig defines retention for each backup tier
tier = TierConfig(
    enabled=True,
    keep_count=24,  # Number of backups to retain
)

# BackupPolicy with tier configurations
policy = BackupPolicy(
    id="production-standard",
    name="Production Standard",
    description="Standard production backup policy",
    is_system=False,
    hourly=TierConfig(enabled=True, keep_count=12, interval_hours=1),
    daily=TierConfig(enabled=True, keep_count=7, time="02:00"),
    weekly=TierConfig(enabled=True, keep_count=4, day_of_week=0, time="03:00"),
    monthly=TierConfig(enabled=True, keep_count=2, day_of_month=1, time="04:00"),
    yearly=TierConfig(enabled=True, keep_count=1, month=1, day_of_month=1, time="05:00"),
)

# Get system default policies
policies = get_default_policies()
# Returns: production-critical, production-standard, development

# Get summary string (e.g., "12h/7d/4w/2m/1y")
summary = policy.get_summary()
```

**DayOfWeek Enum (0 = Sunday, matching JS convention):**
- `SUNDAY` (0)
- `MONDAY` (1)
- `TUESDAY` (2)
- `WEDNESDAY` (3)
- `THURSDAY` (4)
- `FRIDAY` (5)
- `SATURDAY` (6)

**TierConfig Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `enabled` | bool | Whether this tier is active |
| `keep_count` | int | Number of backups to retain (≥0) |
| `interval_hours` | int | Hours between backups, 1-12 (hourly tier only) |
| `time` | str | Time of day "HH:MM" (daily/weekly/monthly/yearly) |
| `day_of_week` | int | Day of week 0=Sun, 6=Sat (weekly tier) |
| `day_of_month` | int | Day of month 1-28 (monthly/yearly tier) |
| `month` | int | Month 1-12 (yearly tier only) |

**TierConfig Methods:**
- `get_schedule_description(tier)` - Returns human-readable schedule (e.g., "Every 2 hours", "Daily at 02:00")

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
    policy_id="production-standard",  # Default policy for databases on this engine
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

**Input Models:**
- `CreateEngineInput` - Validation model for creating engines (includes `discover_databases` flag)
- `UpdateEngineInput` - Validation model for updating engines (includes `apply_to_all_databases`, `apply_policy_to_all_databases`)
- `DiscoveredDatabase` - Model for discovered databases during discovery

**Engine Methods:**
- `get_default_port(engine_type)` - Class method returning default port (MySQL: 3306, PostgreSQL: 5432, SQL Server: 1433)
- `has_credentials()` - Returns True if engine has valid credentials configured

**SYSTEM_DATABASES constant:**
Dictionary of system databases to exclude during discovery:
- MySQL: `mysql`, `information_schema`, `performance_schema`, `sys`
- PostgreSQL: `postgres`, `template0`, `template1`
- SQL Server: `master`, `tempdb`, `model`, `msdb`

#### `models/user.py`

User and access request models:

```python
from shared.models import User, UserRole, AccessRequest, AccessRequestStatus

user = User(
    id="azure-ad-oid",
    email="admin@example.com",
    name="Admin User",
    role=UserRole.ADMIN,
    enabled=True,
    dark_mode=False,
    page_size=25,
)

# Authorization checks
if user.can_manage_users():
    # Admin only
    pass
if user.can_manage_databases():
    # Admin or Operator
    pass
if user.can_trigger_backup():
    # Admin or Operator
    pass
if user.can_manage_settings():
    # Admin only
    pass
if user.can_view():
    # All enabled users
    pass
```

**UserRole Enum:**
- `ADMIN` - Full access: manage users, databases, backups, settings
- `OPERATOR` - Can trigger backups, view all, but no user management
- `VIEWER` - Read-only access to dashboards and history

**User Fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | str | required | Azure AD Object ID (oid claim) |
| `email` | str | required | User email from Azure AD |
| `name` | str | required | Display name from Azure AD |
| `role` | UserRole | `VIEWER` | Application role |
| `enabled` | bool | `True` | Whether user can access the app |
| `dark_mode` | bool | `False` | User's dark mode preference |
| `page_size` | int | `25` | Items per page preference (10-100) |
| `created_at` | datetime | auto | Creation timestamp |
| `updated_at` | datetime | auto | Last update timestamp |
| `last_login` | datetime | None | Last login timestamp |
| `created_by` | str | None | ID of user who created this user |

**User Authorization Methods:**
| Method | Returns True For |
|--------|------------------|
| `can_manage_users()` | Admin only |
| `can_manage_databases()` | Admin, Operator |
| `can_trigger_backup()` | Admin, Operator |
| `can_manage_settings()` | Admin only |
| `can_view()` | All enabled users |

**AccessRequestStatus Enum:**
- `PENDING`, `APPROVED`, `REJECTED`

**AccessRequest Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | str | Unique request ID |
| `email` | str | User email from Azure AD |
| `name` | str | Display name from Azure AD |
| `azure_ad_id` | str | Azure AD Object ID |
| `status` | AccessRequestStatus | Request status |
| `requested_at` | datetime | When request was submitted |
| `resolved_at` | datetime | When request was resolved |
| `resolved_by` | str | ID of admin who resolved |
| `rejection_reason` | str | Reason if rejected |

**Input Models:**
- `CreateUserInput` - Fields: `email`, `name`, `role`
- `UpdateUserInput` - Fields: `name`, `role`, `enabled` (all optional)

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
- Generic CRUD: `CREATE`, `UPDATE`, `DELETE`
- Backup: `BACKUP_COMPLETED`, `BACKUP_FAILED`, `BACKUP_TRIGGERED`, `BACKUP_DOWNLOADED`, `BACKUP_DELETED`, `BACKUP_DELETED_BULK`, `BACKUP_DELETED_RETENTION`
- Database: `DATABASE_CREATED`, `DATABASE_UPDATED`, `DATABASE_DELETED`, `DATABASE_TEST_CONNECTION`
- Policy: `POLICY_CREATED`, `POLICY_UPDATED`, `POLICY_DELETED`
- User: `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `USER_LOGIN`, `USER_LOGOUT`
- Access: `ACCESS_REQUEST_APPROVED`, `ACCESS_REQUEST_REJECTED`
- Settings: `SETTINGS_UPDATED`

**AuditResourceType Enum:**
- `DATABASE`, `ENGINE`, `BACKUP`, `POLICY`, `USER`, `ACCESS_REQUEST`, `SETTINGS`

**AuditStatus Enum:**
- `SUCCESS`
- `FAILED`

**AuditLogCreate Input Model:**
- Input validation model for creating audit logs

**Audit Details by Resource Type:**

| Resource Type | Common Details Fields |
|---------------|----------------------|
| DATABASE | `database_type`, `engine_id`, `host`, `port`, `database_name`, `policy_id` |
| ENGINE | `engine_id`, `engine_type`, `host`, `port` |
| BACKUP | `database_id`, `database_alias`, `database_type`, `engine_id` |
| USER | `role`, `name` |
| POLICY | `description`, `summary`, `is_system` |

#### `models/settings.py`

Application-wide settings:

```python
from shared.models import AppSettings

settings = AppSettings(
    dark_mode=False,
    default_retention_days=30,
    default_compression=True,
    access_requests_enabled=True,
)

# Convert to/from Azure Table Storage
entity = settings.to_table_entity()
settings = AppSettings.from_table_entity(entity)
```

**AppSettings Fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dark_mode` | bool | `False` | Enable dark mode in UI |
| `default_retention_days` | int | `30` | Default retention period (1-365) |
| `default_compression` | bool | `True` | Default compression for new databases |
| `access_requests_enabled` | bool | `True` | Allow unauthorized users to request access |
| `updated_at` | datetime | auto | Last update timestamp |

**Table Storage:**
- PartitionKey: `"settings"`
- RowKey: `"app"`

#### `services/storage_service.py`

Unified service for all Azure Storage operations.

**Module-level Helper:**
```python
def format_bytes(size_bytes: int) -> str:
    """Format bytes into human-readable string (e.g., '1.5 GB')."""
```

**Class: StorageService**

```python
from shared.services import StorageService

storage = StorageService(azure_clients=None)  # Optional, creates clients if not provided
```

**Blob Storage Operations:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `upload_backup` | `blob_name: str, data: BinaryIO, content_type="application/octet-stream", container_name=None` | `str` (URL) | Upload backup file |
| `download_backup` | `blob_name: str, container_name=None` | `bytes` | Download backup content |
| `get_backup_url` | `blob_name: str, container_name=None, expiry_hours=24` | `str` (SAS URL) | Generate download URL with auto-rewrite for Codespaces/Docker |
| `list_backups` | `prefix=None, container_name=None, max_results=100` | `list[dict]` | List backup files with metadata |
| `delete_backup` | `blob_name: str, container_name=None` | `bool` | Delete backup file |

**Queue Storage Operations:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `send_backup_job` | `job_message: str, queue_name=None` | `str` (message ID) | Send backup job to queue |
| `receive_backup_jobs` | `max_messages=1, visibility_timeout=300, queue_name=None` | `list[dict]` | Receive jobs from queue |
| `delete_queue_message` | `message_id: str, pop_receipt: str, queue_name=None` | `None` | Delete processed message |

**Table Storage - Backup History:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `save_backup_result` | `result: BackupResult` | `None` | Save backup result to history |
| `delete_backup_result` | `backup_id: str` | `Optional[BackupResult]` | Delete by ID (searches across partitions) |
| `get_backup_history` | `database_id=None, start_date=None, end_date=None, limit=100` | `list[BackupResult]` | Get history (loads all, use paged for efficiency) |
| `get_backup_history_paged` | `page_size=25, page=1, database_id=None, database_ids=None, status=None, triggered_by=None, database_type=None, start_date=None, end_date=None` | `tuple[list[BackupResult], int, bool]` | Paginated history (results, total, has_more) |
| `get_backup_result` | `result_id: str, date: datetime` | `Optional[BackupResult]` | Get specific result by ID and date |
| `get_backup_alerts` | `consecutive_failures=2` | `list[dict]` | Get databases with N consecutive failures |
| `get_backup_stats_for_database` | `database_id: str` | `dict` | Stats with count, total_size_bytes, total_size_formatted |
| `delete_all_backups_for_database` | `database_id: str` | `dict` | Delete all blobs and records for a database |

**Settings Operations:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_settings` | None | `AppSettings` | Get app settings (defaults if none exist) |
| `save_settings` | `settings: AppSettings` | `AppSettings` | Save app settings |

**User Operations:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `get_user` | `user_id: str` | `Optional[User]` | Get user by Azure AD Object ID |
| `get_user_by_email` | `email: str` | `Optional[User]` | Get user by email |
| `get_all_users` | None | `list[User]` | Get all users |
| `get_user_count` | None | `int` | Total user count |
| `has_any_users` | None | `bool` | Check if any users exist (first-run) |
| `save_user` | `user: User` | `User` | Save or update user |
| `create_first_admin` | `user_id: str, email: str, name: str` | `User` | Create first admin (fails if users exist) |
| `delete_user` | `user_id: str` | `bool` | Delete user by ID |
| `update_last_login` | `user_id: str` | `Optional[User]` | Update last login timestamp |
| `get_users_paged` | `page_size=50, page=1, search=None, status=None` | `tuple[list[User], int, bool]` | Paginated users with search (results, total, has_more) |

**Access Request Operations:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `save_access_request` | `request: AccessRequest` | `AccessRequest` | Save access request |
| `get_access_request` | `request_id: str` | `Optional[AccessRequest]` | Get request by ID |
| `get_access_request_by_email` | `email: str` | `Optional[AccessRequest]` | Get pending request by email |
| `get_pending_access_requests` | None | `list[AccessRequest]` | Get all pending requests |
| `get_pending_access_requests_count` | None | `int` | Count of pending requests |
| `delete_access_request` | `request_id: str` | `bool` | Delete request by ID |

**Backup Policy Operations:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `seed_default_policies` | None | `list[BackupPolicy]` | Seed defaults if they don't exist |
| `get_backup_policy` | `policy_id: str` | `Optional[BackupPolicy]` | Get policy by ID |
| `get_all_backup_policies` | None | `list[BackupPolicy]` | Get all policies (seeds defaults first) |
| `save_backup_policy` | `policy: BackupPolicy` | `BackupPolicy` | Save or update policy |
| `delete_backup_policy` | `policy_id: str` | `bool` | Delete policy (fails for system policies) |
| `get_databases_using_policy` | `policy_id: str` | `int` | Count databases using this policy |

**Private Helper Methods:**

| Method | Description |
|--------|-------------|
| `_get_users_table()` | Get or create users table client |
| `_get_access_requests_table()` | Get or create accessrequests table client |
| `_get_policies_table()` | Get or create backuppolicies table client |

#### `services/database_config_service.py`

CRUD operations for database configurations.

**Class: DatabaseConfigService**

```python
from shared.services import DatabaseConfigService

service = DatabaseConfigService(azure_clients=None)
```

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create` | `config: DatabaseConfig` | `DatabaseConfig` | Create new config (generates ID if missing) |
| `get` | `database_id: str` | `Optional[DatabaseConfig]` | Get by ID |
| `get_all` | `enabled_only=False, limit=None, offset=0, search=None, database_type=None, host=None, policy_id=None, engine_id=None` | `tuple[list[DatabaseConfig], int]` | Paginated list with filters |
| `get_by_type` | `database_type: DatabaseType` | `list[DatabaseConfig]` | Filter by database type |
| `update` | `config: DatabaseConfig` | `DatabaseConfig` | Update existing config |
| `delete` | `database_id: str` | `bool` | Delete by ID |
| `enable` | `database_id: str` | `Optional[DatabaseConfig]` | Enable backups |
| `disable` | `database_id: str` | `Optional[DatabaseConfig]` | Disable backups |
| `update_schedule` | `database_id: str, schedule: str` | `Optional[DatabaseConfig]` | Update cron schedule |

**Private Helper Methods:**

| Method | Description |
|--------|-------------|
| `_get_table_client()` | Get table client, ensuring table exists |

**Usage Example:**

```python
# Get all with filters (returns tuple: configs, total_count)
configs, total = service.get_all(
    enabled_only=True,
    limit=25,
    offset=0,
    search="mysql",
    database_type="mysql",
    engine_id="engine-001",
    policy_id="production-standard",
)
```

#### `services/engine_service.py`

CRUD operations for engine (database server) configurations with database discovery.

**Class: EngineService**

```python
from shared.services import EngineService

service = EngineService(azure_clients=None)
```

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create` | `engine: Engine` | `Engine` | Create engine (validates unique host:port:type) |
| `get` | `engine_id: str` | `Optional[Engine]` | Get by ID |
| `get_all` | `limit=None, offset=0, search=None, engine_type=None` | `tuple[list[Engine], int]` | Paginated list with filters |
| `get_by_host` | `host: str, port: int, engine_type: EngineType` | `Optional[Engine]` | Find by host/port/type |
| `update` | `engine: Engine` | `Engine` | Update existing engine |
| `delete` | `engine_id: str` | `bool` | Delete by ID |
| `get_database_count` | `engine_id: str` | `int` | Count databases for engine |
| `discover_databases` | `engine: Engine` | `list[DiscoveredDatabase]` | Discover available databases |

**Private Helper Methods:**

| Method | Description |
|--------|-------------|
| `_get_table_client()` | Get table client, ensuring table exists |
| `_discover_mysql(engine, existing_db_names, system_dbs)` | Discover MySQL databases using `mysql -N -e "SHOW DATABASES"` |
| `_discover_postgresql(engine, existing_db_names, system_dbs)` | Discover PostgreSQL databases using `psql -t -A -c "SELECT datname..."` |
| `_discover_sqlserver(engine, existing_db_names, system_dbs)` | Discover SQL Server databases using `sqlcmd -Q "SELECT name..."` |

**Discovery Flow:**
1. Validates engine has credentials (`has_credentials()`)
2. Gets existing databases for this engine
3. Gets system databases from `SYSTEM_DATABASES` constant
4. Calls appropriate `_discover_*` method based on engine type
5. Updates engine's `last_discovery` timestamp
6. Returns list of `DiscoveredDatabase` objects with `name`, `exists`, `is_system` flags

#### `services/audit_service.py`

Audit logging service with query and statistics.

**Class: AuditService**

```python
from shared.services import AuditService, get_audit_service
from shared.models import AuditAction, AuditResourceType, AuditStatus

# Create instance directly
audit = AuditService(azure_clients=None)

# Or use singleton factory
audit = get_audit_service()
```

**Class Constants:**
- `TABLE_NAME = "auditlogs"`

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `log` | `user_id: str, user_email: str, action: AuditAction, resource_type: AuditResourceType, resource_id: str, resource_name: str, details=None, status=SUCCESS, error_message=None, ip_address=None` | `AuditLog` | Log an action (note parameter order!) |
| `log_from_create` | `create_input: AuditLogCreate` | `AuditLog` | Log from input model |
| `get_logs` | `start_date=None, end_date=None, user_id=None, action=None, resource_type=None, status=None, search=None, database_type=None, engine_id=None, resource_name=None, limit=50, offset=0` | `tuple[list[AuditLog], int]` | Query with filters and pagination |
| `get_log_by_id` | `log_id: str` | `Optional[AuditLog]` | Get specific log by ID |
| `get_logs_for_resource` | `resource_type: AuditResourceType, resource_id: str, limit=50` | `list[AuditLog]` | Get logs for a resource |
| `get_logs_for_user` | `user_id: str, limit=50` | `list[AuditLog]` | Get logs for a user |
| `get_stats` | `start_date=None, end_date=None` | `dict` | Statistics (total, by_action, by_resource_type, by_status) |

**Private Helper Methods:**

| Method | Description |
|--------|-------------|
| `_ensure_table_exists()` | Create auditlogs table if it doesn't exist |

**Factory Function:**

```python
def get_audit_service() -> AuditService:
    """Get the singleton AuditService instance."""
```

**Usage Example (note parameter order):**

```python
audit.log(
    user_id="user-001",       # FIRST parameter
    user_email="admin@example.com",  # SECOND parameter
    action=AuditAction.DATABASE_CREATED,
    resource_type=AuditResourceType.DATABASE,
    resource_id="db-001",
    resource_name="Production MySQL",
    details={
        "database_type": "mysql",
        "engine_id": "engine-001",
        "host": "mysql.example.com",
        "port": 3306,
        "database_name": "myapp",
        "policy_id": "production-standard",
    },
    status=AuditStatus.SUCCESS,
    error_message=None,
    ip_address="192.168.1.1",
)

# Get stats
stats = audit.get_stats()
# Returns: {
#   "total": 150,
#   "by_action": {"database_created": 45, "backup_completed": 100, ...},
#   "by_resource_type": {"database": 50, "backup": 100, ...},
#   "by_status": {"success": 148, "failed": 2}
# }
```

#### `services/connection_tester.py`

Service for testing database connections using native client tools.

**Dataclass: ConnectionTestResult**

```python
@dataclass
class ConnectionTestResult:
    success: bool
    message: str
    error_type: Optional[str] = None
    duration_ms: Optional[float] = None
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | bool | Whether connection succeeded |
| `message` | str | "Connection successful" or error description |
| `error_type` | Optional[str] | Error type: "ConnectionFailed", "Timeout", "ToolNotFound", "UnsupportedType" |
| `duration_ms` | Optional[float] | Response time in milliseconds |

**Class: ConnectionTester**

```python
from shared.services import ConnectionTester, get_connection_tester
from shared.models import DatabaseType

# Create instance directly
tester = ConnectionTester()

# Or use singleton factory
tester = get_connection_tester()
```

**Public Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `test_connection` | `database_type: DatabaseType, host: str, port: int, database: str, username: str, password: str, timeout_seconds=30` | `ConnectionTestResult` | Test connection |

**Private Helper Methods:**

| Method | Description |
|--------|-------------|
| `_test_mysql(host, port, database, username, password, timeout)` | Test MySQL using `mysql -e "SELECT 1"` |
| `_test_postgresql(host, port, database, username, password, timeout)` | Test PostgreSQL using `pg_isready` |
| `_test_sqlserver(host, port, database, username, password, timeout)` | Test SQL Server using `sqlcmd -Q "SELECT 1"` |
| `_clean_mysql_error(error: str)` | Remove password warnings from MySQL errors |
| `_clean_sqlserver_error(error: str)` | Simplify SQL Server error messages |

**Factory Function:**

```python
def get_connection_tester() -> ConnectionTester:
    """Get singleton ConnectionTester instance."""
```

**Supported Database Types:**
- `DatabaseType.MYSQL` - uses `mysql` client
- `DatabaseType.POSTGRESQL` - uses `pg_isready`
- `DatabaseType.SQLSERVER` / `DatabaseType.AZURE_SQL` - uses `sqlcmd`

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
| PartitionKey | string | Month (`YYYYMM`) |
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
