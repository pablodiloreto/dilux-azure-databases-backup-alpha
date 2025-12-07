"""
Dilux Database Backup - Processor Function App

Queue triggers for processing backup jobs:
- BackupProcessor: Processes backup jobs from the queue
- CleanupOldBackups: Daily cleanup of expired backups
"""

import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

import azure.functions as func

# Add shared package to path
shared_path = Path(__file__).parent.parent.parent / "shared"
if str(shared_path) not in sys.path:
    sys.path.insert(0, str(shared_path))

from shared.config import get_settings
from shared.models import BackupJob, BackupResult, BackupStatus, DatabaseType
from shared.services import StorageService, DatabaseConfigService

from backup_engines import get_backup_engine

# Initialize Function App
app = func.FunctionApp()

# Initialize services
settings = get_settings()
storage_service = StorageService()
db_config_service = DatabaseConfigService()

logger = logging.getLogger(__name__)


@app.queue_trigger(
    arg_name="msg",
    queue_name="backup-jobs",
    connection="STORAGE_CONNECTION_STRING",
)
def backup_processor(msg: func.QueueMessage) -> None:
    """
    Process backup jobs from the queue.

    Receives a backup job message, executes the backup using the appropriate
    engine, and stores the result.
    """
    logger.info(f"Processing backup job: {msg.id}")

    # Parse the job
    try:
        msg_body = msg.get_body().decode("utf-8")
        job = BackupJob.from_queue_message(msg_body)

        # Extract tier from message if present (added by scheduler)
        msg_data = json.loads(msg_body)
        tier = msg_data.get("tier")  # hourly, daily, weekly, monthly, yearly
    except Exception as e:
        logger.error(f"Failed to parse backup job: {e}")
        return

    # Create result record with tier
    result = BackupResult(
        job_id=job.id,
        database_id=job.database_id,
        database_name=job.database_name,
        database_type=job.database_type,
        triggered_by=job.triggered_by,
        tier=tier,  # Store the tier for retention management
    )

    try:
        # Mark as started
        result.mark_started()
        storage_service.save_backup_result(result)

        logger.info(
            f"Starting backup for {job.database_name} "
            f"({job.database_type.value}) on {job.host}:{job.port}"
        )

        # Get the appropriate backup engine
        engine = get_backup_engine(job.database_type)

        # Get password from config or Key Vault
        password = None
        config = db_config_service.get(job.database_id)
        if config:
            password = config.password
            # TODO: Implement Key Vault password retrieval
            # if config.password_secret_name:
            #     password = keyvault_service.get_secret(config.password_secret_name)

        if not password:
            raise ValueError("No password available for database")

        # Execute the backup
        backup_data, file_format = engine.execute_backup(
            host=job.host,
            port=job.port,
            database=job.database_name_target,
            username=job.username,
            password=password,
            compress=job.compression,
        )

        # Generate blob name
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        blob_name = (
            f"{job.database_type.value}/"
            f"{job.database_id}/"
            f"{timestamp}.{file_format}"
        )

        # Upload to blob storage
        container = job.backup_destination or settings.backup_container_name
        blob_url = storage_service.upload_backup(
            blob_name=blob_name,
            data=backup_data,
            container_name=container,
        )

        # Get file size
        file_size = len(backup_data.getvalue()) if hasattr(backup_data, "getvalue") else 0

        # Mark as completed
        result.mark_completed(
            blob_name=blob_name,
            blob_url=blob_url,
            file_size_bytes=file_size,
            file_format=file_format,
        )

        logger.info(
            f"Backup completed for {job.database_name}: "
            f"{blob_name} ({file_size} bytes)"
        )

    except Exception as e:
        logger.error(f"Backup failed for {job.database_name}: {e}", exc_info=True)
        result.mark_failed(
            error_message=str(e),
            error_details=str(e.__class__.__name__),
        )
        result.retry_count = msg.dequeue_count

    finally:
        # Save final result
        storage_service.save_backup_result(result)


@app.timer_trigger(
    schedule="0 0 2 * * *",  # Daily at 2:00 AM UTC
    arg_name="timer",
    run_on_startup=False,
)
def cleanup_old_backups(timer: func.TimerRequest) -> None:
    """
    Clean up expired backup files based on retention policies.

    Runs daily and removes backup files older than their retention period.
    """
    logger.info("Starting backup cleanup")

    try:
        # Get all database configs to know retention policies
        configs = db_config_service.get_all()

        # Build a map of database_id -> retention_days
        retention_map = {
            config.id: config.retention_days
            for config in configs
        }

        # Default retention
        default_retention = settings.backup_retention_days

        # List all backups
        all_backups = storage_service.list_backups(max_results=1000)
        now = datetime.utcnow()

        deleted_count = 0
        total_size_freed = 0

        for backup in all_backups:
            try:
                # Parse blob name to get database_id
                # Format: {db_type}/{database_id}/{timestamp}.{format}
                parts = backup["name"].split("/")
                if len(parts) >= 2:
                    database_id = parts[1]
                    retention_days = retention_map.get(database_id, default_retention)
                else:
                    retention_days = default_retention

                # Check if backup is expired
                if backup["created_at"]:
                    created_at = datetime.fromisoformat(
                        backup["created_at"].replace("Z", "+00:00")
                    ).replace(tzinfo=None)

                    age_days = (now - created_at).days

                    if age_days > retention_days:
                        logger.info(
                            f"Deleting expired backup: {backup['name']} "
                            f"(age: {age_days} days, retention: {retention_days} days)"
                        )

                        storage_service.delete_backup(backup["name"])
                        deleted_count += 1
                        total_size_freed += backup.get("size", 0)

            except Exception as e:
                logger.error(f"Error processing backup {backup['name']}: {e}")

        logger.info(
            f"Cleanup completed. Deleted {deleted_count} backups, "
            f"freed {total_size_freed / 1024 / 1024:.2f} MB"
        )

    except Exception as e:
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        raise
