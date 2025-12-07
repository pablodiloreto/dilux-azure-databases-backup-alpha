"""
Database configuration service.

Manages CRUD operations for database configurations stored in Azure Table Storage.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError

from ..config import AzureClients, get_settings
from ..models import DatabaseConfig, DatabaseType

logger = logging.getLogger(__name__)


class DatabaseConfigService:
    """
    Service for managing database configurations.

    Provides CRUD operations for database configurations stored in Azure Table Storage.
    """

    def __init__(self, azure_clients: Optional[AzureClients] = None):
        """
        Initialize database config service.

        Args:
            azure_clients: Azure clients instance. If None, creates a new one.
        """
        from ..config.azure_clients import get_azure_clients

        self._clients = azure_clients or get_azure_clients()
        self._settings = get_settings()
        self._table_name = self._settings.config_table_name

    def _get_table_client(self):
        """Get table client, ensuring table exists."""
        try:
            self._clients.table_service_client.create_table(self._table_name)
        except ResourceExistsError:
            pass
        return self._clients.get_table_client(self._table_name)

    def create(self, config: DatabaseConfig) -> DatabaseConfig:
        """
        Create a new database configuration.

        Args:
            config: DatabaseConfig to create

        Returns:
            Created DatabaseConfig with generated ID

        Raises:
            ValueError: If a database with the same ID already exists
        """
        table_client = self._get_table_client()

        # Generate ID if not provided
        if not config.id:
            config.id = str(uuid4())

        # Set timestamps
        config.created_at = datetime.utcnow()
        config.updated_at = datetime.utcnow()

        # Check if already exists
        try:
            existing = table_client.get_entity("database", config.id)
            raise ValueError(f"Database config with ID '{config.id}' already exists")
        except ResourceNotFoundError:
            pass

        # Create entity (include password in dev mode for testing)
        include_password = self._settings.is_development
        entity = config.to_table_entity(include_password=include_password)
        table_client.create_entity(entity)

        logger.info(f"Created database config: {config.id} ({config.name})")
        return config

    def get(self, database_id: str) -> Optional[DatabaseConfig]:
        """
        Get a database configuration by ID.

        Args:
            database_id: ID of the database configuration

        Returns:
            DatabaseConfig if found, None otherwise
        """
        table_client = self._get_table_client()

        try:
            entity = table_client.get_entity("database", database_id)
            return DatabaseConfig.from_table_entity(entity)
        except ResourceNotFoundError:
            return None

    def get_all(
        self,
        enabled_only: bool = False,
        limit: Optional[int] = None,
        offset: int = 0,
        search: Optional[str] = None,
        database_type: Optional[str] = None,
        host: Optional[str] = None,
        policy_id: Optional[str] = None,
    ) -> tuple[list[DatabaseConfig], int]:
        """
        Get database configurations with optional limit, offset and filters.

        Args:
            enabled_only: If True, only return enabled databases
            limit: Maximum number of results to return
            offset: Number of results to skip (for pagination)
            search: Search term to filter by name (case-insensitive)
            database_type: Filter by database type
            host: Filter by host
            policy_id: Filter by policy ID

        Returns:
            Tuple of (list of DatabaseConfig instances, total count)
        """
        table_client = self._get_table_client()

        filter_str = "PartitionKey eq 'database'"
        if enabled_only:
            filter_str += " and enabled eq true"

        configs = []
        entities = table_client.query_entities(query_filter=filter_str)

        for entity in entities:
            configs.append(DatabaseConfig.from_table_entity(entity))

        # Sort by name
        configs.sort(key=lambda x: x.name.lower())

        # Apply search filter (client-side since Table Storage doesn't support LIKE)
        if search:
            search_lower = search.lower()
            configs = [
                c for c in configs
                if search_lower in c.name.lower() or search_lower in c.host.lower()
            ]

        # Apply type filter
        if database_type:
            configs = [c for c in configs if c.database_type.value == database_type]

        # Apply host filter
        if host:
            configs = [c for c in configs if c.host == host]

        # Apply policy filter
        if policy_id:
            configs = [c for c in configs if c.policy_id == policy_id]

        total_count = len(configs)

        # Apply offset and limit
        if offset:
            configs = configs[offset:]
        if limit and limit < len(configs):
            configs = configs[:limit]

        return configs, total_count

    def get_by_type(self, database_type: DatabaseType) -> list[DatabaseConfig]:
        """
        Get database configurations by type.

        Args:
            database_type: Type of database to filter by

        Returns:
            List of DatabaseConfig instances
        """
        table_client = self._get_table_client()

        filter_str = (
            f"PartitionKey eq 'database' and "
            f"database_type eq '{database_type.value}'"
        )

        configs = []
        entities = table_client.query_entities(query_filter=filter_str)

        for entity in entities:
            configs.append(DatabaseConfig.from_table_entity(entity))

        return configs

    def update(self, config: DatabaseConfig) -> DatabaseConfig:
        """
        Update an existing database configuration.

        Args:
            config: DatabaseConfig with updated values

        Returns:
            Updated DatabaseConfig

        Raises:
            ValueError: If the database configuration doesn't exist
        """
        table_client = self._get_table_client()

        # Check if exists
        try:
            table_client.get_entity("database", config.id)
        except ResourceNotFoundError:
            raise ValueError(f"Database config with ID '{config.id}' not found")

        # Update timestamp
        config.updated_at = datetime.utcnow()

        # Update entity (include password in dev mode for testing)
        include_password = self._settings.is_development
        entity = config.to_table_entity(include_password=include_password)
        table_client.update_entity(entity, mode="replace")

        logger.info(f"Updated database config: {config.id} ({config.name})")
        return config

    def delete(self, database_id: str) -> bool:
        """
        Delete a database configuration.

        Args:
            database_id: ID of the database to delete

        Returns:
            True if deleted, False if not found
        """
        table_client = self._get_table_client()

        try:
            table_client.delete_entity("database", database_id)
            logger.info(f"Deleted database config: {database_id}")
            return True
        except ResourceNotFoundError:
            logger.warning(f"Database config not found: {database_id}")
            return False

    def enable(self, database_id: str) -> Optional[DatabaseConfig]:
        """
        Enable backups for a database.

        Args:
            database_id: ID of the database

        Returns:
            Updated DatabaseConfig or None if not found
        """
        config = self.get(database_id)
        if config:
            config.enabled = True
            return self.update(config)
        return None

    def disable(self, database_id: str) -> Optional[DatabaseConfig]:
        """
        Disable backups for a database.

        Args:
            database_id: ID of the database

        Returns:
            Updated DatabaseConfig or None if not found
        """
        config = self.get(database_id)
        if config:
            config.enabled = False
            return self.update(config)
        return None

    def update_schedule(
        self, database_id: str, schedule: str
    ) -> Optional[DatabaseConfig]:
        """
        Update the backup schedule for a database.

        Args:
            database_id: ID of the database
            schedule: New cron schedule expression

        Returns:
            Updated DatabaseConfig or None if not found
        """
        config = self.get(database_id)
        if config:
            config.schedule = schedule
            return self.update(config)
        return None
