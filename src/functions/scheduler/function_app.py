"""
Dilux Database Backup - Scheduler Function App

Timer triggers for scheduling backup jobs:
- DynamicScheduler: Runs every 15 minutes, checks which databases need backup based on policies
- CleanupOldBackups: Runs daily at 2 AM, applies tiered retention per policy
- HealthCheck: Runs every 6 hours, monitors system health
"""

import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import azure.functions as func

# Add shared package to path
# In development: src/functions/scheduler/function_app.py -> src/shared (3 levels up)
# In production:  function_app.py + shared/ in same directory (1 level up = same dir)
dev_shared_path = Path(__file__).parent.parent.parent / "shared"
prod_shared_path = Path(__file__).parent / "shared"

if prod_shared_path.exists():
    shared_path = prod_shared_path
elif dev_shared_path.exists():
    shared_path = dev_shared_path
else:
    shared_path = dev_shared_path  # Fallback for imports to fail with clear error

if str(shared_path.parent) not in sys.path:
    sys.path.insert(0, str(shared_path.parent))

from shared.config import get_settings
from shared.models import DatabaseConfig, BackupJob, BackupPolicy, BackupTier
from shared.services import StorageService, DatabaseConfigService, EngineService

# Initialize Function App
app = func.FunctionApp()

# Initialize services
settings = get_settings()
storage_service = StorageService()
db_config_service = DatabaseConfigService()
engine_service = EngineService()

logger = logging.getLogger(__name__)


# =============================================================================
# Timezone Utilities
# =============================================================================


