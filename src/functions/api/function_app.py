"""
Dilux Database Backup - API Function App

HTTP triggers for managing database backups:
- GET /api/databases - List all database configurations
- POST /api/databases - Create a new database configuration
- GET /api/databases/{id} - Get a specific database configuration
- PUT /api/databases/{id} - Update a database configuration
- DELETE /api/databases/{id} - Delete a database configuration
- POST /api/databases/{id}/backup - Trigger a manual backup
- GET /api/backups - List backup history
- GET /api/backups/{id}/download - Download a backup file
- GET /api/health - Health check
- GET /api/settings - Get application settings
- PUT /api/settings - Update application settings
- GET /api/users - List all users (admin only)
- POST /api/users - Create a new user (admin only)
- GET /api/users/me - Get current user
- PUT /api/users/{id} - Update a user (admin only)
- DELETE /api/users/{id} - Delete a user (admin only)
"""

import json
import logging
import sys
from datetime import datetime
from pathlib import Path

import azure.functions as func

# Add shared package to path
shared_path = Path(__file__).parent.parent.parent / "shared"
if str(shared_path) not in sys.path:
    sys.path.insert(0, str(shared_path))

from shared.config import get_settings
from shared.models import DatabaseConfig, DatabaseType, BackupJob, BackupStatus, AppSettings, User, UserRole
from shared.services import StorageService, DatabaseConfigService, get_connection_tester
from shared.exceptions import NotFoundError, ValidationError
from shared.auth import get_current_user, require_auth, require_role

# Initialize Function App
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Initialize services
settings = get_settings()
storage_service = StorageService()
db_config_service = DatabaseConfigService()

logger = logging.getLogger(__name__)


# ===========================================
# Health Check
# ===========================================


@app.route(route="health", methods=["GET"])
def health_check(req: func.HttpRequest) -> func.HttpResponse:
    """Health check endpoint."""
    return func.HttpResponse(
        json.dumps({
            "status": "healthy",
            "service": "dilux-backup-api",
            "version": "0.1.0",
            "timestamp": datetime.utcnow().isoformat(),
        }),
        mimetype="application/json",
        status_code=200,
    )


