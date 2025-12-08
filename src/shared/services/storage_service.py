"""
Azure Storage service for blob, queue, and table operations.

Provides a unified interface for all storage operations used in the backup solution.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import BinaryIO, Optional

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import BlobSasPermissions, ContentSettings, generate_blob_sas

from ..config import AzureClients, get_settings
from ..models import BackupResult, AppSettings, User, UserRole, BackupPolicy, get_default_policies

logger = logging.getLogger(__name__)


def format_bytes(size_bytes: int) -> str:
    """Format bytes into human-readable string."""
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    return f"{size:.1f} {units[i]}" if i > 0 else f"{int(size)} {units[i]}"


class StorageService:
    """
    Service for Azure Storage operations.

    Handles:
    - Blob storage (backup files)
    - Queue storage (backup jobs)
    - Table storage (backup history)
    """

    def __init__(self, azure_clients: Optional[AzureClients] = None):
        """
        Initialize storage service.

        Args:
            azure_clients: Azure clients instance. If None, creates a new one.
        """
        from ..config.azure_clients import get_azure_clients

        self._clients = azure_clients or get_azure_clients()
        self._settings = get_settings()

    # ===========================================
    # Blob Storage Operations
    # ===========================================

    def upload_backup(
        self,
        blob_name: str,
        data: BinaryIO,
        content_type: str = "application/octet-stream",
        container_name: Optional[str] = None,
    ) -> str:
        """
        Upload a backup file to blob storage.

        Args:
            blob_name: Name for the blob (e.g., "mysql/db1/2024-01-15_120000.sql.gz")
            data: File-like object containing backup data
            content_type: MIME type of the content
            container_name: Optional custom container name

        Returns:
            URL of the uploaded blob
        """
        container = container_name or self._settings.backup_container_name
        container_client = self._clients.get_blob_container_client(container)

        # Ensure container exists
        try:
            container_client.create_container()
        except ResourceExistsError:
            pass

        blob_client = container_client.get_blob_client(blob_name)

        blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
        )

        logger.info(f"Uploaded backup: {blob_name}")
        return blob_client.url

    def download_backup(
        self,
        blob_name: str,
        container_name: Optional[str] = None,
    ) -> bytes:
        """
        Download a backup file from blob storage.

        Args:
            blob_name: Name of the blob to download
            container_name: Optional custom container name

        Returns:
            Backup file contents as bytes
        """
        container = container_name or self._settings.backup_container_name
        container_client = self._clients.get_blob_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)

        return blob_client.download_blob().readall()

    def get_backup_url(
        self,
        blob_name: str,
        container_name: Optional[str] = None,
        expiry_hours: int = 24,
    ) -> str:
        """
        Generate a SAS URL for downloading a backup.

        Args:
            blob_name: Name of the blob
            container_name: Optional custom container name
            expiry_hours: Hours until the URL expires

        Returns:
            SAS URL for downloading the backup
        """
        container = container_name or self._settings.backup_container_name
        container_client = self._clients.get_blob_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)

        # Generate SAS token
        sas_token = generate_blob_sas(
            account_name=self._clients.blob_service_client.account_name,
            container_name=container,
            blob_name=blob_name,
            account_key=self._clients.blob_service_client.credential.account_key,
            permission=BlobSasPermissions(read=True),
            expiry=datetime.utcnow() + timedelta(hours=expiry_hours),
        )

        return f"{blob_client.url}?{sas_token}"

    def list_backups(
        self,
        prefix: Optional[str] = None,
        container_name: Optional[str] = None,
        max_results: int = 100,
    ) -> list[dict]:
        """
        List backup files in blob storage.

        Args:
            prefix: Filter by blob name prefix (e.g., "mysql/db1/")
            container_name: Optional custom container name
            max_results: Maximum number of results

        Returns:
            List of backup metadata dictionaries
        """
        container = container_name or self._settings.backup_container_name
        container_client = self._clients.get_blob_container_client(container)

        backups = []
        blobs = container_client.list_blobs(name_starts_with=prefix)

        for blob in blobs:
            if len(backups) >= max_results:
                break

            backups.append({
                "name": blob.name,
                "size": blob.size,
                "created_at": blob.creation_time.isoformat() if blob.creation_time else None,
                "last_modified": blob.last_modified.isoformat() if blob.last_modified else None,
                "content_type": blob.content_settings.content_type if blob.content_settings else None,
            })

        return backups

    def delete_backup(
        self,
        blob_name: str,
        container_name: Optional[str] = None,
    ) -> bool:
        """
        Delete a backup file from blob storage.

        Args:
            blob_name: Name of the blob to delete
            container_name: Optional custom container name

        Returns:
            True if deleted, False if not found
        """
        container = container_name or self._settings.backup_container_name
        container_client = self._clients.get_blob_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)

        try:
            blob_client.delete_blob()
            logger.info(f"Deleted backup: {blob_name}")
            return True
        except ResourceNotFoundError:
            logger.warning(f"Backup not found: {blob_name}")
            return False

    # ===========================================
    # Queue Storage Operations
    # ===========================================

    def send_backup_job(self, job_message: str, queue_name: Optional[str] = None) -> str:
        """
        Send a backup job to the queue.

        Args:
            job_message: JSON-serialized backup job
            queue_name: Optional custom queue name

        Returns:
            Message ID
        """
        queue = queue_name or self._settings.backup_queue_name
        queue_client = self._clients.get_queue_client(queue)

        # Ensure queue exists
        try:
            queue_client.create_queue()
        except ResourceExistsError:
            pass

        result = queue_client.send_message(job_message)
        logger.info(f"Sent backup job to queue: {result.id}")
        return result.id

    def receive_backup_jobs(
        self,
        max_messages: int = 1,
        visibility_timeout: int = 300,
        queue_name: Optional[str] = None,
    ) -> list[dict]:
        """
        Receive backup jobs from the queue.

        Args:
            max_messages: Maximum messages to receive
            visibility_timeout: Seconds to hide message from other consumers
            queue_name: Optional custom queue name

        Returns:
            List of message dictionaries
        """
        queue = queue_name or self._settings.backup_queue_name
        queue_client = self._clients.get_queue_client(queue)

        messages = queue_client.receive_messages(
            messages_per_page=max_messages,
            visibility_timeout=visibility_timeout,
        )

        return [
            {
                "id": msg.id,
                "pop_receipt": msg.pop_receipt,
                "content": msg.content,
                "dequeue_count": msg.dequeue_count,
            }
            for msg in messages
        ]

    def delete_queue_message(
        self,
        message_id: str,
        pop_receipt: str,
        queue_name: Optional[str] = None,
    ) -> None:
        """
        Delete a message from the queue after processing.

        Args:
            message_id: ID of the message
            pop_receipt: Pop receipt from receive
            queue_name: Optional custom queue name
        """
        queue = queue_name or self._settings.backup_queue_name
        queue_client = self._clients.get_queue_client(queue)
        queue_client.delete_message(message_id, pop_receipt)
        logger.info(f"Deleted queue message: {message_id}")

    # ===========================================
    # Table Storage Operations (Backup History)
    # ===========================================

    def save_backup_result(self, result: BackupResult) -> None:
        """
        Save a backup result to table storage.

        Args:
            result: BackupResult instance to save
        """
        table_client = self._clients.get_table_client(
            self._settings.history_table_name
        )

        # Ensure table exists
        try:
            self._clients.table_service_client.create_table(
                self._settings.history_table_name
            )
        except ResourceExistsError:
            pass

        entity = result.to_table_entity()
        table_client.upsert_entity(entity)
        logger.info(f"Saved backup result: {result.id}")

    def delete_backup_result(self, backup_id: str) -> Optional[BackupResult]:
        """
        Delete a backup result record from table storage by ID.

        This searches for the record since we don't have the exact PartitionKey/RowKey.

        Args:
            backup_id: The backup result ID to delete

        Returns:
            The deleted BackupResult if found and deleted, None if not found
        """
        table_client = self._clients.get_table_client(
            self._settings.history_table_name
        )

        try:
            # Search for the entity by ID - check both RowKey formats
            # New format: RowKey contains the ID after underscore (inverted_ticks_id)
            # Legacy format: RowKey is just the ID
            entities = table_client.query_entities(
                query_filter=f"RowKey ge '{backup_id}' and RowKey lt '{backup_id}z'"
            )

            for entity in entities:
                row_key = entity["RowKey"]
                # Check if this entity matches our backup_id
                if row_key == backup_id or row_key.endswith(f"_{backup_id}"):
                    # Parse the backup result before deleting
                    backup_result = BackupResult.from_table_entity(entity)
                    table_client.delete_entity(
                        partition_key=entity["PartitionKey"],
                        row_key=entity["RowKey"]
                    )
                    logger.info(f"Deleted backup result record: {backup_id}")
                    return backup_result

            # Also try searching with inverted timestamp format
            entities = table_client.query_entities(query_filter=None)
            for entity in entities:
                row_key = entity["RowKey"]
                if row_key == backup_id or row_key.endswith(f"_{backup_id}"):
                    # Parse the backup result before deleting
                    backup_result = BackupResult.from_table_entity(entity)
                    table_client.delete_entity(
                        partition_key=entity["PartitionKey"],
                        row_key=entity["RowKey"]
                    )
                    logger.info(f"Deleted backup result record: {backup_id}")
                    return backup_result

            logger.warning(f"Backup result not found for deletion: {backup_id}")
            return None

        except Exception as e:
            logger.exception(f"Error deleting backup result {backup_id}: {e}")
            raise

    def get_backup_history(
        self,
        database_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[BackupResult]:
        """
        Get backup history from table storage (loads all, use get_backup_history_paged for efficiency).

        Args:
            database_id: Filter by database ID
            start_date: Filter from this date
            end_date: Filter until this date
            limit: Maximum results

        Returns:
            List of BackupResult instances
        """
        table_client = self._clients.get_table_client(
            self._settings.history_table_name
        )

        # Build filter
        filters = []
        if database_id:
            filters.append(f"database_id eq '{database_id}'")
        if start_date:
            filters.append(f"PartitionKey ge '{start_date.strftime('%Y-%m-%d')}'")
        if end_date:
            filters.append(f"PartitionKey le '{end_date.strftime('%Y-%m-%d')}'")

        filter_str = " and ".join(filters) if filters else None

        results = []
        logger.info(f"Querying backup history with filter: {filter_str}")

        try:
            # Note: Don't use select=["*"] as it returns empty entities in azure-data-tables SDK
            entities = list(table_client.query_entities(query_filter=filter_str))
            logger.info(f"Found {len(entities)} entities in backup history table")
        except Exception as e:
            logger.error(f"Error querying backup history table: {e}")
            entities = []

        for entity in entities:
            if len(results) >= limit:
                break
            try:
                backup = BackupResult.from_table_entity(entity)
                # Apply precise datetime filtering (PartitionKey is date-only)
                if start_date and backup.created_at < start_date:
                    continue
                if end_date and backup.created_at > end_date:
                    continue
                results.append(backup)
            except (KeyError, ValueError) as e:
                logger.warning(f"Skipping malformed backup entity: {e}")
                logger.debug(f"Entity keys: {list(entity.keys())}")

        # Sort by created_at descending
        results.sort(key=lambda x: x.created_at, reverse=True)
        return results

    def get_backup_history_paged(
        self,
        page_size: int = 25,
        page: int = 1,
        database_id: Optional[str] = None,
        database_ids: Optional[list[str]] = None,
        status: Optional[str] = None,
        triggered_by: Optional[str] = None,
        database_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> tuple[list[BackupResult], int, bool]:
        """
        Get backup history with offset-based pagination.

        Fetches all matching records, sorts by date descending, then returns
        the requested page. This ensures correct ordering across partition boundaries.

        Args:
            page_size: Number of results per page (default 25)
            page: Page number (1-based, default 1)
            database_id: Filter by a single database ID
            database_ids: Filter by multiple database IDs (e.g., for engine filter)
            status: Filter by backup status (completed, failed, in_progress)
            triggered_by: Filter by trigger type (manual, scheduler)
            database_type: Filter by database type (mysql, postgresql, sqlserver)
            start_date: Filter from this date
            end_date: Filter until this date

        Returns:
            Tuple of (list of BackupResult for requested page, total count, has_more)
        """
        table_client = self._clients.get_table_client(
            self._settings.history_table_name
        )

        # Build filter
        filters = []
        if database_id:
            filters.append(f"database_id eq '{database_id}'")
        if status:
            filters.append(f"status eq '{status}'")
        if triggered_by:
            filters.append(f"triggered_by eq '{triggered_by}'")
        if database_type:
            filters.append(f"database_type eq '{database_type}'")
        if start_date:
            filters.append(f"PartitionKey ge '{start_date.strftime('%Y-%m-%d')}'")
        if end_date:
            filters.append(f"PartitionKey le '{end_date.strftime('%Y-%m-%d')}'")

        filter_str = " and ".join(filters) if filters else None

        logger.info(f"Querying backup history with filter: {filter_str}, page: {page}, page_size: {page_size}")

        all_results = []

        try:
            # Query all matching entities
            entities = table_client.query_entities(query_filter=filter_str)

            for entity in entities:
                try:
                    backup = BackupResult.from_table_entity(entity)
                    # If database_ids is provided, filter to only those databases
                    if database_ids and backup.database_id not in database_ids:
                        continue
                    all_results.append(backup)
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed backup entity: {e}")

            # Sort by created_at descending (most recent first)
            all_results.sort(key=lambda x: x.created_at, reverse=True)

            # Calculate pagination
            total_count = len(all_results)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            page_results = all_results[start_idx:end_idx]
            has_more = end_idx < total_count

            logger.info(f"Returned {len(page_results)} of {total_count} results, has_more: {has_more}")

            return page_results, total_count, has_more

        except Exception as e:
            logger.error(f"Error querying backup history table: {e}")
            return [], 0, False

    def get_backup_result(self, result_id: str, date: datetime) -> Optional[BackupResult]:
        """
        Get a specific backup result.

        Args:
            result_id: ID of the backup result
            date: Date of the backup (used as partition key)

        Returns:
            BackupResult instance or None if not found
        """
        table_client = self._clients.get_table_client(
            self._settings.history_table_name
        )

        try:
            entity = table_client.get_entity(
                partition_key=date.strftime("%Y-%m-%d"),
                row_key=result_id,
            )
            return BackupResult.from_table_entity(entity)
        except ResourceNotFoundError:
            return None

    def get_backup_alerts(
        self,
        consecutive_failures: int = 2,
    ) -> list[dict]:
        """
        Get databases with consecutive backup failures.

        Checks the most recent N backups for each database and identifies
        databases where the last N backups all failed.

        Args:
            consecutive_failures: Number of consecutive failures to trigger alert (default: 2)

        Returns:
            List of alert dictionaries containing database info and failure details
        """
        table_client = self._clients.get_table_client(
            self._settings.history_table_name
        )

        try:
            # Get recent backups (sorted by date desc)
            all_backups: list[BackupResult] = []
            entities = table_client.query_entities(query_filter=None)

            for entity in entities:
                try:
                    all_backups.append(BackupResult.from_table_entity(entity))
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed backup entity: {e}")

            # Sort by created_at descending
            all_backups.sort(key=lambda x: x.created_at, reverse=True)

            # Group backups by database_id
            backups_by_db: dict[str, list[BackupResult]] = {}
            for backup in all_backups:
                if backup.database_id not in backups_by_db:
                    backups_by_db[backup.database_id] = []
                backups_by_db[backup.database_id].append(backup)

            alerts = []

            for db_id, db_backups in backups_by_db.items():
                # Check if last N backups are all failures
                recent = db_backups[:consecutive_failures]
                if len(recent) >= consecutive_failures:
                    all_failed = all(b.status.value == "failed" for b in recent)
                    if all_failed:
                        last_failure = recent[0]
                        alerts.append({
                            "database_id": db_id,
                            "database_name": last_failure.database_name,
                            "database_type": last_failure.database_type.value,
                            "consecutive_failures": len(recent),
                            "last_failure_at": last_failure.created_at.isoformat(),
                            "last_error": last_failure.error_message,
                        })

            # Sort by last_failure_at descending
            alerts.sort(key=lambda x: x["last_failure_at"], reverse=True)

            logger.info(f"Found {len(alerts)} databases with consecutive failures")
            return alerts

        except Exception as e:
            logger.error(f"Error getting backup alerts: {e}")
            return []

    def get_backup_stats_for_database(self, database_id: str) -> dict:
        """
        Get backup statistics for a specific database.

        Args:
            database_id: ID of the database

        Returns:
            Dict with count, total_size_bytes, and formatted size
        """
        # Get all backups for this database from history table
        backups = self.get_backup_history(database_id=database_id, limit=10000)

        total_size = sum(b.file_size_bytes or 0 for b in backups)

        return {
            "count": len(backups),
            "total_size_bytes": total_size,
            "total_size_formatted": format_bytes(total_size),
        }

    def delete_all_backups_for_database(self, database_id: str) -> dict:
        """
        Delete all backups (blobs and history records) for a specific database.

        Args:
            database_id: ID of the database

        Returns:
            Dict with deleted_files, deleted_records, and any errors
        """
        deleted_files = 0
        deleted_records = 0
        errors = []

        # Get all backup records for this database
        backups = self.get_backup_history(database_id=database_id, limit=10000)

        for backup in backups:
            # Delete the blob file if it exists
            if backup.blob_name:
                try:
                    if self.delete_backup(backup.blob_name):
                        deleted_files += 1
                except Exception as e:
                    errors.append(f"Failed to delete blob {backup.blob_name}: {e}")

            # Delete the history record
            try:
                table_client = self._clients.get_table_client(
                    self._settings.history_table_name
                )
                # The entity uses date as PartitionKey and inverted_ticks_id as RowKey
                partition_key = backup.created_at.strftime("%Y-%m-%d")
                # Try to find and delete the entity
                filter_str = f"PartitionKey eq '{partition_key}' and database_id eq '{database_id}'"
                entities = list(table_client.query_entities(query_filter=filter_str))
                for entity in entities:
                    if entity.get("id") == backup.id or entity["RowKey"].endswith(f"_{backup.id}"):
                        table_client.delete_entity(
                            partition_key=entity["PartitionKey"],
                            row_key=entity["RowKey"]
                        )
                        deleted_records += 1
                        break
            except Exception as e:
                errors.append(f"Failed to delete record {backup.id}: {e}")

        logger.info(f"Deleted {deleted_files} files and {deleted_records} records for database {database_id}")

        return {
            "deleted_files": deleted_files,
            "deleted_records": deleted_records,
            "errors": errors,
        }

    # ===========================================
    # Settings Operations
    # ===========================================

    def get_settings(self) -> AppSettings:
        """
        Get application settings from table storage.

        Returns default settings if none exist.

        Returns:
            AppSettings instance
        """
        table_name = "settings"
        table_client = self._clients.get_table_client(table_name)

        # Ensure table exists
        try:
            self._clients.table_service_client.create_table(table_name)
        except ResourceExistsError:
            pass

        try:
            entity = table_client.get_entity(
                partition_key="settings",
                row_key="app",
            )
            return AppSettings.from_table_entity(entity)
        except ResourceNotFoundError:
            # Return default settings
            return AppSettings()

    def save_settings(self, settings: AppSettings) -> AppSettings:
        """
        Save application settings to table storage.

        Args:
            settings: AppSettings instance to save

        Returns:
            Saved AppSettings instance
        """
        from datetime import datetime

        table_name = "settings"
        table_client = self._clients.get_table_client(table_name)

        # Ensure table exists
        try:
            self._clients.table_service_client.create_table(table_name)
        except ResourceExistsError:
            pass

        # Update timestamp
        settings.updated_at = datetime.utcnow()

        entity = settings.to_table_entity()
        table_client.upsert_entity(entity)
        logger.info("Saved application settings")

        return settings

    # ===========================================
    # User Operations
    # ===========================================

    def _get_users_table(self):
        """Get or create users table."""
        table_name = "users"
        table_client = self._clients.get_table_client(table_name)

        try:
            self._clients.table_service_client.create_table(table_name)
        except ResourceExistsError:
            pass

        return table_client

    def get_user(self, user_id: str) -> Optional[User]:
        """
        Get a user by their Azure AD Object ID.

        Args:
            user_id: Azure AD Object ID

        Returns:
            User instance or None if not found
        """
        table_client = self._get_users_table()

        try:
            entity = table_client.get_entity(
                partition_key="users",
                row_key=user_id,
            )
            return User.from_table_entity(entity)
        except ResourceNotFoundError:
            return None

    def get_user_by_email(self, email: str) -> Optional[User]:
        """
        Get a user by their email address.

        Args:
            email: User email

        Returns:
            User instance or None if not found
        """
        table_client = self._get_users_table()

        try:
            entities = table_client.query_entities(
                query_filter=f"email eq '{email}'"
            )
            for entity in entities:
                return User.from_table_entity(entity)
            return None
        except Exception as e:
            logger.error(f"Error querying user by email: {e}")
            return None

    def get_all_users(self) -> list[User]:
        """
        Get all users.

        Returns:
            List of User instances
        """
        table_client = self._get_users_table()

        users = []
        try:
            entities = table_client.query_entities(
                query_filter="PartitionKey eq 'users'"
            )
            for entity in entities:
                try:
                    users.append(User.from_table_entity(entity))
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed user entity: {e}")
        except Exception as e:
            logger.error(f"Error listing users: {e}")

        return users

    def get_user_count(self) -> int:
        """
        Get total number of users.

        Returns:
            Number of users
        """
        return len(self.get_all_users())

    def has_any_users(self) -> bool:
        """
        Check if any users exist (for first-run setup).

        Returns:
            True if at least one user exists
        """
        table_client = self._get_users_table()

        try:
            entities = table_client.query_entities(
                query_filter="PartitionKey eq 'users'",
            )
            for _ in entities:
                return True
            return False
        except Exception:
            return False

    def save_user(self, user: User) -> User:
        """
        Save or update a user.

        Args:
            user: User instance to save

        Returns:
            Saved User instance
        """
        table_client = self._get_users_table()

        user.updated_at = datetime.utcnow()
        entity = user.to_table_entity()
        table_client.upsert_entity(entity)
        logger.info(f"Saved user: {user.email} (role: {user.role.value})")

        return user

    def create_first_admin(self, user_id: str, email: str, name: str) -> User:
        """
        Create the first admin user (only works if no users exist).

        Args:
            user_id: Azure AD Object ID
            email: User email
            name: Display name

        Returns:
            Created admin User

        Raises:
            ValueError: If users already exist
        """
        if self.has_any_users():
            raise ValueError("Cannot create first admin: users already exist")

        user = User(
            id=user_id,
            email=email,
            name=name,
            role=UserRole.ADMIN,
            enabled=True,
            created_at=datetime.utcnow(),
            last_login=datetime.utcnow(),
        )

        return self.save_user(user)

    def delete_user(self, user_id: str) -> bool:
        """
        Delete a user.

        Args:
            user_id: Azure AD Object ID

        Returns:
            True if deleted, False if not found
        """
        table_client = self._get_users_table()

        try:
            table_client.delete_entity(
                partition_key="users",
                row_key=user_id,
            )
            logger.info(f"Deleted user: {user_id}")
            return True
        except ResourceNotFoundError:
            return False

    def update_last_login(self, user_id: str) -> Optional[User]:
        """
        Update user's last login timestamp.

        Args:
            user_id: Azure AD Object ID

        Returns:
            Updated User or None if not found
        """
        user = self.get_user(user_id)
        if user:
            user.last_login = datetime.utcnow()
            return self.save_user(user)
        return None

    def get_users_paged(
        self,
        page_size: int = 50,
        page: int = 1,
        search: Optional[str] = None,
        status: Optional[str] = None,  # 'active', 'disabled', or None for all
    ) -> tuple[list[User], int, bool]:
        """
        Get users with pagination and filtering.

        Args:
            page_size: Number of results per page (default 50)
            page: Page number (1-based, default 1)
            search: Search by email (case-insensitive contains)
            status: Filter by status ('active', 'disabled', or None for all)

        Returns:
            Tuple of (list of Users for requested page, total count, has_more)
        """
        table_client = self._get_users_table()

        # Get all users first (Azure Table doesn't support complex queries well)
        all_users = []
        try:
            entities = table_client.query_entities(
                query_filter="PartitionKey eq 'users'"
            )
            for entity in entities:
                try:
                    all_users.append(User.from_table_entity(entity))
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed user entity: {e}")
        except Exception as e:
            logger.error(f"Error listing users: {e}")

        # Apply filters in memory
        filtered_users = all_users

        if search:
            search_lower = search.lower()
            filtered_users = [
                u for u in filtered_users
                if search_lower in u.email.lower() or search_lower in u.name.lower()
            ]

        if status == 'active':
            filtered_users = [u for u in filtered_users if u.enabled]
        elif status == 'disabled':
            filtered_users = [u for u in filtered_users if not u.enabled]

        # Sort by email
        filtered_users.sort(key=lambda u: u.email.lower())

        # Paginate
        total_count = len(filtered_users)
        offset = (page - 1) * page_size
        page_users = filtered_users[offset:offset + page_size]
        has_more = offset + len(page_users) < total_count

        return page_users, total_count, has_more

    # ===========================================
    # Access Request Operations
    # ===========================================

    def _get_access_requests_table(self):
        """Get or create access_requests table."""
        table_name = "accessrequests"
        table_client = self._clients.get_table_client(table_name)

        try:
            self._clients.table_service_client.create_table(table_name)
        except ResourceExistsError:
            pass

        return table_client

    def save_access_request(self, request: "AccessRequest") -> "AccessRequest":
        """
        Save an access request.

        Args:
            request: AccessRequest instance to save

        Returns:
            Saved AccessRequest instance
        """
        from ..models import AccessRequest

        table_client = self._get_access_requests_table()

        entity = request.to_table_entity()
        table_client.upsert_entity(entity)
        logger.info(f"Saved access request: {request.email} (status: {request.status.value})")

        return request

    def get_access_request(self, request_id: str) -> Optional["AccessRequest"]:
        """
        Get an access request by ID.

        Args:
            request_id: Request ID

        Returns:
            AccessRequest instance or None if not found
        """
        from ..models import AccessRequest

        table_client = self._get_access_requests_table()

        try:
            entity = table_client.get_entity(
                partition_key="access_requests",
                row_key=request_id,
            )
            return AccessRequest.from_table_entity(entity)
        except ResourceNotFoundError:
            return None

    def get_access_request_by_email(self, email: str) -> Optional["AccessRequest"]:
        """
        Get a pending access request by email.

        Args:
            email: User email

        Returns:
            AccessRequest instance or None if not found
        """
        from ..models import AccessRequest, AccessRequestStatus

        table_client = self._get_access_requests_table()

        try:
            entities = table_client.query_entities(
                query_filter=f"email eq '{email}' and status eq 'pending'"
            )
            for entity in entities:
                return AccessRequest.from_table_entity(entity)
            return None
        except Exception as e:
            logger.error(f"Error querying access request by email: {e}")
            return None

    def get_pending_access_requests(self) -> list["AccessRequest"]:
        """
        Get all pending access requests.

        Returns:
            List of pending AccessRequest instances
        """
        from ..models import AccessRequest

        table_client = self._get_access_requests_table()

        requests = []
        try:
            entities = table_client.query_entities(
                query_filter="status eq 'pending'"
            )
            for entity in entities:
                try:
                    requests.append(AccessRequest.from_table_entity(entity))
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed access request entity: {e}")
        except Exception as e:
            logger.error(f"Error listing pending access requests: {e}")

        # Sort by requested_at descending (newest first)
        requests.sort(key=lambda r: r.requested_at, reverse=True)
        return requests

    def get_pending_access_requests_count(self) -> int:
        """
        Get count of pending access requests.

        Returns:
            Number of pending requests
        """
        return len(self.get_pending_access_requests())

    def delete_access_request(self, request_id: str) -> bool:
        """
        Delete an access request.

        Args:
            request_id: Request ID

        Returns:
            True if deleted, False if not found
        """
        table_client = self._get_access_requests_table()

        try:
            table_client.delete_entity(
                partition_key="access_requests",
                row_key=request_id,
            )
            logger.info(f"Deleted access request: {request_id}")
            return True
        except ResourceNotFoundError:
            return False

    # ===========================================
    # Backup Policy Operations
    # ===========================================

    def _get_policies_table(self):
        """Get or create backup_policies table."""
        table_name = "backuppolicies"
        table_client = self._clients.get_table_client(table_name)

        try:
            self._clients.table_service_client.create_table(table_name)
        except ResourceExistsError:
            pass

        return table_client

    def seed_default_policies(self) -> list[BackupPolicy]:
        """
        Seed the default backup policies if they don't exist.

        Returns:
            List of seeded/existing policies
        """
        table_client = self._get_policies_table()
        seeded = []

        for policy in get_default_policies():
            try:
                # Check if exists
                table_client.get_entity(
                    partition_key="backup_policy",
                    row_key=policy.id,
                )
                logger.debug(f"Policy already exists: {policy.id}")
            except ResourceNotFoundError:
                # Create it
                entity = policy.to_table_entity()
                table_client.upsert_entity(entity)
                logger.info(f"Seeded default policy: {policy.id}")
            seeded.append(policy)

        return seeded

    def get_backup_policy(self, policy_id: str) -> Optional[BackupPolicy]:
        """
        Get a backup policy by ID.

        Args:
            policy_id: Policy ID

        Returns:
            BackupPolicy instance or None if not found
        """
        table_client = self._get_policies_table()

        try:
            entity = table_client.get_entity(
                partition_key="backup_policy",
                row_key=policy_id,
            )
            return BackupPolicy.from_table_entity(entity)
        except ResourceNotFoundError:
            return None

    def get_all_backup_policies(self) -> list[BackupPolicy]:
        """
        Get all backup policies.

        Returns:
            List of BackupPolicy instances
        """
        table_client = self._get_policies_table()

        # Ensure defaults exist
        self.seed_default_policies()

        policies = []
        try:
            entities = table_client.query_entities(
                query_filter="PartitionKey eq 'backup_policy'"
            )
            for entity in entities:
                try:
                    policies.append(BackupPolicy.from_table_entity(entity))
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed policy entity: {e}")
        except Exception as e:
            logger.error(f"Error listing policies: {e}")

        # Sort: system policies first, then by name
        policies.sort(key=lambda p: (not p.is_system, p.name.lower()))
        return policies

    def save_backup_policy(self, policy: BackupPolicy) -> BackupPolicy:
        """
        Save or update a backup policy.

        Args:
            policy: BackupPolicy instance to save

        Returns:
            Saved BackupPolicy instance
        """
        table_client = self._get_policies_table()

        policy.updated_at = datetime.utcnow()
        entity = policy.to_table_entity()
        table_client.upsert_entity(entity)
        logger.info(f"Saved backup policy: {policy.name} ({policy.id})")

        return policy

    def delete_backup_policy(self, policy_id: str) -> bool:
        """
        Delete a backup policy.

        System policies cannot be deleted.

        Args:
            policy_id: Policy ID

        Returns:
            True if deleted, False if not found or is system policy
        """
        # Check if it's a system policy
        policy = self.get_backup_policy(policy_id)
        if policy and policy.is_system:
            logger.warning(f"Cannot delete system policy: {policy_id}")
            return False

        table_client = self._get_policies_table()

        try:
            table_client.delete_entity(
                partition_key="backup_policy",
                row_key=policy_id,
            )
            logger.info(f"Deleted backup policy: {policy_id}")
            return True
        except ResourceNotFoundError:
            return False

    def get_databases_using_policy(self, policy_id: str) -> int:
        """
        Count how many databases are using a specific policy.

        Args:
            policy_id: Policy ID

        Returns:
            Number of databases using this policy
        """
        table_client = self._clients.get_table_client(
            self._settings.config_table_name
        )

        count = 0
        try:
            entities = table_client.query_entities(
                query_filter=f"PartitionKey eq 'database' and policy_id eq '{policy_id}'"
            )
            for _ in entities:
                count += 1
        except Exception as e:
            logger.error(f"Error counting databases for policy: {e}")

        return count
