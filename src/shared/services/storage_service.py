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
from ..models import BackupResult

logger = logging.getLogger(__name__)


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

    def get_backup_history(
        self,
        database_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[BackupResult]:
        """
        Get backup history from table storage.

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
        entities = table_client.query_entities(
            query_filter=filter_str,
            select=["*"],
        )

        for entity in entities:
            if len(results) >= limit:
                break
            results.append(BackupResult.from_table_entity(entity))

        # Sort by created_at descending
        results.sort(key=lambda x: x.created_at, reverse=True)
        return results

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
