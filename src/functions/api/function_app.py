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
from shared.models import DatabaseConfig, DatabaseType, BackupJob, BackupStatus
from shared.services import StorageService, DatabaseConfigService
from shared.exceptions import NotFoundError, ValidationError

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
    """
    try:
        enabled_only = req.params.get("enabled_only", "false").lower() == "true"
        db_type = req.params.get("type")

        if db_type:
            configs = db_config_service.get_by_type(DatabaseType(db_type))
        else:
            configs = db_config_service.get_all(enabled_only=enabled_only)

        return func.HttpResponse(
            json.dumps({
                "databases": [config.model_dump(exclude={"password"}) for config in configs],
                "count": len(configs),
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
                "database": created.model_dump(exclude={"password"}),
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
            json.dumps({"database": config.model_dump(exclude={"password"})}),
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
                "database": updated.model_dump(exclude={"password"}),
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
    List backup history.

    Query params:
    - database_id: str - Filter by database ID
    - start_date: str - Filter from date (YYYY-MM-DD)
    - end_date: str - Filter until date (YYYY-MM-DD)
    - limit: int - Maximum results (default 100)
    """
    try:
        database_id = req.params.get("database_id")
        start_date_str = req.params.get("start_date")
        end_date_str = req.params.get("end_date")
        limit = int(req.params.get("limit", "100"))

        start_date = datetime.fromisoformat(start_date_str) if start_date_str else None
        end_date = datetime.fromisoformat(end_date_str) if end_date_str else None

        results = storage_service.get_backup_history(
            database_id=database_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )

        return func.HttpResponse(
            json.dumps({
                "backups": [result.model_dump() for result in results],
                "count": len(results),
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