def ensure_naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Ensure datetime is naive (no timezone info) and in UTC.

    Handles both timezone-aware and naive datetimes consistently.
    Returns None if input is None.
    """
    if dt is None:
        return None

    # If datetime is timezone-aware, convert to UTC and make naive
    if dt.tzinfo is not None:
        # Convert to UTC if needed
        utc_dt = dt.utctimetuple()
        return datetime(
            utc_dt.tm_year, utc_dt.tm_mon, utc_dt.tm_mday,
            utc_dt.tm_hour, utc_dt.tm_min, utc_dt.tm_sec
        )

    # Already naive, assume it's UTC
    return dt


# =============================================================================
# Tier Schedule Evaluation
# =============================================================================


def should_run_tier(
    tier: str,
    tier_config: dict,
    last_backup_at: Optional[datetime],
    now: datetime,
) -> bool:
    """
    Check if a specific tier should run a backup now.

    Args:
        tier: Tier name (hourly, daily, weekly, monthly, yearly)
        tier_config: Tier configuration with schedule settings
        last_backup_at: Last backup timestamp for this tier
        now: Current datetime

    Returns:
        True if backup should run for this tier
    """
    if not tier_config.get("enabled"):
        return False

    # Ensure consistent naive UTC datetimes
    now = ensure_naive_utc(now)
    last_backup_at = ensure_naive_utc(last_backup_at)

    # If never backed up for this tier, should backup
    if last_backup_at is None:
        return True

    if tier == "hourly":
        # Check if enough hours have passed
        interval_hours = tier_config.get("interval_hours", 1)
        hours_since = (now - last_backup_at).total_seconds() / 3600
        return hours_since >= interval_hours

    elif tier == "daily":
        # Check if it's the scheduled time and hasn't run today
        scheduled_time = tier_config.get("time", "02:00")
        hour, minute = map(int, scheduled_time.split(":"))

        # Create today's scheduled datetime
        today_scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        # If we're past today's scheduled time and last backup was before it
        if now >= today_scheduled and last_backup_at < today_scheduled:
            return True

        return False

    elif tier == "weekly":
        # Check if it's the scheduled day and time
        scheduled_day = tier_config.get("day_of_week", 0)  # 0 = Sunday
        scheduled_time = tier_config.get("time", "03:00")
        hour, minute = map(int, scheduled_time.split(":"))

        # Python weekday: 0=Monday, but we use 0=Sunday
        # Convert: Python Monday(0) -> our Tuesday(2), Python Sunday(6) -> our Sunday(0)
        current_day = (now.weekday() + 1) % 7

        if current_day != scheduled_day:
            return False

        today_scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if now >= today_scheduled and last_backup_at < today_scheduled:
            return True

        return False

    elif tier == "monthly":
        # Check if it's the scheduled day of month and time
        scheduled_day = tier_config.get("day_of_month", 1)
        scheduled_time = tier_config.get("time", "04:00")
        hour, minute = map(int, scheduled_time.split(":"))

        if now.day != scheduled_day:
            return False

        today_scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if now >= today_scheduled and last_backup_at < today_scheduled:
            return True

        return False

    elif tier == "yearly":
        # Check if it's the scheduled month, day and time
        scheduled_month = tier_config.get("month", 1)
        scheduled_day = tier_config.get("day_of_month", 1)
        scheduled_time = tier_config.get("time", "05:00")
        hour, minute = map(int, scheduled_time.split(":"))

        if now.month != scheduled_month or now.day != scheduled_day:
            return False

        today_scheduled = now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if now >= today_scheduled and last_backup_at < today_scheduled:
            return True

        return False

    return False


def get_last_backup_for_tier(
    database_id: str,
    tier: str,
    storage: StorageService,
) -> Optional[datetime]:
    """
    Get the last successful backup timestamp for a specific tier.

    Args:
        database_id: Database ID
        tier: Tier name
        storage: Storage service instance

    Returns:
        Datetime of last backup for this tier, or None
    """
    try:
        # Get recent backups for this database
        history = storage.get_backup_history(
            database_id=database_id,
            limit=100,
        )

        # Find most recent completed backup for this tier
        for backup in history:
            if backup.status.value == "completed":
                # Check if tier matches (or if tier is None, it's a legacy backup)
                if backup.tier == tier or (backup.tier is None and tier == "daily"):
                    return backup.completed_at

        return None

    except Exception as e:
        logger.error(f"Error getting last backup for tier: {e}")
        return None


# =============================================================================
# Scheduler Function
# =============================================================================


@app.timer_trigger(
    schedule="0 */15 * * * *",  # Every 15 minutes
    arg_name="timer",
    run_on_startup=False,
)
def dynamic_scheduler(timer: func.TimerRequest) -> None:
    """
    Dynamic scheduler that checks all databases and queues backups as needed.

    Runs every 15 minutes and evaluates each database's backup policy
    to determine if any tier needs to run a backup.
    """
    logger.info("Dynamic scheduler triggered")

    if timer.past_due:
        logger.warning("Timer is past due, running anyway")

    try:
        now = datetime.utcnow()

        # Get all enabled databases
        databases, _ = db_config_service.get_all(enabled_only=True)
        logger.info(f"Found {len(databases)} enabled databases")

        # Cache policies to avoid repeated lookups
        policy_cache: dict[str, BackupPolicy] = {}

        jobs_queued = 0

        # Cache engines for policy inheritance lookup
        engine_cache: dict[str, any] = {}

        for db_config in databases:
            try:
                # Resolve policy_id - check if using engine's policy
                policy_id = None

                if db_config.use_engine_policy and db_config.engine_id:
                    # Get engine's policy
                    if db_config.engine_id not in engine_cache:
                        engine = engine_service.get(db_config.engine_id)
                        engine_cache[db_config.engine_id] = engine

                    engine = engine_cache.get(db_config.engine_id)
                    if engine and engine.policy_id:
                        policy_id = engine.policy_id
                        logger.debug(
                            f"Database {db_config.name} using engine policy: {policy_id}"
                        )

                # Fallback to database's own policy or default
                if not policy_id:
                    policy_id = db_config.policy_id or "production-standard"

                if policy_id not in policy_cache:
                    policy = storage_service.get_backup_policy(policy_id)
                    if policy:
                        policy_cache[policy_id] = policy
                    else:
                        logger.warning(
                            f"Policy '{policy_id}' not found for database {db_config.name}, "
                            f"using default"
                        )
                        # Fetch and cache default policy under its correct key
                        if "production-standard" not in policy_cache:
                            default_policy = storage_service.get_backup_policy("production-standard")
                            if default_policy:
                                policy_cache["production-standard"] = default_policy
                        # Use default policy for this database
                        policy_id = "production-standard"

                policy = policy_cache.get(policy_id)
                if not policy:
                    logger.error(f"No policy available for database {db_config.name}")
                    continue

                # Check each tier
                tiers_to_check = ["hourly", "daily", "weekly", "monthly", "yearly"]

                for tier_name in tiers_to_check:
                    tier_config = getattr(policy, tier_name)

                    if not tier_config or not tier_config.enabled:
                        continue

                    # Get last backup for this tier
                    last_backup = get_last_backup_for_tier(
                        db_config.id, tier_name, storage_service
                    )

                    # Convert TierConfig to dict for evaluation
                    tier_dict = tier_config.model_dump()

                    if should_run_tier(tier_name, tier_dict, last_backup, now):
                        logger.info(
                            f"Queuing {tier_name} backup for database: {db_config.name}"
                        )

                        # Get username - from engine if using engine credentials
                        username = db_config.username
                        password_secret_name = db_config.password_secret_name

                        if db_config.use_engine_credentials and db_config.engine_id:
                            engine = engine_service.get(db_config.engine_id)
                            if engine and engine.username:
                                username = engine.username
                                password_secret_name = f"engine-{engine.id}"
                            else:
                                logger.error(
                                    f"Database {db_config.name} uses engine credentials but "
                                    f"engine {db_config.engine_id} not found or has no username"
                                )
                                continue

                        if not username:
                            logger.error(
                                f"No username configured for database {db_config.name}"
                            )
                            continue

                        # Create backup job with tier info
                        job = BackupJob(
                            database_id=db_config.id,
                            database_name=db_config.name,
                            database_type=db_config.database_type,
                            host=db_config.host,
                            port=db_config.port,
                            target_database=db_config.database_name,
                            username=username,
                            password_secret_name=password_secret_name,
                            compression=db_config.compression,
                            backup_destination=db_config.backup_destination,
                            triggered_by="scheduler",
                            tier=tier_name,  # Include tier directly in the job
                            scheduled_at=now,
                        )

                        # Send to queue
                        storage_service.send_backup_job(job.to_queue_message())
                        jobs_queued += 1

                        # Only queue one tier per database per run
                        # (prevents multiple backups at same time)
                        break

            except Exception as e:
                logger.error(
                    f"Error processing database {db_config.name}: {e}",
                    exc_info=True,
                )

        logger.info(f"Scheduler completed. Queued {jobs_queued} backup jobs")

    except Exception as e:
        logger.error(f"Scheduler failed: {e}", exc_info=True)
        raise


# =============================================================================
# Cleanup Function (Tiered Retention)
# =============================================================================


@app.timer_trigger(
    schedule="0 0 2 * * *",  # Daily at 2 AM UTC
    arg_name="timer",
    run_on_startup=False,
)
def cleanup_old_backups(timer: func.TimerRequest) -> None:
    """
    Cleanup timer that applies tiered retention based on backup policies.

    For each database:
    1. Get its backup policy
    2. Group backups by tier
    3. Keep only the configured number of backups per tier
    4. Delete excess backups (oldest first)
    """
    logger.info("Cleanup old backups triggered")

    if timer.past_due:
        logger.warning("Cleanup timer is past due, running anyway")

    try:
        # Get all database configurations
        databases, _ = db_config_service.get_all()
        logger.info(f"Found {len(databases)} databases to check for cleanup")

        # Cache policies and engines
        policy_cache: dict[str, BackupPolicy] = {}
        engine_cache: dict[str, any] = {}

        total_deleted = 0
        total_errors = 0

        for db_config in databases:
            try:
                # Resolve policy_id - check if using engine's policy
                policy_id = None

                if db_config.use_engine_policy and db_config.engine_id:
                    # Get engine's policy
                    if db_config.engine_id not in engine_cache:
                        engine = engine_service.get(db_config.engine_id)
                        engine_cache[db_config.engine_id] = engine

                    engine = engine_cache.get(db_config.engine_id)
                    if engine and engine.policy_id:
                        policy_id = engine.policy_id

                # Fallback to database's own policy or default
                if not policy_id:
                    policy_id = db_config.policy_id or "production-standard"

                if policy_id not in policy_cache:
                    policy = storage_service.get_backup_policy(policy_id)
                    if policy:
                        policy_cache[policy_id] = policy
                    else:
                        # Fetch and cache default policy under its correct key
                        if "production-standard" not in policy_cache:
                            default_policy = storage_service.get_backup_policy("production-standard")
                            if default_policy:
                                policy_cache["production-standard"] = default_policy
                        # Use default policy for this database
                        policy_id = "production-standard"

                policy = policy_cache.get(policy_id)
                if not policy:
                    continue

                # Get all backups for this database
                all_backups = storage_service.get_backup_history(
                    database_id=db_config.id,
                    limit=10000,
                )

                if not all_backups:
                    continue

                # Group backups by tier
                backups_by_tier: dict[str, list] = {
                    "hourly": [],
                    "daily": [],
                    "weekly": [],
                    "monthly": [],
                    "yearly": [],
                    "unknown": [],  # Legacy backups without tier
                }

                for backup in all_backups:
                    if backup.status.value != "completed":
                        continue

                    tier = backup.tier or "unknown"
                    if tier in backups_by_tier:
                        backups_by_tier[tier].append(backup)
                    else:
                        backups_by_tier["unknown"].append(backup)

                # Apply retention limits per tier
                tiers_config = {
                    "hourly": policy.hourly,
                    "daily": policy.daily,
                    "weekly": policy.weekly,
                    "monthly": policy.monthly,
                    "yearly": policy.yearly,
                }

                for tier_name, tier_config in tiers_config.items():
                    if not tier_config or not tier_config.enabled:
                        continue

                    keep_count = tier_config.keep_count
                    tier_backups = backups_by_tier[tier_name]

                    # Sort by created_at descending (newest first)
                    tier_backups.sort(key=lambda x: x.created_at, reverse=True)

                    # Delete excess backups
                    for backup in tier_backups[keep_count:]:
                        if backup.blob_name:
                            logger.info(
                                f"Deleting {tier_name} backup: {backup.blob_name} "
                                f"(database: {db_config.name}, keeping {keep_count})"
                            )
                            if storage_service.delete_backup(backup.blob_name):
                                total_deleted += 1

                # Handle legacy backups without tier - apply daily retention as fallback
                legacy_backups = backups_by_tier["unknown"]
                if legacy_backups and policy.daily and policy.daily.enabled:
                    keep_count = policy.daily.keep_count
                    legacy_backups.sort(key=lambda x: x.created_at, reverse=True)

                    for backup in legacy_backups[keep_count:]:
                        if backup.blob_name:
                            logger.info(
                                f"Deleting legacy backup: {backup.blob_name} "
                                f"(database: {db_config.name})"
                            )
                            if storage_service.delete_backup(backup.blob_name):
                                total_deleted += 1

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


# =============================================================================
# Health Monitor
# =============================================================================


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
        configs, total = db_config_service.get_all()
        enabled_count = len([c for c in configs if c.enabled])
        health_status["checks"]["database_configs"] = {
            "status": "healthy",
            "total_databases": total,
            "enabled_databases": enabled_count,
        }
    except Exception as e:
        health_status["checks"]["database_configs"] = {
            "status": "unhealthy",
            "message": str(e),
        }
        logger.error(f"Database configs health check failed: {e}")

    # Check backup policies
    try:
        policies = storage_service.get_all_backup_policies()
        health_status["checks"]["backup_policies"] = {
            "status": "healthy",
            "total_policies": len(policies),
        }
    except Exception as e:
        health_status["checks"]["backup_policies"] = {
            "status": "unhealthy",
            "message": str(e),
        }
        logger.error(f"Backup policies health check failed: {e}")

    # Check recent backup success rate
    try:
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
