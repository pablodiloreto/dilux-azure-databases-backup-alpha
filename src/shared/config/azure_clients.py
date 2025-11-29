"""
Azure client factory for creating and managing Azure SDK clients.

Provides lazy initialization of Azure clients to avoid unnecessary connections.
"""

from functools import cached_property
from typing import Optional

from azure.data.tables import TableServiceClient
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient
from azure.storage.queue import QueueServiceClient

from .settings import Settings, get_settings


class AzureClients:
    """
    Factory class for Azure SDK clients.

    Provides lazy-loaded, cached clients for:
    - Blob Storage
    - Queue Storage
    - Table Storage
    - Key Vault (optional)
    """

    def __init__(self, settings: Optional[Settings] = None):
        """
        Initialize Azure clients factory.

        Args:
            settings: Application settings. If None, loads from environment.
        """
        self._settings = settings or get_settings()
        self._credential: Optional[DefaultAzureCredential] = None

    @property
    def settings(self) -> Settings:
        """Get settings instance."""
        return self._settings

    @cached_property
    def credential(self) -> DefaultAzureCredential:
        """
        Get Azure credential for authentication.

        Uses DefaultAzureCredential which tries multiple auth methods:
        - Environment variables
        - Managed Identity
        - Azure CLI
        - etc.
        """
        return DefaultAzureCredential()

    @cached_property
    def blob_service_client(self) -> BlobServiceClient:
        """
        Get Blob Storage service client.

        For local development with Azurite, uses connection string.
        For production, can use managed identity.
        """
        return BlobServiceClient.from_connection_string(
            self._settings.storage_connection_string
        )

    @cached_property
    def queue_service_client(self) -> QueueServiceClient:
        """
        Get Queue Storage service client.

        For local development with Azurite, uses connection string.
        """
        return QueueServiceClient.from_connection_string(
            self._settings.storage_connection_string
        )

    @cached_property
    def table_service_client(self) -> TableServiceClient:
        """
        Get Table Storage service client.

        For local development with Azurite, uses connection string.
        """
        return TableServiceClient.from_connection_string(
            self._settings.storage_connection_string
        )

    def get_blob_container_client(self, container_name: Optional[str] = None):
        """
        Get a container client for blob operations.

        Args:
            container_name: Name of the container. Defaults to backup container.

        Returns:
            ContainerClient instance.
        """
        name = container_name or self._settings.backup_container_name
        return self.blob_service_client.get_container_client(name)

    def get_queue_client(self, queue_name: Optional[str] = None):
        """
        Get a queue client for queue operations.

        Args:
            queue_name: Name of the queue. Defaults to backup queue.

        Returns:
            QueueClient instance.
        """
        name = queue_name or self._settings.backup_queue_name
        return self.queue_service_client.get_queue_client(name)

    def get_table_client(self, table_name: str):
        """
        Get a table client for table operations.

        Args:
            table_name: Name of the table.

        Returns:
            TableClient instance.
        """
        return self.table_service_client.get_table_client(table_name)

    async def ensure_resources_exist(self) -> None:
        """
        Ensure all required Azure resources exist.

        Creates containers, queues, and tables if they don't exist.
        Should be called during application startup.
        """
        # Create backup container
        container_client = self.get_blob_container_client()
        try:
            container_client.create_container()
        except Exception:
            pass  # Container already exists

        # Create backup queue
        queue_client = self.get_queue_client()
        try:
            queue_client.create_queue()
        except Exception:
            pass  # Queue already exists

        # Create tables
        for table_name in [
            self._settings.history_table_name,
            self._settings.config_table_name,
        ]:
            try:
                self.table_service_client.create_table(table_name)
            except Exception:
                pass  # Table already exists


# Global instance for convenience
_azure_clients: Optional[AzureClients] = None


def get_azure_clients() -> AzureClients:
    """Get or create global Azure clients instance."""
    global _azure_clients
    if _azure_clients is None:
        _azure_clients = AzureClients()
    return _azure_clients
