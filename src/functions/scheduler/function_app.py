"""
Dilux Database Backup - Scheduler Function App

Timer triggers for scheduling backup jobs:
- DynamicScheduler: Runs every 15 minutes, checks which databases need backup
- HealthCheck: Runs every 6 hours, monitors system health
"""

import json
import logging
import sys
from datetime import datetime
from pathlib import Path

import azure.functions as func
from croniter import croniter

# Add shared package to path
shared_path = Path(__file__).parent.parent.parent / "shared"
if str(shared_path) not in sys.path:
    sys.path.insert(0, str(shared_path))

from shared.config import get_settings
from shared.models import DatabaseConfig, BackupJob
from shared.services import StorageService, DatabaseConfigService

# Initialize Function App
app = func.FunctionApp()

# Initialize services
settings = get_settings()
storage_service = StorageService()
db_config_service = DatabaseConfigService()

logger = logging.getLogger(__name__)


def should_backup_now(schedule: str, last_backup: datetime = None) -> bool:
    """
    Check if a database should be backed up based on its cron schedule.

    Args:
        schedule: Cron expression for the backup schedule
        last_backup: Timestamp of the last backup (if any)

    Returns:
        True if backup should run now
    """
    try:
        now = datetime.utcnow()

        # Create croniter from schedule
        cron = croniter(schedule, now)

        # Get the previous scheduled time
        prev_scheduled = cron.get_prev(datetime)

        # If no last backup, should backup if we're past a scheduled time
        if last_backup is None:
            return True

        # Should backup if last backup was before the previous scheduled time
        return last_backup < prev_scheduled

    except Exception as e:
        logger.error(f"Error parsing cron schedule '{schedule}': {e}")
        return False


@app.timer_trigger(
    schedule="0 */15 * * * *",  # Every 15 minutes
    arg_name="timer",
    run_on_startup=False,
)
def dynamic_scheduler(timer: func.TimerRequest) -> None:
    """
    Dynamic scheduler that checks all databases and queues backups as needed.

    Runs every 15 minutes and evaluates each database's cron schedule
    to determine if a backup should be triggered.
    """
    logger.info("Dynamic scheduler triggered")

    if timer.past_due:
        logger.warning("Timer is past due, running anyway")

    try:
        # Get all enabled databases
        databases = db_config_service.get_all(enabled_only=True)
        logger.info(f"Found {len(databases)} enabled databases")

        jobs_queued = 0

        for db_config in databases:
            try:
                # Get last backup for this database
                history = storage_service.get_backup_history(
                    database_id=db_config.id,
                    limit=1,
                )
                last_backup = history[0].completed_at if history else None

                # Check if backup should run
                if should_backup_now(db_config.schedule, last_backup):
                    logger.info(
                        f"Queuing backup for database: {db_config.name} "
                        f"(schedule: {db_config.schedule})"
                    )

                    # Create backup job
                    job = BackupJob(
                        database_id=db_config.id,
                        database_name=db_config.name,
                        database_type=db_config.database_type,
                        host=db_config.host,
                        port=db_config.port,
                        target_database=db_config.database_name,
                        username=db_config.username,
                        password_secret_name=db_config.password_secret_name,
                        compression=db_config.compression,
                        backup_destination=db_config.backup_destination,
                        triggered_by="scheduler",
                        scheduled_at=datetime.utcnow(),
                    )

                    # Send to queue
                    storage_service.send_backup_job(job.to_queue_message())
                    jobs_queued += 1
                else:
                    logger.debug(
                        f"Skipping database {db_config.name}, "
                        f"not scheduled for backup yet"
                    )

            except Exception as e:
                logger.error(
                    f"Error processing database {db_config.name}: {e}",
                    exc_info=True,
                )

        logger.info(f"Scheduler completed. Queued {jobs_queued} backup jobs")

    except Exception as e:
        logger.error(f"Scheduler failed: {e}", exc_info=True)
        raise