@app.route(route="system-status", methods=["GET"])
def system_status(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get comprehensive system status including:
    - Storage usage
    - Backup statistics (today, success rate)
    - Service health checks

    Query params:
    - period: str - Time period for backup stats: 1d, 7d, 30d, all (default: 1d)
    """
    from datetime import timedelta

    try:
        # Get period from query params
        period = req.params.get("period", "1d")
        period_days = {"1d": 1, "7d": 7, "30d": 30, "all": 3650}.get(period, 1)

        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_start = now - timedelta(days=period_days)

        # Initialize response structure
        status = {
            "timestamp": now.isoformat(),
            "storage": {
                "total_size_bytes": 0,
                "total_size_formatted": "0 B",
                "backup_count": 0,
            },
            "backups": {
                "period": period,
                "today": 0,
                "completed": 0,
                "failed": 0,
                "success_rate": None,  # None when no backups exist
            },
            "services": {
                "api": {"status": "healthy", "message": "Running"},
                "storage": {"status": "unknown", "message": "Checking..."},
                "databases": {"status": "unknown", "message": "Checking..."},
            },
        }

        # === Storage Stats ===
        try:
            # List all backup blobs to calculate total size
            backups_list = storage_service.list_backups(max_results=10000)
            total_size = sum(b.get("size", 0) for b in backups_list)
            status["storage"]["total_size_bytes"] = total_size
            status["storage"]["total_size_formatted"] = format_bytes(total_size)
            status["storage"]["backup_count"] = len(backups_list)
            status["services"]["storage"] = {"status": "healthy", "message": "Connected"}
        except Exception as e:
            logger.error(f"Storage check failed: {e}")
            status["services"]["storage"] = {"status": "unhealthy", "message": str(e)[:100]}

        # === Backup Stats (configurable period) ===
        try:
            # Get backups from the specified period
            recent_backups = storage_service.get_backup_history(
                start_date=period_start,
                limit=10000,
            )

            completed = 0
            failed = 0
            today_count = 0

            for backup in recent_backups:
                if backup.status.value == "completed":
                    completed += 1
                elif backup.status.value == "failed":
                    failed += 1

                # Count today's backups
                if backup.created_at >= today_start:
                    today_count += 1

            total = completed + failed
            # If no backups, success_rate is None (not 100%)
            success_rate = round(completed / total * 100, 1) if total > 0 else None

            status["backups"]["today"] = today_count
            status["backups"]["completed"] = completed
            status["backups"]["failed"] = failed
            status["backups"]["success_rate"] = success_rate
        except Exception as e:
            logger.error(f"Backup stats check failed: {e}")

        # === Database Configs Health ===
        try:
            configs, total = db_config_service.get_all()
            enabled_count = len([c for c in configs if c.enabled])
            status["services"]["databases"] = {
                "status": "healthy",
                "message": f"{enabled_count} enabled / {total} total",
                "total": total,
                "enabled": enabled_count,
            }
        except Exception as e:
            logger.error(f"Database configs check failed: {e}")
            status["services"]["databases"] = {"status": "unhealthy", "message": str(e)[:100]}

        return func.HttpResponse(
            json.dumps(status),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as e:
        logger.exception("System status check failed")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


def format_bytes(size_bytes: int) -> str:
    """Format bytes to human readable string."""
    if size_bytes == 0:
        return "0 B"

    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0
    size = float(size_bytes)

    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    return f"{size:.2f} {units[unit_index]}"


# ===========================================
# Database Configuration Endpoints
# ===========================================


@app.route(route="databases", methods=["GET"])
def list_databases(req: func.HttpRequest) -> func.HttpResponse:
    """
    List all database configurations.

    Query params:
    - enabled_only: bool - Filter to only enabled databases
    - type: str - Filter by database type
    - limit: int - Maximum number of results (default: no limit)
    - search: str - Search term to filter by name or host
    """
    try:
        enabled_only = req.params.get("enabled_only", "false").lower() == "true"
        db_type = req.params.get("type")
        limit_str = req.params.get("limit")
        search = req.params.get("search")

        limit = int(limit_str) if limit_str else None

        if db_type:
            configs = db_config_service.get_by_type(DatabaseType(db_type))
            total = len(configs)
        else:
            configs, total = db_config_service.get_all(
                enabled_only=enabled_only,
                limit=limit,
                search=search,
            )

        return func.HttpResponse(
            json.dumps({
                "databases": [config.model_dump(mode="json", exclude={"password"}) for config in configs],
                "count": len(configs),
                "total": total,
                "has_more": len(configs) < total,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing databases")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="databases", methods=["POST"])
def create_database(req: func.HttpRequest) -> func.HttpResponse:
    """Create a new database configuration."""
    try:
        body = req.get_json()

        # Create config from request body
        config = DatabaseConfig(
            id=body.get("id", ""),
            name=body["name"],
            database_type=DatabaseType(body["database_type"]),
            host=body["host"],
            port=body["port"],
            database_name=body["database_name"],
            username=body["username"],
            password=body.get("password"),
            password_secret_name=body.get("password_secret_name"),
            schedule=body.get("schedule", "0 0 * * *"),
            enabled=body.get("enabled", True),
            retention_days=body.get("retention_days", 30),
            backup_destination=body.get("backup_destination"),
            compression=body.get("compression", True),
            tags=body.get("tags", {}),
        )

        created = db_config_service.create(config)

        return func.HttpResponse(
            json.dumps({
                "message": "Database configuration created",
                "database": created.model_dump(mode="json", exclude={"password"}),
            }),
            mimetype="application/json",
            status_code=201,
        )
    except ValueError as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=400,
        )
    except Exception as e:
        logger.exception("Error creating database")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="databases/test-connection", methods=["POST"])
def test_connection(req: func.HttpRequest) -> func.HttpResponse:
    """
    Test database connection without saving configuration.

    Request body:
    {
        "database_type": "mysql|postgresql|sqlserver",
        "host": "hostname",
        "port": 3306,
        "database_name": "mydb",
        "username": "user",
        "password": "secret"
    }
    """
    try:
        body = req.get_json()

        # Validate required fields
        required_fields = ["database_type", "host", "port", "database_name", "username", "password"]
        missing = [f for f in required_fields if not body.get(f)]
        if missing:
            return func.HttpResponse(
                json.dumps({"error": f"Missing required fields: {', '.join(missing)}"}),
                mimetype="application/json",
                status_code=400,
            )

        # Get connection tester
        tester = get_connection_tester()

        # Test connection
        result = tester.test_connection(
            database_type=DatabaseType(body["database_type"]),
            host=body["host"],
            port=int(body["port"]),
            database=body["database_name"],
            username=body["username"],
            password=body["password"],
        )

        return func.HttpResponse(
            json.dumps({
                "success": result.success,
                "message": result.message,
                "error_type": result.error_type,
                "duration_ms": result.duration_ms,
            }),
            mimetype="application/json",
            status_code=200 if result.success else 200,  # Always 200, success in body
        )

    except ValueError as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=400,
        )
    except Exception as e:
        logger.exception("Error testing connection")
        return func.HttpResponse(
            json.dumps({
                "success": False,
                "message": str(e),
                "error_type": type(e).__name__,
            }),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="databases/{database_id}", methods=["GET"])
def get_database(req: func.HttpRequest) -> func.HttpResponse:
    """Get a specific database configuration."""
    try:
        database_id = req.route_params.get("database_id")
        config = db_config_service.get(database_id)

        if not config:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        return func.HttpResponse(
            json.dumps({"database": config.model_dump(mode="json", exclude={"password"})}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting database")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="databases/{database_id}", methods=["PUT"])
def update_database(req: func.HttpRequest) -> func.HttpResponse:
    """Update a database configuration."""
    try:
        database_id = req.route_params.get("database_id")
        body = req.get_json()

        # Get existing config
        existing = db_config_service.get(database_id)
        if not existing:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Update fields
        for field in ["name", "host", "port", "database_name", "username",
                      "schedule", "enabled", "retention_days", "backup_destination",
                      "compression", "tags", "password_secret_name"]:
            if field in body:
                setattr(existing, field, body[field])

        if "database_type" in body:
            existing.database_type = DatabaseType(body["database_type"])

        updated = db_config_service.update(existing)

        return func.HttpResponse(
            json.dumps({
                "message": "Database configuration updated",
                "database": updated.model_dump(mode="json", exclude={"password"}),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except ValueError as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=400,
        )
    except Exception as e:
        logger.exception("Error updating database")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="databases/{database_id}", methods=["DELETE"])
def delete_database(req: func.HttpRequest) -> func.HttpResponse:
    """Delete a database configuration."""
    try:
        database_id = req.route_params.get("database_id")
        deleted = db_config_service.delete(database_id)

        if not deleted:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        return func.HttpResponse(
            json.dumps({"message": f"Database '{database_id}' deleted"}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error deleting database")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ===========================================
# Backup Endpoints
# ===========================================


@app.route(route="databases/{database_id}/backup", methods=["POST"])
def trigger_backup(req: func.HttpRequest) -> func.HttpResponse:
    """Trigger a manual backup for a database."""
    try:
        database_id = req.route_params.get("database_id")
        config = db_config_service.get(database_id)

        if not config:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Create backup job
        job = BackupJob(
            database_id=config.id,
            database_name=config.name,
            database_type=config.database_type,
            host=config.host,
            port=config.port,
            target_database=config.database_name,
            username=config.username,
            password_secret_name=config.password_secret_name,
            compression=config.compression,
            backup_destination=config.backup_destination,
            triggered_by="manual",
        )

        # Send to queue
        message_id = storage_service.send_backup_job(job.to_queue_message())

        return func.HttpResponse(
            json.dumps({
                "message": "Backup job queued",
                "job_id": job.id,
                "queue_message_id": message_id,
            }),
            mimetype="application/json",
            status_code=202,
        )
    except Exception as e:
        logger.exception("Error triggering backup")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backups", methods=["GET"])
def list_backups(req: func.HttpRequest) -> func.HttpResponse:
    """
    List backup history with server-side pagination.

    Query params:
    - page_size: int - Results per page (default 25, max 100)
    - page: int - Page number, 1-based (default 1)
    - database_id: str - Filter by database ID
    - status: str - Filter by status (completed, failed, in_progress)
    - triggered_by: str - Filter by trigger (manual, scheduler)
    - database_type: str - Filter by type (mysql, postgresql, sqlserver)
    - start_date: str - Filter from date (YYYY-MM-DD)
    - end_date: str - Filter until date (YYYY-MM-DD)
    """
    try:
        # Pagination params
        page_size = min(int(req.params.get("page_size", "25")), 100)
        page = max(int(req.params.get("page", "1")), 1)

        # Filter params
        database_id = req.params.get("database_id")
        status = req.params.get("status")
        triggered_by = req.params.get("triggered_by")
        database_type = req.params.get("database_type")
        start_date_str = req.params.get("start_date")
        end_date_str = req.params.get("end_date")

        start_date = datetime.fromisoformat(start_date_str) if start_date_str else None
        end_date = datetime.fromisoformat(end_date_str) if end_date_str else None

        results, total_count, has_more = storage_service.get_backup_history_paged(
            page_size=page_size,
            page=page,
            database_id=database_id,
            status=status,
            triggered_by=triggered_by,
            database_type=database_type,
            start_date=start_date,
            end_date=end_date,
        )

        return func.HttpResponse(
            json.dumps({
                "backups": [result.model_dump(mode="json") for result in results],
                "count": len(results),
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "has_more": has_more,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing backups")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backups/files", methods=["GET"])
def list_backup_files(req: func.HttpRequest) -> func.HttpResponse:
    """
    List backup files in storage.

    Query params:
    - prefix: str - Filter by blob name prefix
    - limit: int - Maximum results (default 100)
    """
    try:
        prefix = req.params.get("prefix")
        limit = int(req.params.get("limit", "100"))

        files = storage_service.list_backups(prefix=prefix, max_results=limit)

        return func.HttpResponse(
            json.dumps({
                "files": files,
                "count": len(files),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing backup files")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backups/download", methods=["GET"])
def download_backup(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get a download URL for a backup file.

    Query params:
    - blob_name: str - Name of the blob to download
    - expiry_hours: int - Hours until URL expires (default 24)
    """
    try:
        blob_name = req.params.get("blob_name")
        if not blob_name:
            return func.HttpResponse(
                json.dumps({"error": "blob_name parameter is required"}),
                mimetype="application/json",
                status_code=400,
            )

        expiry_hours = int(req.params.get("expiry_hours", "24"))

        download_url = storage_service.get_backup_url(
            blob_name=blob_name,
            expiry_hours=expiry_hours,
        )

        return func.HttpResponse(
            json.dumps({
                "download_url": download_url,
                "blob_name": blob_name,
                "expires_in_hours": expiry_hours,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error generating download URL")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ===========================================
# Settings Endpoints
# ===========================================


@app.route(route="settings", methods=["GET"])
def get_app_settings(req: func.HttpRequest) -> func.HttpResponse:
    """Get application settings."""
    try:
        app_settings = storage_service.get_settings()

        return func.HttpResponse(
            json.dumps({
                "settings": app_settings.model_dump(mode="json"),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting settings")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="settings", methods=["PUT"])
def update_app_settings(req: func.HttpRequest) -> func.HttpResponse:
    """Update application settings."""
    try:
        body = req.get_json()

        # Get current settings and update
        current = storage_service.get_settings()

        if "dark_mode" in body:
            current.dark_mode = body["dark_mode"]
        if "default_retention_days" in body:
            current.default_retention_days = body["default_retention_days"]
        if "default_compression" in body:
            current.default_compression = body["default_compression"]

        saved = storage_service.save_settings(current)

        return func.HttpResponse(
            json.dumps({
                "message": "Settings updated",
                "settings": saved.model_dump(mode="json"),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except ValueError as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=400,
        )
    except Exception as e:
        logger.exception("Error updating settings")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ===========================================
# User Management Endpoints
# ===========================================


@app.route(route="users/me", methods=["GET"])
def get_current_user_endpoint(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get current authenticated user.

    Returns user info and role, or triggers first-run setup.
    """
    try:
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        return func.HttpResponse(
            json.dumps({
                "user": auth_result.user.model_dump(mode="json"),
                "is_first_run": auth_result.is_first_run,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting current user")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="users", methods=["GET"])
def list_users(req: func.HttpRequest) -> func.HttpResponse:
    """
    List all users (admin only).
    """
    try:
        # Check auth and role
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        if not auth_result.user.can_manage_users():
            return func.HttpResponse(
                json.dumps({"error": "Admin access required"}),
                mimetype="application/json",
                status_code=403,
            )

        users = storage_service.get_all_users()

        return func.HttpResponse(
            json.dumps({
                "users": [u.model_dump(mode="json") for u in users],
                "count": len(users),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing users")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="users", methods=["POST"])
def create_user(req: func.HttpRequest) -> func.HttpResponse:
    """
    Create a new user (admin only).

    Body:
    - email: str (required) - must match Azure AD email
    - name: str (required)
    - role: str (optional) - admin, operator, viewer (default: viewer)
    """
    try:
        # Check auth and role
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        if not auth_result.user.can_manage_users():
            return func.HttpResponse(
                json.dumps({"error": "Admin access required"}),
                mimetype="application/json",
                status_code=403,
            )

        body = req.get_json()

        # Validate required fields
        if not body.get("email"):
            return func.HttpResponse(
                json.dumps({"error": "Email is required"}),
                mimetype="application/json",
                status_code=400,
            )

        if not body.get("name"):
            return func.HttpResponse(
                json.dumps({"error": "Name is required"}),
                mimetype="application/json",
                status_code=400,
            )

        # Check if user already exists by email
        existing = storage_service.get_user_by_email(body["email"])
        if existing:
            return func.HttpResponse(
                json.dumps({"error": f"User with email '{body['email']}' already exists"}),
                mimetype="application/json",
                status_code=409,
            )

        # Parse role
        role_str = body.get("role", "viewer").lower()
        try:
            role = UserRole(role_str)
        except ValueError:
            return func.HttpResponse(
                json.dumps({"error": f"Invalid role: {role_str}. Valid roles: admin, operator, viewer"}),
                mimetype="application/json",
                status_code=400,
            )

        # Create user with a placeholder ID (will be replaced when they first login)
        import uuid
        user = User(
            id=f"pending-{uuid.uuid4()}",  # Placeholder until Azure AD login
            email=body["email"],
            name=body["name"],
            role=role,
            enabled=True,
            created_by=auth_result.user.id,
        )

        saved = storage_service.save_user(user)

        return func.HttpResponse(
            json.dumps({
                "message": "User created. They will be activated on first Azure AD login.",
                "user": saved.model_dump(mode="json"),
            }),
            mimetype="application/json",
            status_code=201,
        )
    except Exception as e:
        logger.exception("Error creating user")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="users/{user_id}", methods=["GET"])
def get_user(req: func.HttpRequest) -> func.HttpResponse:
    """Get a specific user (admin only)."""
    try:
        user_id = req.route_params.get("user_id")

        # Check auth and role
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        # Allow users to get their own info
        if user_id != auth_result.user.id and not auth_result.user.can_manage_users():
            return func.HttpResponse(
                json.dumps({"error": "Admin access required"}),
                mimetype="application/json",
                status_code=403,
            )

        user = storage_service.get_user(user_id)

        if not user:
            return func.HttpResponse(
                json.dumps({"error": f"User '{user_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        return func.HttpResponse(
            json.dumps({"user": user.model_dump(mode="json")}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting user")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="users/{user_id}", methods=["PUT"])
def update_user(req: func.HttpRequest) -> func.HttpResponse:
    """
    Update a user (admin only).

    Body:
    - name: str (optional)
    - role: str (optional) - admin, operator, viewer
    - enabled: bool (optional)
    """
    try:
        user_id = req.route_params.get("user_id")

        # Check auth and role
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        if not auth_result.user.can_manage_users():
            return func.HttpResponse(
                json.dumps({"error": "Admin access required"}),
                mimetype="application/json",
                status_code=403,
            )

        user = storage_service.get_user(user_id)

        if not user:
            return func.HttpResponse(
                json.dumps({"error": f"User '{user_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        body = req.get_json()

        # Prevent admin from demoting themselves
        if user_id == auth_result.user.id:
            if body.get("role") and body["role"] != "admin":
                return func.HttpResponse(
                    json.dumps({"error": "You cannot demote yourself. Ask another admin."}),
                    mimetype="application/json",
                    status_code=400,
                )
            if body.get("enabled") is False:
                return func.HttpResponse(
                    json.dumps({"error": "You cannot disable yourself. Ask another admin."}),
                    mimetype="application/json",
                    status_code=400,
                )

        # Update fields
        if "name" in body:
            user.name = body["name"]

        if "role" in body:
            try:
                user.role = UserRole(body["role"].lower())
            except ValueError:
                return func.HttpResponse(
                    json.dumps({"error": f"Invalid role: {body['role']}"}),
                    mimetype="application/json",
                    status_code=400,
                )

        if "enabled" in body:
            user.enabled = body["enabled"]

        saved = storage_service.save_user(user)

        return func.HttpResponse(
            json.dumps({
                "message": "User updated",
                "user": saved.model_dump(mode="json"),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error updating user")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="users/{user_id}", methods=["DELETE"])
def delete_user(req: func.HttpRequest) -> func.HttpResponse:
    """Delete a user (admin only)."""
    try:
        user_id = req.route_params.get("user_id")

        # Check auth and role
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        if not auth_result.user.can_manage_users():
            return func.HttpResponse(
                json.dumps({"error": "Admin access required"}),
                mimetype="application/json",
                status_code=403,
            )

        # Prevent admin from deleting themselves
        if user_id == auth_result.user.id:
            return func.HttpResponse(
                json.dumps({"error": "You cannot delete yourself. Ask another admin."}),
                mimetype="application/json",
                status_code=400,
            )

        deleted = storage_service.delete_user(user_id)

        if not deleted:
            return func.HttpResponse(
                json.dumps({"error": f"User '{user_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        return func.HttpResponse(
            json.dumps({"message": f"User '{user_id}' deleted"}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error deleting user")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )
