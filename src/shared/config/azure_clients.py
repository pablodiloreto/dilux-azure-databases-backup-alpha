"""
Azure client factory for creating and managing Azure SDK clients.

Provides lazy initialization of Azure clients to avoid unnecessary connections.
Supports both Managed Identity (production) and connection string (local dev) authentication.
"""

import logging
from functools import cached_property
from typing import Optional

from azure.data.tables import TableServiceClient
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from azure.storage.blob import BlobServiceClient
from azure.storage.queue import QueueServiceClient

from .settings import Settings, get_settings

logger = logging.getLogger(__name__)


class AzureClients:
    """
    Factory class for Azure SDK clients.

    Provides lazy-loaded, cached clients for:
    - Blob Storage
    - Queue Storage
    - Table Storage
    - Key Vault (optional)

    Authentication:
    - Production: Uses Managed Identity via DefaultAzureCredential
    - Development: Uses connection string (Azurite)
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

    @property
    def use_managed_identity(self) -> bool:
        """Check if using Managed Identity for authentication."""
        return self._settings.use_managed_identity_for_storage

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

        For production with Managed Identity, uses endpoint URL + credential.
        For local development with Azurite, uses connection string.
        """
        if self.use_managed_identity:
            logger.info("Using Managed Identity for Blob Storage")
            return BlobServiceClient(
                account_url=self._settings.storage_blob_endpoint,
                credential=self.credential
            )
        else:
            logger.info("Using connection string for Blob Storage")
            return BlobServiceClient.from_connection_string(
                self._settings.storage_connection_string
            )

    @cached_property
    def queue_service_client(self) -> QueueServiceClient:
        """
        Get Queue Storage service client.

        For production with Managed Identity, uses endpoint URL + credential.
        For local development with Azurite, uses connection string.
        """
        if self.use_managed_identity:
            logger.info("Using Managed Identity for Queue Storage")
            return QueueServiceClient(
                account_url=self._settings.storage_queue_endpoint,
                credential=self.credential
            )
        else:
            logger.info("Using connection string for Queue Storage")
            return QueueServiceClient.from_connection_string(
                self._settings.storage_connection_string
            )

    @cached_property
    def table_service_client(self) -> TableServiceClient:
        """
        Get Table Storage service client.

        For production with Managed Identity, uses endpoint URL + credential.
        For local development with Azurite, uses connection string.
        """
        if self.use_managed_identity:
            logger.info("Using Managed Identity for Table Storage")
            return TableServiceClient(
                endpoint=self._settings.storage_table_endpoint,
                credential=self.credential
            )
        else:
            logger.info("Using connection string for Table Storage")
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

    @cached_property
    def secret_client(self) -> Optional[SecretClient]:
        """
        Get Key Vault SecretClient (production only).

        Returns None if Key Vault is not configured.
        """
        if not self._settings.key_vault_url:
            return None
        logger.info(f"Creating SecretClient for {self._settings.key_vault_url}")
        return SecretClient(
            vault_url=self._settings.key_vault_url,
            credential=self.credential
        )

    def get_secret(self, secret_name: str) -> Optional[str]:
        """
        Get secret from Key Vault.

        Args:
            secret_name: Name of the secret to retrieve.

        Returns:
            Secret value or None if not found or Key Vault not configured.
        """
        if not self.secret_client:
            return None
        try:
            secret = self.secret_client.get_secret(secret_name)
            return secret.value
        except Exception as e:
            logger.warning(f"Failed to get secret '{secret_name}': {e}")
            return None

    def set_secret(self, secret_name: str, value: str) -> bool:
        """
        Set secret in Key Vault.

        Args:
            secret_name: Name of the secret.
            value: Secret value.

        Returns:
            True if successful, False otherwise.
        """
        if not self.secret_client:
            return False
        try:
            self.secret_client.set_secret(secret_name, value)
            logger.info(f"Saved secret '{secret_name}' to Key Vault")
            return True
        except Exception as e:
            logger.error(f"Failed to set secret '{secret_name}': {e}")
            return False

    def delete_secret(self, secret_name: str) -> bool:
        """
        Delete secret from Key Vault.

        Args:
            secret_name: Name of the secret to delete.

        Returns:
            True if deletion was initiated, False otherwise.
        """
        if not self.secret_client:
            return False
        try:
            self.secret_client.begin_delete_secret(secret_name)
            logger.info(f"Initiated deletion of secret '{secret_name}'")
            return True
        except Exception as e:
            logger.warning(f"Failed to delete secret '{secret_name}': {e}")
            return False

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