@app.timer_trigger(
    schedule="0 0 2 * * *",  # Daily at 2 AM UTC
    arg_name="timer",
    run_on_startup=False,
)
def cleanup_old_backups(timer: func.TimerRequest) -> None:
    """
    Cleanup timer that deletes backups older than their retention period.

    Runs daily at 2 AM UTC and:
    1. Gets all database configurations with their retention_days
    2. For each database, lists backups and deletes those beyond retention
    3. Also cleans up backup history entries for deleted files
    """
    logger.info("Cleanup old backups triggered")

    if timer.past_due:
        logger.warning("Cleanup timer is past due, running anyway")

    try:
        from datetime import timedelta

        # Get all database configurations
        databases, _ = db_config_service.get_all()
        logger.info(f"Found {len(databases)} databases to check for cleanup")

        total_deleted = 0
        total_errors = 0

        for db_config in databases:
            try:
                retention_days = db_config.retention_days or 30
                cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

                # Build prefix for this database's backups
                db_type = db_config.database_type.value
                prefix = f"{db_type}/{db_config.id}/"

                # List all backups for this database
                backups = storage_service.list_backups(prefix=prefix, max_results=1000)
                logger.debug(f"Found {len(backups)} backups for database {db_config.name}")

                for backup in backups:
                    # Parse last_modified date
                    last_modified_str = backup.get("last_modified")
                    if not last_modified_str:
                        continue

                    try:
                        # Parse ISO format datetime
                        if last_modified_str.endswith("Z"):
                            last_modified_str = last_modified_str[:-1] + "+00:00"
                        last_modified = datetime.fromisoformat(last_modified_str.replace("+00:00", ""))

                        if last_modified < cutoff_date:
                            blob_name = backup["name"]
                            logger.info(
                                f"Deleting old backup: {blob_name} "
                                f"(age: {(datetime.utcnow() - last_modified).days} days, "
                                f"retention: {retention_days} days)"
                            )
                            if storage_service.delete_backup(blob_name):
                                total_deleted += 1
                    except (ValueError, KeyError) as e:
                        logger.warning(f"Could not parse date for backup {backup.get('name')}: {e}")

            except Exception as e:
                logger.error(f"Error processing cleanup for database {db_config.name}: {e}")
                total_errors += 1

        logger.info(
            f"Cleanup completed. Deleted {total_deleted} old backups. "
            f"Errors: {total_errors}"
        )

    except Exception as e:
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        raise


@app.timer_trigger(
    schedule="0 0 */6 * * *",  # Every 6 hours
    arg_name="timer",
    run_on_startup=False,
)
def health_monitor(timer: func.TimerRequest) -> None:
    """
    Health monitor that checks system components.

    Runs every 6 hours and verifies:
    - Azure Storage connectivity
    - Database configurations are valid
    - Recent backup success rate
    """
    logger.info("Health monitor triggered")

    health_status = {
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {},
    }

    # Check Azure Storage
    try:
        # Try to list containers
        containers = list(
            storage_service._clients.blob_service_client.list_containers(max_results=1)
        )
        health_status["checks"]["azure_storage"] = {
            "status": "healthy",
            "message": "Connected successfully",
        }
    except Exception as e:
        health_status["checks"]["azure_storage"] = {
            "status": "unhealthy",
            "message": str(e),
        }
        logger.error(f"Azure Storage health check failed: {e}")

    # Check database configs
    try:
        configs = db_config_service.get_all()
        enabled_count = len([c for c in configs if c.enabled])
        health_status["checks"]["database_configs"] = {
            "status": "healthy",
            "total_databases": len(configs),
            "enabled_databases": enabled_count,
        }
    except Exception as e:
        health_status["checks"]["database_configs"] = {
            "status": "unhealthy",
            "message": str(e),
        }
        logger.error(f"Database configs health check failed: {e}")

    # Check recent backup success rate
    try:
        from datetime import timedelta

        recent_backups = storage_service.get_backup_history(
            start_date=datetime.utcnow() - timedelta(days=1),
            limit=100,
        )

        if recent_backups:
            completed = len([b for b in recent_backups if b.status.value == "completed"])
            failed = len([b for b in recent_backups if b.status.value == "failed"])
            total = len(recent_backups)
            success_rate = (completed / total * 100) if total > 0 else 0

            health_status["checks"]["backup_success_rate"] = {
                "status": "healthy" if success_rate >= 90 else "warning",
                "success_rate": f"{success_rate:.1f}%",
                "completed": completed,
                "failed": failed,
                "total": total,
            }
        else:
            health_status["checks"]["backup_success_rate"] = {
                "status": "unknown",
                "message": "No recent backups found",
            }
    except Exception as e:
        health_status["checks"]["backup_success_rate"] = {
            "status": "unhealthy",
            "message": str(e),
        }
        logger.error(f"Backup success rate check failed: {e}")

    # Log overall health status
    all_healthy = all(
        check.get("status") in ("healthy", "unknown")
        for check in health_status["checks"].values()
    )

    if all_healthy:
        logger.info(f"Health check passed: {json.dumps(health_status)}")
    else:
        logger.warning(f"Health check issues found: {json.dumps(health_status)}")
