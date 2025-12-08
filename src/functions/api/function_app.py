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
from shared.models import DatabaseConfig, DatabaseType, BackupJob, BackupStatus, AppSettings, User, UserRole, BackupPolicy, TierConfig, AuditLog, AuditAction, AuditResourceType, AuditStatus, Engine, EngineType, AuthMethod, CreateEngineInput, UpdateEngineInput
from shared.services import StorageService, DatabaseConfigService, EngineService, get_connection_tester, get_audit_service
from shared.exceptions import NotFoundError, ValidationError
from shared.auth import get_current_user, require_auth, require_role

# Initialize Function App
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# Initialize services
settings = get_settings()
storage_service = StorageService()
db_config_service = DatabaseConfigService()
engine_service = EngineService()
audit_service = get_audit_service()

logger = logging.getLogger(__name__)


def get_client_ip(req: func.HttpRequest) -> str:
    """Extract client IP address from request headers."""
    # Check common headers for proxied requests
    forwarded = req.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return req.headers.get("X-Real-IP", "unknown")


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


@app.route(route="backup-alerts", methods=["GET"])
def backup_alerts(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get databases with consecutive backup failures.

    Query params:
    - consecutive_failures: int - Number of consecutive failures to trigger alert (default: 2)
    """
    try:
        consecutive_failures = int(req.params.get("consecutive_failures", "2"))

        alerts = storage_service.get_backup_alerts(
            consecutive_failures=consecutive_failures
        )

        return func.HttpResponse(
            json.dumps({
                "alerts": alerts,
                "count": len(alerts),
            }),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as e:
        logger.exception("Backup alerts check failed")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


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
    - offset: int - Number of results to skip (for pagination)
    - search: str - Search term to filter by name or host
    - host: str - Filter by host
    - policy_id: str - Filter by policy ID
    - engine_id: str - Filter by engine ID
    """
    try:
        enabled_only = req.params.get("enabled_only", "false").lower() == "true"
        db_type = req.params.get("type")
        limit_str = req.params.get("limit")
        offset_str = req.params.get("offset")
        search = req.params.get("search")
        host = req.params.get("host")
        policy_id = req.params.get("policy_id")
        engine_id = req.params.get("engine_id")

        limit = int(limit_str) if limit_str else None
        offset = int(offset_str) if offset_str else 0

        configs, total = db_config_service.get_all(
            enabled_only=enabled_only,
            limit=limit,
            offset=offset,
            search=search,
            database_type=db_type,
            host=host,
            policy_id=policy_id,
            engine_id=engine_id,
        )

        # Build engine lookup for engine_name
        engine_ids = {c.engine_id for c in configs if c.engine_id}
        engines_map = {}
        if engine_ids:
            all_engines, _ = engine_service.get_all()
            engines_map = {e.id: e.name for e in all_engines}

        # Build response with engine_name
        databases_response = []
        for config in configs:
            db_dict = config.model_dump(mode="json", exclude={"password"})
            if config.engine_id and config.engine_id in engines_map:
                db_dict["engine_name"] = engines_map[config.engine_id]
            databases_response.append(db_dict)

        return func.HttpResponse(
            json.dumps({
                "databases": databases_response,
                "count": len(configs),
                "total": total,
                "has_more": (offset + len(configs)) < total,
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
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

        body = req.get_json()

        # Get engine_id and use_engine_credentials
        engine_id = body.get("engine_id")
        use_engine_credentials = body.get("use_engine_credentials", False)

        # If using engine credentials, get them from the engine
        username = body.get("username")
        password = body.get("password")

        if use_engine_credentials and engine_id:
            engine = engine_service.get(engine_id)
            if engine:
                username = engine.username
                password = engine.password

        # Create config from request body
        config = DatabaseConfig(
            id=body.get("id", ""),
            name=body["name"],
            database_type=DatabaseType(body["database_type"]),
            engine_id=engine_id,
            use_engine_credentials=use_engine_credentials,
            host=body["host"],
            port=body["port"],
            database_name=body["database_name"],
            username=username,
            password=password,
            password_secret_name=body.get("password_secret_name"),
            policy_id=body.get("policy_id", "production-standard"),
            enabled=body.get("enabled", True),
            backup_destination=body.get("backup_destination"),
            compression=body.get("compression", True),
            tags=body.get("tags", {}),
        )

        created = db_config_service.create(config)

        # Audit log
        audit_service.log(
            user_id=user_id,
            user_email=user_email,
            action=AuditAction.DATABASE_CREATED,
            resource_type=AuditResourceType.DATABASE,
            resource_id=created.id,
            resource_name=created.name,
            details={
                "database_type": created.database_type.value,
                "engine_id": created.engine_id,
                "host": created.host,
                "port": created.port,
                "database_name": created.database_name,
                "policy_id": created.policy_id,
            },
            ip_address=get_client_ip(req),
        )

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
        "username": "user",  // optional if use_engine_credentials=true
        "password": "secret", // optional if use_engine_credentials=true
        "engine_id": "engine-001",  // optional
        "use_engine_credentials": true  // optional
    }
    """
    try:
        body = req.get_json()

        # Check for engine credentials
        engine_id = body.get("engine_id")
        use_engine_credentials = body.get("use_engine_credentials", False)
        username = body.get("username")
        password = body.get("password")

        # If using engine credentials, get them from the engine
        if use_engine_credentials and engine_id:
            engine = engine_service.get(engine_id)
            if engine:
                username = engine.username
                password = engine.password
            else:
                return func.HttpResponse(
                    json.dumps({"error": f"Engine '{engine_id}' not found"}),
                    mimetype="application/json",
                    status_code=404,
                )

        # Validate required fields
        required_fields = ["database_type", "host", "port", "database_name"]
        missing = [f for f in required_fields if not body.get(f)]

        # Also require credentials if not using engine credentials
        if not use_engine_credentials:
            if not username:
                missing.append("username")
            if not password:
                missing.append("password")

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
            username=username,
            password=password,
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
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

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

        # Track changes for audit
        changes = {}
        for field in ["name", "host", "port", "database_name", "username",
                      "policy_id", "enabled", "backup_destination",
                      "compression", "tags", "password_secret_name", "engine_id", "use_engine_credentials"]:
            if field in body and getattr(existing, field) != body[field]:
                changes[field] = {"from": getattr(existing, field), "to": body[field]}
                setattr(existing, field, body[field])

        if "database_type" in body:
            if existing.database_type.value != body["database_type"]:
                changes["database_type"] = {"from": existing.database_type.value, "to": body["database_type"]}
            existing.database_type = DatabaseType(body["database_type"])

        # Handle use_engine_credentials - if enabled, copy credentials from engine
        if existing.use_engine_credentials and existing.engine_id:
            engine = engine_service.get(existing.engine_id)
            if engine and engine.username:
                existing.username = engine.username
                existing.password = engine.password

        updated = db_config_service.update(existing)

        # Audit log
        audit_service.log(
            user_id=user_id,
            user_email=user_email,
            action=AuditAction.DATABASE_UPDATED,
            resource_type=AuditResourceType.DATABASE,
            resource_id=updated.id,
            resource_name=updated.name,
            details={
                "database_type": updated.database_type.value,
                "engine_id": updated.engine_id,
                "changes": changes,
            } if changes else {
                "database_type": updated.database_type.value,
                "engine_id": updated.engine_id,
            },
            ip_address=get_client_ip(req),
        )

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


@app.route(route="databases/{database_id}/backup-stats", methods=["GET"])
def get_database_backup_stats(req: func.HttpRequest) -> func.HttpResponse:
    """Get backup statistics for a database (count, total size)."""
    try:
        database_id = req.route_params.get("database_id")

        # Verify database exists
        existing = db_config_service.get(database_id)
        if not existing:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        stats = storage_service.get_backup_stats_for_database(database_id)

        return func.HttpResponse(
            json.dumps(stats),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting backup stats")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="databases/{database_id}", methods=["DELETE"])
def delete_database(req: func.HttpRequest) -> func.HttpResponse:
    """
    Delete a database configuration.

    Query params:
    - delete_backups: bool - If true, also delete all backup files and history records
    """
    try:
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

        database_id = req.route_params.get("database_id")
        delete_backups = req.params.get("delete_backups", "").lower() == "true"

        # Get database info before deleting (for audit)
        existing = db_config_service.get(database_id)
        if not existing:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        database_name = existing.name
        backups_deleted = None

        # Delete backups first if requested
        if delete_backups:
            backups_deleted = storage_service.delete_all_backups_for_database(database_id)

        # Delete the database config
        deleted = db_config_service.delete(database_id)

        if not deleted:
            return func.HttpResponse(
                json.dumps({"error": f"Database '{database_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Audit log
        audit_details = {
            "database_type": existing.database_type.value,
            "engine_id": existing.engine_id,
            "host": existing.host,
            "port": existing.port,
            "database_name": existing.database_name,
        }
        if backups_deleted:
            audit_details["backups_deleted"] = backups_deleted["deleted_files"]
            audit_details["records_deleted"] = backups_deleted["deleted_records"]

        audit_service.log(
            user_id=user_id,
            user_email=user_email,
            action=AuditAction.DATABASE_DELETED,
            resource_type=AuditResourceType.DATABASE,
            resource_id=database_id,
            resource_name=database_name,
            details=audit_details,
            ip_address=get_client_ip(req),
        )

        response = {"message": f"Database '{database_id}' deleted"}
        if backups_deleted:
            response["backups_deleted"] = backups_deleted

        return func.HttpResponse(
            json.dumps(response),
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
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

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

        # Audit log
        audit_service.log(
            user_id=user_id,
            user_email=user_email,
            action=AuditAction.BACKUP_TRIGGERED,
            resource_type=AuditResourceType.BACKUP,
            resource_id=job.id,
            resource_name=config.name,
            details={
                "database_id": config.id,
                "database_alias": config.name,
                "database_type": config.database_type.value,
                "engine_id": config.engine_id,
                "triggered_by": "manual",
            },
            ip_address=get_client_ip(req),
        )

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
    - engine_id: str - Filter by server/engine ID
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
        engine_id = req.params.get("engine_id")
        status = req.params.get("status")
        triggered_by = req.params.get("triggered_by")
        database_type = req.params.get("database_type")
        start_date_str = req.params.get("start_date")
        end_date_str = req.params.get("end_date")

        start_date = datetime.fromisoformat(start_date_str) if start_date_str else None
        end_date = datetime.fromisoformat(end_date_str) if end_date_str else None

        # If engine_id is provided, get all database IDs for that engine
        database_ids = None
        if engine_id and not database_id:
            databases = db_config_service.list(engine_id=engine_id)
            database_ids = [db.id for db in databases] if databases else []

        results, total_count, has_more = storage_service.get_backup_history_paged(
            page_size=page_size,
            page=page,
            database_id=database_id,
            database_ids=database_ids,
            status=status,
            triggered_by=triggered_by,
            database_type=database_type,
            start_date=start_date,
            end_date=end_date,
        )

        # Build engine lookup for engine_name (get databases first, then engines)
        db_ids = {r.database_id for r in results if r.database_id}
        db_engine_map = {}  # database_id -> engine_id
        engine_ids = set()

        if db_ids:
            all_dbs, _ = db_config_service.get_all(limit=1000)
            for db in all_dbs:
                if db.id in db_ids and db.engine_id:
                    db_engine_map[db.id] = db.engine_id
                    engine_ids.add(db.engine_id)

        engines_map = {}  # engine_id -> engine_name
        if engine_ids:
            all_engines, _ = engine_service.get_all()
            engines_map = {e.id: e.name for e in all_engines}

        # Build response with engine_name
        backups_response = []
        for result in results:
            backup_dict = result.model_dump(mode="json")
            engine_id = db_engine_map.get(result.database_id)
            if engine_id:
                backup_dict["engine_id"] = engine_id
                backup_dict["engine_name"] = engines_map.get(engine_id)
            backups_response.append(backup_dict)

        return func.HttpResponse(
            json.dumps({
                "backups": backups_response,
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
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

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

        # Extract database info from blob_name (format: engine/database_id/filename)
        blob_parts = blob_name.split("/")
        database_type = blob_parts[0] if len(blob_parts) >= 1 else None
        database_id = blob_parts[1] if len(blob_parts) >= 2 else None
        file_name = blob_parts[-1] if blob_parts else blob_name

        # Try to get database alias and engine_id
        database_alias = None
        engine_id = None
        if database_id:
            try:
                db_config = db_config_service.get(database_id)
                if db_config:
                    database_alias = db_config.name
                    engine_id = db_config.engine_id
            except Exception:
                pass

        # Audit log
        audit_service.log(
            user_id=user_id,
            user_email=user_email,
            action=AuditAction.BACKUP_DOWNLOADED,
            resource_type=AuditResourceType.BACKUP,
            resource_id=blob_name,
            resource_name=database_alias or file_name,
            details={
                "blob_name": blob_name,
                "file_name": file_name,
                "database_type": database_type,
                "database_id": database_id,
                "database_alias": database_alias,
                "engine_id": engine_id,
                "expiry_hours": expiry_hours,
            },
            ip_address=get_client_ip(req),
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


@app.route(route="backups/delete", methods=["DELETE"])
def delete_backup_file(req: func.HttpRequest) -> func.HttpResponse:
    """
    Delete a backup file from blob storage.

    Query params:
    - blob_name: str - Name of the blob to delete
    """
    try:
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

        blob_name = req.params.get("blob_name")
        if not blob_name:
            return func.HttpResponse(
                json.dumps({"error": "blob_name parameter is required"}),
                mimetype="application/json",
                status_code=400,
            )

        deleted = storage_service.delete_backup(blob_name=blob_name)

        if deleted:
            logger.info(f"Backup deleted: {blob_name}")

            # Extract database info from blob_name (format: engine/database_id/filename)
            blob_parts = blob_name.split("/")
            database_type = blob_parts[0] if len(blob_parts) >= 1 else None
            database_id = blob_parts[1] if len(blob_parts) >= 2 else None
            file_name = blob_parts[-1] if blob_parts else blob_name

            # Try to get database alias and engine_id
            database_alias = None
            engine_id = None
            if database_id:
                try:
                    db_config = db_config_service.get(database_id)
                    if db_config:
                        database_alias = db_config.name
                        engine_id = db_config.engine_id
                except Exception:
                    pass

            # Audit log
            audit_service.log(
                user_id=user_id,
                user_email=user_email,
                action=AuditAction.BACKUP_DELETED,
                resource_type=AuditResourceType.BACKUP,
                resource_id=blob_name,
                resource_name=database_alias or file_name,
                details={
                    "blob_name": blob_name,
                    "file_name": file_name,
                    "database_type": database_type,
                    "database_id": database_id,
                    "database_alias": database_alias,
                    "engine_id": engine_id,
                    "type": "file",
                },
                ip_address=get_client_ip(req),
            )

            return func.HttpResponse(
                json.dumps({
                    "message": f"Backup '{blob_name}' deleted successfully",
                    "blob_name": blob_name,
                }),
                mimetype="application/json",
                status_code=200,
            )
        else:
            return func.HttpResponse(
                json.dumps({"error": f"Backup '{blob_name}' not found"}),
                mimetype="application/json",
                status_code=404,
            )
    except Exception as e:
        logger.exception("Error deleting backup")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backups/{backup_id}", methods=["DELETE"])
def delete_backup_record(req: func.HttpRequest) -> func.HttpResponse:
    """
    Delete a backup record from the history table.
    Useful for cleaning up failed backup records that have no associated file.

    Path params:
    - backup_id: str - ID of the backup record to delete
    """
    try:
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

        backup_id = req.route_params.get("backup_id")
        if not backup_id:
            return func.HttpResponse(
                json.dumps({"error": "backup_id is required"}),
                mimetype="application/json",
                status_code=400,
            )

        deleted_backup = storage_service.delete_backup_result(backup_id)

        if deleted_backup:
            logger.info(f"Backup record deleted: {backup_id}")

            # Get engine_id from database config
            engine_id = None
            try:
                db_config = db_config_service.get(deleted_backup.database_id)
                if db_config:
                    engine_id = db_config.engine_id
            except Exception:
                pass

            # Audit log - resource_name is just the database name, backup status goes in details
            audit_service.log(
                user_id=user_id,
                user_email=user_email,
                action=AuditAction.BACKUP_DELETED,
                resource_type=AuditResourceType.BACKUP,
                resource_id=backup_id,
                resource_name=deleted_backup.database_name,
                details={
                    "backup_id": backup_id,
                    "type": "record_only",
                    "database_name": deleted_backup.database_name,
                    "database_type": deleted_backup.database_type.value,
                    "engine_id": engine_id,
                    "backup_status": deleted_backup.status.value,
                },
                ip_address=get_client_ip(req),
            )

            return func.HttpResponse(
                json.dumps({
                    "message": f"Backup record '{backup_id}' deleted successfully",
                    "backup_id": backup_id,
                }),
                mimetype="application/json",
                status_code=200,
            )
        else:
            return func.HttpResponse(
                json.dumps({"error": f"Backup record '{backup_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )
    except Exception as e:
        logger.exception("Error deleting backup record")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backups/delete-bulk", methods=["POST"])
def delete_backup_files_bulk(req: func.HttpRequest) -> func.HttpResponse:
    """
    Delete multiple backup files from blob storage.

    Request body:
    {
        "blob_names": ["path/to/backup1.sql.gz", "path/to/backup2.sql.gz"]
    }
    """
    try:
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

        body = req.get_json()
        blob_names = body.get("blob_names", [])

        if not blob_names:
            return func.HttpResponse(
                json.dumps({"error": "blob_names array is required"}),
                mimetype="application/json",
                status_code=400,
            )

        if not isinstance(blob_names, list):
            return func.HttpResponse(
                json.dumps({"error": "blob_names must be an array"}),
                mimetype="application/json",
                status_code=400,
            )

        results = {
            "deleted": [],
            "not_found": [],
            "errors": [],
        }

        for blob_name in blob_names:
            try:
                deleted = storage_service.delete_backup(blob_name=blob_name)
                if deleted:
                    results["deleted"].append(blob_name)
                else:
                    results["not_found"].append(blob_name)
            except Exception as e:
                results["errors"].append({"blob_name": blob_name, "error": str(e)})

        logger.info(f"Bulk delete: {len(results['deleted'])} deleted, {len(results['not_found'])} not found, {len(results['errors'])} errors")

        # Audit log for bulk delete
        if results["deleted"]:
            audit_service.log(
                user_id=user_id,
                user_email=user_email,
                action=AuditAction.BACKUP_DELETED_BULK,
                resource_type=AuditResourceType.BACKUP,
                resource_id="bulk",
                resource_name=f"{len(results['deleted'])} backups",
                details={
                    "deleted_count": len(results["deleted"]),
                    "deleted_files": results["deleted"],
                    "not_found_count": len(results["not_found"]),
                    "error_count": len(results["errors"]),
                },
                ip_address=get_client_ip(req),
            )

        return func.HttpResponse(
            json.dumps({
                "message": f"Deleted {len(results['deleted'])} backup(s)",
                "deleted_count": len(results["deleted"]),
                "not_found_count": len(results["not_found"]),
                "error_count": len(results["errors"]),
                "results": results,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON body"}),
            mimetype="application/json",
            status_code=400,
        )
    except Exception as e:
        logger.exception("Error in bulk delete")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ===========================================
# Storage Stats Endpoints
# ===========================================


@app.route(route="storage-stats", methods=["GET"])
def get_storage_stats(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get storage statistics with breakdown by database, type, and engine.

    Returns:
    - total storage used
    - storage per database
    - storage per database type
    - storage per engine
    - backup counts
    """
    try:
        # Get all backup files
        files = storage_service.list_backups(max_results=10000)

        # Get all databases for name mapping
        databases, _ = db_config_service.get_all()
        db_map = {db.id: db for db in databases}

        # Get all engines for name mapping
        engines, _ = engine_service.get_all()
        engine_map = {e.id: e for e in engines}

        # Calculate stats
        total_size = sum(f.get("size", 0) for f in files)

        # Group by database, type, and engine
        by_database: dict = {}
        by_type: dict = {"mysql": 0, "postgresql": 0, "sqlserver": 0, "azure_sql": 0}
        by_engine: dict = {}

        for f in files:
            # Parse blob name: {db_type}/{db_id}/{filename}
            parts = f.get("name", "").split("/")
            if len(parts) >= 2:
                db_type = parts[0]
                db_id = parts[1]
                size = f.get("size", 0)

                # By type
                if db_type in by_type:
                    by_type[db_type] += size

                # Get database info
                db = db_map.get(db_id)
                engine_id = db.engine_id if db and db.engine_id else None

                # By database
                if db_id not in by_database:
                    by_database[db_id] = {
                        "database_id": db_id,
                        "database_name": db.name if db else "Unknown",
                        "database_type": db.database_type if db else db_type,
                        "engine_id": engine_id,
                        "size_bytes": 0,
                        "backup_count": 0,
                    }
                by_database[db_id]["size_bytes"] += size
                by_database[db_id]["backup_count"] += 1

                # By engine
                if engine_id:
                    if engine_id not in by_engine:
                        engine = engine_map.get(engine_id)
                        by_engine[engine_id] = {
                            "engine_id": engine_id,
                            "engine_name": engine.name if engine else "Unknown",
                            "engine_type": engine.engine_type.value if engine else db_type,
                            "size_bytes": 0,
                            "backup_count": 0,
                            "database_count": 0,
                        }
                    by_engine[engine_id]["size_bytes"] += size
                    by_engine[engine_id]["backup_count"] += 1

        # Count databases per engine
        for db_data in by_database.values():
            engine_id = db_data.get("engine_id")
            if engine_id and engine_id in by_engine:
                by_engine[engine_id]["database_count"] += 1

        # Sort by size descending
        databases_list = sorted(by_database.values(), key=lambda x: x["size_bytes"], reverse=True)
        engines_list = sorted(by_engine.values(), key=lambda x: x["size_bytes"], reverse=True)

        # Format sizes
        for db in databases_list:
            db["size_formatted"] = format_bytes(db["size_bytes"])
        for engine in engines_list:
            engine["size_formatted"] = format_bytes(engine["size_bytes"])

        return func.HttpResponse(
            json.dumps({
                "total_size_bytes": total_size,
                "total_size_formatted": format_bytes(total_size),
                "total_backup_count": len(files),
                "by_database": databases_list,
                "by_engine": engines_list,
                "by_type": {
                    "mysql": {"size_bytes": by_type["mysql"], "size_formatted": format_bytes(by_type["mysql"])},
                    "postgresql": {"size_bytes": by_type["postgresql"], "size_formatted": format_bytes(by_type["postgresql"])},
                    "sqlserver": {"size_bytes": by_type["sqlserver"], "size_formatted": format_bytes(by_type["sqlserver"])},
                    "azure_sql": {"size_bytes": by_type["azure_sql"], "size_formatted": format_bytes(by_type["azure_sql"])},
                },
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting storage stats")
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
        # Get current user for audit
        auth_result = get_current_user(req, storage_service)
        user_id = auth_result.user.id if auth_result.authenticated else "anonymous"
        user_email = auth_result.user.email if auth_result.authenticated else "anonymous"

        body = req.get_json()

        # Get current settings and update
        current = storage_service.get_settings()

        # Track changes for audit
        changes = {}
        if "dark_mode" in body and current.dark_mode != body["dark_mode"]:
            changes["dark_mode"] = {"from": current.dark_mode, "to": body["dark_mode"]}
            current.dark_mode = body["dark_mode"]
        if "default_retention_days" in body and current.default_retention_days != body["default_retention_days"]:
            changes["default_retention_days"] = {"from": current.default_retention_days, "to": body["default_retention_days"]}
            current.default_retention_days = body["default_retention_days"]
        if "default_compression" in body and current.default_compression != body["default_compression"]:
            changes["default_compression"] = {"from": current.default_compression, "to": body["default_compression"]}
            current.default_compression = body["default_compression"]
        if "access_requests_enabled" in body and current.access_requests_enabled != body["access_requests_enabled"]:
            changes["access_requests_enabled"] = {"from": current.access_requests_enabled, "to": body["access_requests_enabled"]}
            current.access_requests_enabled = body["access_requests_enabled"]

        saved = storage_service.save_settings(current)

        # Audit log
        if changes:
            audit_service.log(
                user_id=user_id,
                user_email=user_email,
                action=AuditAction.SETTINGS_UPDATED,
                resource_type=AuditResourceType.SETTINGS,
                resource_id="app-settings",
                resource_name="Application Settings",
                details={"changes": changes},
                ip_address=get_client_ip(req),
            )

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


@app.route(route="users/me/preferences", methods=["PUT"])
def update_current_user_preferences(req: func.HttpRequest) -> func.HttpResponse:
    """
    Update current user's preferences (dark_mode, page_size).

    Body:
    {
        "dark_mode": true,
        "page_size": 25
    }
    """
    try:
        auth_result = get_current_user(req, storage_service)

        if not auth_result.authenticated:
            return func.HttpResponse(
                json.dumps({"error": auth_result.error}),
                mimetype="application/json",
                status_code=401,
            )

        try:
            data = req.get_json()
        except ValueError:
            return func.HttpResponse(
                json.dumps({"error": "Invalid JSON"}),
                mimetype="application/json",
                status_code=400,
            )

        user = auth_result.user

        # Update only preference fields
        if "dark_mode" in data:
            user.dark_mode = bool(data["dark_mode"])
        if "page_size" in data:
            page_size = int(data["page_size"])
            if page_size < 10 or page_size > 100:
                return func.HttpResponse(
                    json.dumps({"error": "page_size must be between 10 and 100"}),
                    mimetype="application/json",
                    status_code=400,
                )
            user.page_size = page_size

        user.updated_at = datetime.utcnow()

        # Save to storage
        storage_service.save_user(user)

        return func.HttpResponse(
            json.dumps({
                "message": "Preferences updated",
                "user": user.model_dump(mode="json"),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error updating user preferences")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="users", methods=["GET"])
def list_users(req: func.HttpRequest) -> func.HttpResponse:
    """
    List all users (admin only).

    Query params:
    - page: Page number (default 1)
    - page_size: Results per page (default 50)
    - search: Search by email or name
    - status: Filter by status ('active', 'disabled')
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

        # Parse query params
        page = int(req.params.get("page", 1))
        page_size = int(req.params.get("page_size", 50))
        search = req.params.get("search")
        status = req.params.get("status")

        users, total_count, has_more = storage_service.get_users_paged(
            page_size=page_size,
            page=page,
            search=search,
            status=status,
        )

        # Also get pending access requests count for badge
        pending_requests_count = storage_service.get_pending_access_requests_count()

        return func.HttpResponse(
            json.dumps({
                "users": [u.model_dump(mode="json") for u in users],
                "count": len(users),
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "has_more": has_more,
                "pending_requests_count": pending_requests_count,
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
    - name: str (optional) - will be set from Azure AD on first login if not provided
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
        # Use provided name or email username as placeholder (will be updated from Azure AD on first login)
        name = body.get("name") or body["email"].split("@")[0]
        user = User(
            id=f"pending-{uuid.uuid4()}",  # Placeholder until Azure AD login
            email=body["email"],
            name=name,
            role=role,
            enabled=True,
            created_by=auth_result.user.id,
        )

        saved = storage_service.save_user(user)

        # Audit log
        audit_service.log(
            user_id=auth_result.user.id,
            user_email=auth_result.user.email,
            action=AuditAction.USER_CREATED,
            resource_type=AuditResourceType.USER,
            resource_id=saved.id,
            resource_name=saved.email,
            details={
                "role": role.value,
                "name": saved.name,
            },
            ip_address=get_client_ip(req),
        )

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

        # Track changes for audit
        changes = {}

        # Update fields
        if "name" in body:
            if user.name != body["name"]:
                changes["name"] = {"from": user.name, "to": body["name"]}
            user.name = body["name"]

        if "role" in body:
            try:
                new_role = UserRole(body["role"].lower())
                if user.role != new_role:
                    changes["role"] = {"from": user.role.value, "to": new_role.value}
                user.role = new_role
            except ValueError:
                return func.HttpResponse(
                    json.dumps({"error": f"Invalid role: {body['role']}"}),
                    mimetype="application/json",
                    status_code=400,
                )

        if "enabled" in body:
            if user.enabled != body["enabled"]:
                changes["enabled"] = {"from": user.enabled, "to": body["enabled"]}
            user.enabled = body["enabled"]

        saved = storage_service.save_user(user)

        # Audit log
        audit_service.log(
            user_id=auth_result.user.id,
            user_email=auth_result.user.email,
            action=AuditAction.USER_UPDATED,
            resource_type=AuditResourceType.USER,
            resource_id=saved.id,
            resource_name=saved.email,
            details={"changes": changes} if changes else None,
            ip_address=get_client_ip(req),
        )

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

        # Get user info before deleting (for audit)
        user_to_delete = storage_service.get_user(user_id)
        if not user_to_delete:
            return func.HttpResponse(
                json.dumps({"error": f"User '{user_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        user_email = user_to_delete.email

        deleted = storage_service.delete_user(user_id)

        if not deleted:
            return func.HttpResponse(
                json.dumps({"error": f"User '{user_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Audit log
        audit_service.log(
            user_id=auth_result.user.id,
            user_email=auth_result.user.email,
            action=AuditAction.USER_DELETED,
            resource_type=AuditResourceType.USER,
            resource_id=user_id,
            resource_name=user_email,
            details={
                "name": user_to_delete.name,
                "role": user_to_delete.role.value,
            },
            ip_address=get_client_ip(req),
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


# ==============================================================================
# Access Requests API
# ==============================================================================


@app.route(route="access-requests", methods=["GET"])
def list_access_requests(req: func.HttpRequest) -> func.HttpResponse:
    """
    List pending access requests (admin only).
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

        requests = storage_service.get_pending_access_requests()

        return func.HttpResponse(
            json.dumps({
                "requests": [
                    {
                        "id": r.id,
                        "email": r.email,
                        "name": r.name,
                        "azure_ad_id": r.azure_ad_id,
                        "status": r.status.value,
                        "requested_at": r.requested_at.isoformat(),
                    }
                    for r in requests
                ],
                "count": len(requests),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing access requests")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="access-requests/{request_id}/approve", methods=["POST"])
def approve_access_request(req: func.HttpRequest) -> func.HttpResponse:
    """
    Approve an access request (admin only).

    Body:
    - role: str (optional) - admin, operator, viewer (default: viewer)
    """
    try:
        request_id = req.route_params.get("request_id")

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

        # Get access request
        access_request = storage_service.get_access_request(request_id)
        if not access_request:
            return func.HttpResponse(
                json.dumps({"error": f"Access request '{request_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Check if already resolved
        from shared.models import AccessRequestStatus
        if access_request.status != AccessRequestStatus.PENDING:
            return func.HttpResponse(
                json.dumps({"error": "Access request has already been resolved"}),
                mimetype="application/json",
                status_code=400,
            )

        # Parse role from body
        body = {}
        try:
            body = req.get_json()
        except ValueError:
            pass

        role_str = body.get("role", "viewer").lower()
        try:
            role = UserRole(role_str)
        except ValueError:
            return func.HttpResponse(
                json.dumps({"error": f"Invalid role: {role_str}"}),
                mimetype="application/json",
                status_code=400,
            )

        # Create user from access request
        user = User(
            id=access_request.azure_ad_id,
            email=access_request.email,
            name=access_request.name,
            role=role,
            enabled=True,
            created_by=auth_result.user.id,
            last_login=datetime.utcnow(),
        )
        storage_service.save_user(user)

        # Update access request status
        access_request.status = AccessRequestStatus.APPROVED
        access_request.resolved_at = datetime.utcnow()
        access_request.resolved_by = auth_result.user.id
        storage_service.save_access_request(access_request)

        # Audit log
        audit_service.log(
            user_id=auth_result.user.id,
            user_email=auth_result.user.email,
            action=AuditAction.ACCESS_REQUEST_APPROVED,
            resource_type=AuditResourceType.ACCESS_REQUEST,
            resource_id=request_id,
            resource_name=access_request.email,
            details={"role": role.value},
            ip_address=get_client_ip(req),
        )

        return func.HttpResponse(
            json.dumps({
                "message": f"Access request approved. User '{access_request.email}' created with role '{role.value}'",
                "user": user.model_dump(mode="json"),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error approving access request")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="access-requests/{request_id}/reject", methods=["POST"])
def reject_access_request(req: func.HttpRequest) -> func.HttpResponse:
    """
    Reject an access request (admin only).

    Body:
    - reason: str (optional) - rejection reason
    """
    try:
        request_id = req.route_params.get("request_id")

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

        # Get access request
        access_request = storage_service.get_access_request(request_id)
        if not access_request:
            return func.HttpResponse(
                json.dumps({"error": f"Access request '{request_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Check if already resolved
        from shared.models import AccessRequestStatus
        if access_request.status != AccessRequestStatus.PENDING:
            return func.HttpResponse(
                json.dumps({"error": "Access request has already been resolved"}),
                mimetype="application/json",
                status_code=400,
            )

        # Parse reason from body
        body = {}
        try:
            body = req.get_json()
        except ValueError:
            pass

        reason = body.get("reason", "")

        # Update access request status
        access_request.status = AccessRequestStatus.REJECTED
        access_request.resolved_at = datetime.utcnow()
        access_request.resolved_by = auth_result.user.id
        access_request.rejection_reason = reason
        storage_service.save_access_request(access_request)

        # Audit log
        audit_service.log(
            user_id=auth_result.user.id,
            user_email=auth_result.user.email,
            action=AuditAction.ACCESS_REQUEST_REJECTED,
            resource_type=AuditResourceType.ACCESS_REQUEST,
            resource_id=request_id,
            resource_name=access_request.email,
            details={"reason": reason} if reason else None,
            ip_address=get_client_ip(req),
        )

        return func.HttpResponse(
            json.dumps({
                "message": f"Access request for '{access_request.email}' rejected",
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error rejecting access request")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ==============================================================================
# Backup Policies API
# ==============================================================================


@app.route(route="backup-policies", methods=["GET"])
def list_backup_policies(req: func.HttpRequest) -> func.HttpResponse:
    """
    List all backup policies.

    Returns system policies first, then custom policies, sorted by name.
    """
    try:
        policies = storage_service.get_all_backup_policies()

        return func.HttpResponse(
            json.dumps({
                "policies": [p.model_dump(mode="json") for p in policies],
                "count": len(policies),
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing backup policies")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backup-policies", methods=["POST"])
def create_backup_policy(req: func.HttpRequest) -> func.HttpResponse:
    """
    Create a new backup policy.

    Body:
    {
        "name": "My Policy",
        "description": "Optional description",
        "hourly": { "enabled": true, "keep_count": 24, "interval_hours": 1 },
        "daily": { "enabled": true, "keep_count": 15, "time": "02:00" },
        "weekly": { "enabled": true, "keep_count": 4, "day_of_week": 0, "time": "03:00" },
        "monthly": { "enabled": true, "keep_count": 6, "day_of_month": 1, "time": "04:00" },
        "yearly": { "enabled": true, "keep_count": 2, "month": 1, "day_of_month": 1, "time": "05:00" }
    }
    """
    try:
        body = req.get_json()

        # Validate required fields
        if not body.get("name"):
            return func.HttpResponse(
                json.dumps({"error": "Name is required"}),
                mimetype="application/json",
                status_code=400,
            )

        # Generate ID from name
        import re
        policy_id = re.sub(r'[^a-z0-9]+', '-', body["name"].lower()).strip('-')

        # Check if already exists
        existing = storage_service.get_backup_policy(policy_id)
        if existing:
            return func.HttpResponse(
                json.dumps({"error": f"Policy with ID '{policy_id}' already exists"}),
                mimetype="application/json",
                status_code=409,
            )

        # Build policy
        policy = BackupPolicy(
            id=policy_id,
            name=body["name"],
            description=body.get("description"),
            is_system=False,  # User-created policies are not system
            hourly=TierConfig(**body["hourly"]) if body.get("hourly") else TierConfig(),
            daily=TierConfig(**body["daily"]) if body.get("daily") else TierConfig(),
            weekly=TierConfig(**body["weekly"]) if body.get("weekly") else TierConfig(),
            monthly=TierConfig(**body["monthly"]) if body.get("monthly") else TierConfig(),
            yearly=TierConfig(**body["yearly"]) if body.get("yearly") else TierConfig(),
        )

        saved = storage_service.save_backup_policy(policy)

        # Audit log
        auth_result = get_current_user(req, storage_service)
        if auth_result.authenticated:
            audit_service.log(
                user_id=auth_result.user.id,
                user_email=auth_result.user.email,
                action=AuditAction.POLICY_CREATED,
                resource_type=AuditResourceType.POLICY,
                resource_id=saved.id,
                resource_name=saved.name,
                details={
                    "description": saved.description,
                    "summary": saved.get_summary(),
                },
                ip_address=get_client_ip(req),
            )

        return func.HttpResponse(
            json.dumps({
                "message": "Backup policy created",
                "policy": saved.model_dump(mode="json"),
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
        logger.exception("Error creating backup policy")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backup-policies/{policy_id}", methods=["GET"])
def get_backup_policy(req: func.HttpRequest) -> func.HttpResponse:
    """Get a specific backup policy."""
    try:
        policy_id = req.route_params.get("policy_id")
        policy = storage_service.get_backup_policy(policy_id)

        if not policy:
            return func.HttpResponse(
                json.dumps({"error": f"Policy '{policy_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Get usage count
        usage_count = storage_service.get_databases_using_policy(policy_id)

        return func.HttpResponse(
            json.dumps({
                "policy": policy.model_dump(mode="json"),
                "usage_count": usage_count,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting backup policy")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backup-policies/{policy_id}", methods=["PUT"])
def update_backup_policy(req: func.HttpRequest) -> func.HttpResponse:
    """
    Update a backup policy.

    System policies can be updated but not deleted.
    """
    try:
        policy_id = req.route_params.get("policy_id")
        body = req.get_json()

        # Get existing policy
        existing = storage_service.get_backup_policy(policy_id)
        if not existing:
            return func.HttpResponse(
                json.dumps({"error": f"Policy '{policy_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Update fields
        if "name" in body:
            existing.name = body["name"]
        if "description" in body:
            existing.description = body["description"]

        # Update tier configs
        if "hourly" in body:
            existing.hourly = TierConfig(**body["hourly"])
        if "daily" in body:
            existing.daily = TierConfig(**body["daily"])
        if "weekly" in body:
            existing.weekly = TierConfig(**body["weekly"])
        if "monthly" in body:
            existing.monthly = TierConfig(**body["monthly"])
        if "yearly" in body:
            existing.yearly = TierConfig(**body["yearly"])

        saved = storage_service.save_backup_policy(existing)

        # Audit log
        auth_result = get_current_user(req, storage_service)
        if auth_result.authenticated:
            audit_service.log(
                user_id=auth_result.user.id,
                user_email=auth_result.user.email,
                action=AuditAction.POLICY_UPDATED,
                resource_type=AuditResourceType.POLICY,
                resource_id=saved.id,
                resource_name=saved.name,
                details={
                    "updated_fields": list(body.keys()),
                    "summary": saved.get_summary(),
                },
                ip_address=get_client_ip(req),
            )

        return func.HttpResponse(
            json.dumps({
                "message": "Backup policy updated",
                "policy": saved.model_dump(mode="json"),
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
        logger.exception("Error updating backup policy")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="backup-policies/{policy_id}", methods=["DELETE"])
def delete_backup_policy(req: func.HttpRequest) -> func.HttpResponse:
    """
    Delete a backup policy.

    System policies cannot be deleted.
    Policies in use by databases cannot be deleted.
    """
    try:
        policy_id = req.route_params.get("policy_id")

        # Check if policy exists
        policy = storage_service.get_backup_policy(policy_id)
        if not policy:
            return func.HttpResponse(
                json.dumps({"error": f"Policy '{policy_id}' not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Check if it's a system policy
        if policy.is_system:
            return func.HttpResponse(
                json.dumps({"error": "System policies cannot be deleted"}),
                mimetype="application/json",
                status_code=400,
            )

        # Check if in use
        usage_count = storage_service.get_databases_using_policy(policy_id)
        if usage_count > 0:
            return func.HttpResponse(
                json.dumps({
                    "error": f"Policy is in use by {usage_count} database(s). Reassign them first."
                }),
                mimetype="application/json",
                status_code=400,
            )

        policy_name = policy.name

        deleted = storage_service.delete_backup_policy(policy_id)

        if not deleted:
            return func.HttpResponse(
                json.dumps({"error": f"Policy '{policy_id}' could not be deleted"}),
                mimetype="application/json",
                status_code=500,
            )

        # Audit log
        auth_result = get_current_user(req, storage_service)
        if auth_result.authenticated:
            audit_service.log(
                user_id=auth_result.user.id,
                user_email=auth_result.user.email,
                action=AuditAction.POLICY_DELETED,
                resource_type=AuditResourceType.POLICY,
                resource_id=policy_id,
                resource_name=policy_name,
                details={
                    "description": policy.description,
                    "summary": policy.get_summary(),
                    "is_system": policy.is_system,
                },
                ip_address=get_client_ip(req),
            )

        return func.HttpResponse(
            json.dumps({"message": f"Policy '{policy_id}' deleted"}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error deleting backup policy")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ===========================================
# Audit Log Endpoints
# ===========================================


@app.route(route="audit", methods=["GET"])
def list_audit_logs(req: func.HttpRequest) -> func.HttpResponse:
    """
    List audit logs with filters and pagination.

    Query params:
    - start_date: str - Filter from date (YYYY-MM-DD)
    - end_date: str - Filter until date (YYYY-MM-DD)
    - user_id: str - Filter by user ID
    - action: str - Filter by action type
    - resource_type: str - Filter by resource type
    - status: str - Filter by status (success/failed)
    - search: str - Search in resource_name and user_email
    - database_type: str - Filter by engine type (mysql, postgresql, sqlserver)
    - engine_id: str - Filter by engine/server ID
    - resource_name: str - Filter by alias/target name
    - limit: int - Results per page (default: 50)
    - offset: int - Skip N results (default: 0)
    """
    try:
        # Parse query params
        start_date = None
        end_date = None

        if req.params.get("start_date"):
            start_date = datetime.strptime(req.params["start_date"], "%Y-%m-%d")
        if req.params.get("end_date"):
            end_date = datetime.strptime(req.params["end_date"], "%Y-%m-%d")

        # Parse enum filters
        action = None
        if req.params.get("action"):
            try:
                action = AuditAction(req.params["action"])
            except ValueError:
                pass

        resource_type = None
        if req.params.get("resource_type"):
            try:
                resource_type = AuditResourceType(req.params["resource_type"])
            except ValueError:
                pass

        status = None
        if req.params.get("status"):
            try:
                status = AuditStatus(req.params["status"])
            except ValueError:
                pass

        user_id = req.params.get("user_id")
        search = req.params.get("search")
        database_type = req.params.get("database_type")
        engine_id = req.params.get("engine_id")
        resource_name = req.params.get("resource_name")
        limit = int(req.params.get("limit", "50"))
        offset = int(req.params.get("offset", "0"))

        # Query audit logs
        logs, total = audit_service.get_logs(
            start_date=start_date,
            end_date=end_date,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            status=status,
            search=search,
            database_type=database_type,
            engine_id=engine_id,
            resource_name=resource_name,
            limit=limit,
            offset=offset,
        )

        # Serialize logs
        logs_data = []
        for log in logs:
            log_dict = log.model_dump(mode="json")
            log_dict["action"] = log.action.value
            log_dict["resource_type"] = log.resource_type.value
            log_dict["status"] = log.status.value
            logs_data.append(log_dict)

        return func.HttpResponse(
            json.dumps({
                "logs": logs_data,
                "count": len(logs_data),
                "total": total,
                "has_more": offset + len(logs_data) < total,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing audit logs")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="audit/actions", methods=["GET"])
def list_audit_actions(req: func.HttpRequest) -> func.HttpResponse:
    """
    List available audit action types for filter dropdown.
    """
    try:
        actions = [
            {"value": action.value, "label": action.value.replace("_", " ").title()}
            for action in AuditAction
        ]
        return func.HttpResponse(
            json.dumps({"actions": actions}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing audit actions")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="audit/resource-types", methods=["GET"])
def list_audit_resource_types(req: func.HttpRequest) -> func.HttpResponse:
    """
    List available audit resource types for filter dropdown.
    """
    try:
        resource_types = [
            {"value": rt.value, "label": rt.value.replace("_", " ").title()}
            for rt in AuditResourceType
        ]
        return func.HttpResponse(
            json.dumps({"resource_types": resource_types}),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing audit resource types")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="audit/stats", methods=["GET"])
def get_audit_stats(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get audit log statistics.

    Query params:
    - start_date: str - Filter from date (YYYY-MM-DD)
    - end_date: str - Filter until date (YYYY-MM-DD)
    """
    try:
        start_date = None
        end_date = None

        if req.params.get("start_date"):
            start_date = datetime.strptime(req.params["start_date"], "%Y-%m-%d")
        if req.params.get("end_date"):
            end_date = datetime.strptime(req.params["end_date"], "%Y-%m-%d")

        stats = audit_service.get_stats(start_date=start_date, end_date=end_date)

        return func.HttpResponse(
            json.dumps(stats),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting audit stats")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


# ===========================================
# Engine Endpoints
# ===========================================


@app.route(route="engines", methods=["GET"])
def list_engines(req: func.HttpRequest) -> func.HttpResponse:
    """
    List all engine configurations.

    Query params:
    - limit: int - Maximum number of results (default: 100)
    - offset: int - Number of results to skip (default: 0)
    - search: str - Search term for name or host
    - engine_type: str - Filter by engine type (mysql, postgresql, sqlserver)
    """
    try:
        limit = int(req.params.get("limit", "100"))
        offset = int(req.params.get("offset", "0"))
        search = req.params.get("search")
        engine_type = req.params.get("engine_type")

        engines, total = engine_service.get_all(
            limit=limit,
            offset=offset,
            search=search,
            engine_type=engine_type,
        )

        # Get database counts for each engine
        engine_data = []
        for engine in engines:
            data = engine.model_dump(mode="json", exclude={"password"})
            data["database_count"] = engine_service.get_database_count(engine.id)
            engine_data.append(data)

        return func.HttpResponse(
            json.dumps({
                "items": engine_data,
                "total": total,
                "limit": limit,
                "offset": offset,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error listing engines")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines/{engine_id}", methods=["GET"])
def get_engine(req: func.HttpRequest) -> func.HttpResponse:
    """Get a specific engine configuration by ID."""
    try:
        engine_id = req.route_params.get("engine_id")
        engine = engine_service.get(engine_id)

        if not engine:
            return func.HttpResponse(
                json.dumps({"error": "Engine not found"}),
                mimetype="application/json",
                status_code=404,
            )

        data = engine.model_dump(mode="json", exclude={"password"})
        data["database_count"] = engine_service.get_database_count(engine.id)

        return func.HttpResponse(
            json.dumps(data),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error getting engine")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines", methods=["POST"])
def create_engine(req: func.HttpRequest) -> func.HttpResponse:
    """
    Create a new engine configuration.

    Request body:
    {
        "name": str,
        "engine_type": str (mysql|postgresql|sqlserver),
        "host": str,
        "port": int (optional, defaults based on type),
        "auth_method": str (optional: user_password|managed_identity|azure_ad|connection_string),
        "username": str (optional),
        "password": str (optional),
        "connection_string": str (optional),
        "discover_databases": bool (optional, default false)
    }
    """
    try:
        body = req.get_json()
        auth_result = get_current_user(req)
        user = auth_result.user if auth_result.authenticated else None

        # Validate engine type
        try:
            engine_type = EngineType(body["engine_type"])
        except (ValueError, KeyError):
            return func.HttpResponse(
                json.dumps({"error": "Invalid engine_type. Must be mysql, postgresql, or sqlserver"}),
                mimetype="application/json",
                status_code=400,
            )

        # Get default port if not provided
        port = body.get("port") or Engine.get_default_port(engine_type)

        # Parse auth method if provided
        auth_method = None
        if body.get("auth_method"):
            try:
                auth_method = AuthMethod(body["auth_method"])
            except ValueError:
                return func.HttpResponse(
                    json.dumps({"error": "Invalid auth_method"}),
                    mimetype="application/json",
                    status_code=400,
                )

        # Create engine
        engine = Engine(
            id="",
            name=body["name"],
            engine_type=engine_type,
            host=body["host"],
            port=port,
            auth_method=auth_method,
            username=body.get("username"),
            password=body.get("password"),
            connection_string=body.get("connection_string"),
            discovery_enabled=bool(body.get("username") and body.get("password")),
            created_by=user.email if user else None,
        )

        created_engine = engine_service.create(engine)

        # Log audit
        audit_service.log(
            action=AuditAction.CREATE,
            resource_type=AuditResourceType.ENGINE,
            resource_id=created_engine.id,
            resource_name=created_engine.name,
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            ip_address=get_client_ip(req),
            details={
                "engine_id": created_engine.id,
                "engine_type": engine_type.value,
                "host": body["host"],
                "port": port,
            },
        )

        response_data = {
            "engine": created_engine.model_dump(mode="json", exclude={"password"}),
        }

        # Run discovery if requested
        if body.get("discover_databases") and created_engine.has_credentials():
            try:
                discovered = engine_service.discover_databases(created_engine)
                response_data["discovered_databases"] = [d.model_dump() for d in discovered]
            except Exception as e:
                response_data["discovery_error"] = str(e)

        return func.HttpResponse(
            json.dumps(response_data),
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
        logger.exception("Error creating engine")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines/{engine_id}", methods=["PUT"])
def update_engine(req: func.HttpRequest) -> func.HttpResponse:
    """
    Update an engine configuration.

    Request body (all fields optional):
    {
        "name": str,
        "auth_method": str,
        "username": str,
        "password": str,
        "connection_string": str,
        "apply_to_all_databases": bool (if true, updates DBs with individual credentials too)
    }
    """
    try:
        engine_id = req.route_params.get("engine_id")
        body = req.get_json()
        auth_result = get_current_user(req)
        user = auth_result.user if auth_result.authenticated else None

        engine = engine_service.get(engine_id)
        if not engine:
            return func.HttpResponse(
                json.dumps({"error": "Engine not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Update fields if provided
        if "name" in body:
            engine.name = body["name"]
        if "auth_method" in body:
            engine.auth_method = AuthMethod(body["auth_method"]) if body["auth_method"] else None
        if "username" in body:
            engine.username = body["username"]
        if "password" in body:
            engine.password = body["password"]
        if "connection_string" in body:
            engine.connection_string = body["connection_string"]

        # Update discovery_enabled based on credentials
        engine.discovery_enabled = engine.has_credentials()

        updated_engine = engine_service.update(engine)

        # Log audit
        audit_service.log(
            action=AuditAction.UPDATE,
            resource_type=AuditResourceType.ENGINE,
            resource_id=engine_id,
            resource_name=updated_engine.name,
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            ip_address=get_client_ip(req),
            details={
                "engine_id": engine_id,
                "engine_type": updated_engine.engine_type.value,
                "updated_fields": list(body.keys()),
            },
        )

        response_data = {
            "engine": updated_engine.model_dump(mode="json", exclude={"password"}),
        }

        # If apply_to_all_databases, update database credentials
        if body.get("apply_to_all_databases"):
            # Get all databases for this engine
            databases, _ = db_config_service.get_all()
            updated_count = 0
            for db in databases:
                if db.engine_id == engine_id:
                    # Set to use engine credentials
                    db.use_engine_credentials = True
                    db.auth_method = None
                    db.username = None
                    db.password = None
                    db_config_service.update(db)
                    updated_count += 1
            response_data["databases_updated"] = updated_count

        return func.HttpResponse(
            json.dumps(response_data),
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
        logger.exception("Error updating engine")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines/{engine_id}", methods=["DELETE"])
def delete_engine(req: func.HttpRequest) -> func.HttpResponse:
    """
    Delete an engine configuration.

    Query params:
    - delete_databases: bool - If true, cascade delete all associated databases
    - delete_backups: bool - If true (and delete_databases=true), also delete all backup files and history records

    Note: Will fail if there are databases associated with this engine and delete_databases is not true.
    """
    try:
        engine_id = req.route_params.get("engine_id")
        auth_result = get_current_user(req)
        user = auth_result.user if auth_result.authenticated else None

        # Parse cascade options
        delete_databases = req.params.get("delete_databases", "").lower() == "true"
        delete_backups = req.params.get("delete_backups", "").lower() == "true"

        engine = engine_service.get(engine_id)
        if not engine:
            return func.HttpResponse(
                json.dumps({"error": "Engine not found"}),
                mimetype="application/json",
                status_code=404,
            )

        # Check if there are databases using this engine
        db_count = engine_service.get_database_count(engine_id)
        databases_deleted = 0
        backups_deleted = {"deleted_files": 0, "deleted_records": 0, "errors": []}

        if db_count > 0:
            if not delete_databases:
                return func.HttpResponse(
                    json.dumps({
                        "error": f"Cannot delete engine with {db_count} associated database(s). Delete databases first or use delete_databases=true."
                    }),
                    mimetype="application/json",
                    status_code=400,
                )

            # Cascade delete databases (and optionally backups)
            databases, _ = db_service.get_all(engine_id=engine_id)

            for db in databases:
                # Optionally delete backups first
                if delete_backups:
                    backup_result = storage_service.delete_all_backups_for_database(db.id)
                    backups_deleted["deleted_files"] += backup_result.get("deleted_files", 0)
                    backups_deleted["deleted_records"] += backup_result.get("deleted_records", 0)
                    backups_deleted["errors"].extend(backup_result.get("errors", []))

                # Delete database config
                db_service.delete(db.id)
                databases_deleted += 1

                # Log audit for each database deleted
                audit_service.log(
                    action=AuditAction.DELETE,
                    resource_type=AuditResourceType.DATABASE,
                    resource_id=db.id,
                    resource_name=db.name,
                    user_id=user.id if user else None,
                    user_email=user.email if user else None,
                    ip_address=get_client_ip(req),
                    details={
                        "database_type": db.database_type.value,
                        "engine_id": engine_id,
                        "host": db.host,
                        "port": db.port,
                        "database_name": db.database_name,
                        "cascade_from_engine": engine_id,
                        "backups_deleted": delete_backups,
                    },
                )

        engine_service.delete(engine_id)

        # Log audit
        audit_service.log(
            action=AuditAction.DELETE,
            resource_type=AuditResourceType.ENGINE,
            resource_id=engine_id,
            resource_name=engine.name,
            user_id=user.id if user else None,
            user_email=user.email if user else None,
            ip_address=get_client_ip(req),
            details={
                "engine_id": engine_id,
                "engine_type": engine.engine_type.value,
                "host": engine.host,
                "cascade_databases": delete_databases,
                "cascade_backups": delete_backups,
                "databases_deleted": databases_deleted if delete_databases else 0,
            },
        )

        response_data = {"deleted": True}
        if delete_databases:
            response_data["databases_deleted"] = databases_deleted
            if delete_backups:
                response_data["backups_deleted"] = backups_deleted

        return func.HttpResponse(
            json.dumps(response_data),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error deleting engine")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines/{engine_id}/test", methods=["POST"])
def test_engine_connection(req: func.HttpRequest) -> func.HttpResponse:
    """Test connection to an engine using its credentials."""
    try:
        engine_id = req.route_params.get("engine_id")

        engine = engine_service.get(engine_id)
        if not engine:
            return func.HttpResponse(
                json.dumps({"error": "Engine not found"}),
                mimetype="application/json",
                status_code=404,
            )

        if not engine.has_credentials():
            return func.HttpResponse(
                json.dumps({"error": "Engine has no credentials configured"}),
                mimetype="application/json",
                status_code=400,
            )

        # Use connection tester
        connection_tester = get_connection_tester()

        # Map EngineType to DatabaseType for testing
        db_type_map = {
            EngineType.MYSQL: DatabaseType.MYSQL,
            EngineType.POSTGRESQL: DatabaseType.POSTGRESQL,
            EngineType.SQLSERVER: DatabaseType.SQLSERVER,
        }

        result = connection_tester.test_connection(
            database_type=db_type_map[engine.engine_type],
            host=engine.host,
            port=engine.port,
            database_name="",  # Connect to server, not specific DB
            username=engine.username,
            password=engine.password,
        )

        return func.HttpResponse(
            json.dumps({
                "success": result.success,
                "message": result.message,
                "latency_ms": result.latency_ms,
            }),
            mimetype="application/json",
            status_code=200,
        )
    except Exception as e:
        logger.exception("Error testing engine connection")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines/{engine_id}/discover", methods=["POST"])
def discover_databases(req: func.HttpRequest) -> func.HttpResponse:
    """
    Discover databases available on an engine.

    Returns list of databases found on the server, indicating which ones
    already exist in the system and which are system databases.
    """
    try:
        engine_id = req.route_params.get("engine_id")

        engine = engine_service.get(engine_id)
        if not engine:
            return func.HttpResponse(
                json.dumps({"error": "Engine not found"}),
                mimetype="application/json",
                status_code=404,
            )

        discovered = engine_service.discover_databases(engine)

        return func.HttpResponse(
            json.dumps({
                "databases": [d.model_dump() for d in discovered],
                "engine_id": engine_id,
                "engine_name": engine.name,
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
        logger.exception("Error discovering databases")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )


@app.route(route="engines/{engine_id}/databases", methods=["POST"])
def add_databases_from_discovery(req: func.HttpRequest) -> func.HttpResponse:
    """
    Add multiple databases from discovery results.

    Request body:
    {
        "databases": [
            {
                "name": str,           # Database name on server
                "alias": str,          # Display name (optional, defaults to name)
                "policy_id": str       # Backup policy ID (optional)
            },
            ...
        ],
        "use_engine_credentials": bool  # Default true
    }
    """
    try:
        engine_id = req.route_params.get("engine_id")
        body = req.get_json()
        auth_result = get_current_user(req)
        user = auth_result.user if auth_result.authenticated else None

        engine = engine_service.get(engine_id)
        if not engine:
            return func.HttpResponse(
                json.dumps({"error": "Engine not found"}),
                mimetype="application/json",
                status_code=404,
            )

        use_engine_credentials = body.get("use_engine_credentials", True)
        databases_to_add = body.get("databases", [])

        if not databases_to_add:
            return func.HttpResponse(
                json.dumps({"error": "No databases specified"}),
                mimetype="application/json",
                status_code=400,
            )

        # Map EngineType to DatabaseType
        db_type_map = {
            EngineType.MYSQL: DatabaseType.MYSQL,
            EngineType.POSTGRESQL: DatabaseType.POSTGRESQL,
            EngineType.SQLSERVER: DatabaseType.SQLSERVER,
        }

        created = []
        errors = []

        for db_info in databases_to_add:
            try:
                db_config = DatabaseConfig(
                    id="",
                    name=db_info.get("alias") or db_info["name"],
                    database_type=db_type_map[engine.engine_type],
                    engine_id=engine_id,
                    use_engine_credentials=use_engine_credentials,
                    host=engine.host,
                    port=engine.port,
                    database_name=db_info["name"],
                    # If using engine credentials, don't set DB-specific ones
                    username=None if use_engine_credentials else engine.username,
                    password=None if use_engine_credentials else engine.password,
                    policy_id=db_info.get("policy_id", "production-standard"),
                    created_by=user.email if user else None,
                )

                created_db = db_config_service.create(db_config)
                created.append(created_db.model_dump(mode="json", exclude={"password"}))

                # Log audit
                audit_service.log(
                    action=AuditAction.CREATE,
                    resource_type=AuditResourceType.DATABASE,
                    resource_id=created_db.id,
                    resource_name=created_db.name,
                    user_id=user.id if user else None,
                    user_email=user.email if user else None,
                    ip_address=get_client_ip(req),
                    details={
                        "database_type": created_db.database_type.value,
                        "engine_id": engine_id,
                        "host": created_db.host,
                        "port": created_db.port,
                        "database_name": created_db.database_name,
                        "from_discovery": True,
                    },
                )

            except Exception as e:
                errors.append({"database": db_info["name"], "error": str(e)})

        return func.HttpResponse(
            json.dumps({
                "created": created,
                "errors": errors,
                "total_created": len(created),
                "total_errors": len(errors),
            }),
            mimetype="application/json",
            status_code=201 if created else 400,
        )
    except Exception as e:
        logger.exception("Error adding databases from discovery")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )
