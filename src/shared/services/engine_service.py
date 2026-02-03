"""
Engine (database server) configuration service.

Manages CRUD operations for engine configurations stored in Azure Table Storage.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import uuid4

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError

from ..config import AzureClients, get_settings
from ..models import Engine, EngineType, DiscoveredDatabase, SYSTEM_DATABASES
from ..utils import get_tool_path

logger = logging.getLogger(__name__)


class EngineService:
    """
    Service for managing engine (database server) configurations.

    Provides CRUD operations for engine configurations stored in Azure Table Storage.
    """

    def __init__(self, azure_clients: Optional[AzureClients] = None):
        """
        Initialize engine service.

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

    def create(self, engine: Engine) -> Engine:
        """
        Create a new engine configuration.

        Args:
            engine: Engine to create

        Returns:
            Created Engine with generated ID

        Raises:
            ValueError: If an engine with the same ID already exists
        """
        table_client = self._get_table_client()

        # Generate ID if not provided
        if not engine.id:
            engine.id = str(uuid4())

        # Set timestamps
        engine.created_at = datetime.utcnow()
        engine.updated_at = datetime.utcnow()

        # Check if already exists
        try:
            existing = table_client.get_entity("engine", engine.id)
            raise ValueError(f"Engine with ID '{engine.id}' already exists")
        except ResourceNotFoundError:
            pass

        # Check for duplicate host:port:type combination
        existing_engines, _ = self.get_all()
        for existing in existing_engines:
            if (existing.host == engine.host and
                existing.port == engine.port and
                existing.engine_type == engine.engine_type):
                raise ValueError(
                    f"An engine for {engine.engine_type.value} at {engine.host}:{engine.port} already exists"
                )

        # Save password to Key Vault in production
        if engine.password and self._settings.use_key_vault:
            secret_name = f"engine-{engine.id}"
            if self._clients.set_secret(secret_name, engine.password):
                engine.password_secret_name = secret_name
                # Clear password so it's not stored in Table Storage
                password_for_entity = engine.password
                engine.password = None
            else:
                logger.warning(f"Failed to save engine password to Key Vault, keeping in memory only")

        # Create entity (include password only in dev mode)
        include_password = self._settings.is_development
        entity = engine.to_table_entity(include_password=include_password)
        table_client.create_entity(entity)

        logger.info(f"Created engine: {engine.id} ({engine.name})")
        return engine

    def get(self, engine_id: str) -> Optional[Engine]:
        """
        Get an engine configuration by ID.

        Args:
            engine_id: ID of the engine configuration

        Returns:
            Engine if found, None otherwise
        """
        table_client = self._get_table_client()

        try:
            entity = table_client.get_entity("engine", engine_id)
            engine = Engine.from_table_entity(entity)

            # Load password from Key Vault in production
            if engine.password_secret_name and self._settings.use_key_vault:
                password = self._clients.get_secret(engine.password_secret_name)
                if password:
                    engine.password = password

            return engine
        except ResourceNotFoundError:
            return None

    def get_all(
        self,
        limit: Optional[int] = None,
        offset: int = 0,
        search: Optional[str] = None,
        engine_type: Optional[str] = None,
    ) -> tuple[list[Engine], int]:
        """
        Get engine configurations with optional limit, offset and filters.

        Args:
            limit: Maximum number of results to return
            offset: Number of results to skip (for pagination)
            search: Search term to filter by name or host (case-insensitive)
            engine_type: Filter by engine type

        Returns:
            Tuple of (list of Engine instances, total count)
        """
        table_client = self._get_table_client()

        filter_str = "PartitionKey eq 'engine'"

        engines = []
        entities = table_client.query_entities(query_filter=filter_str)

        for entity in entities:
            engines.append(Engine.from_table_entity(entity))

        # Sort by name
        engines.sort(key=lambda x: x.name.lower())

        # Apply search filter (client-side since Table Storage doesn't support LIKE)
        if search:
            search_lower = search.lower()
            engines = [
                e for e in engines
                if search_lower in e.name.lower() or search_lower in e.host.lower()
            ]

        # Apply type filter
        if engine_type:
            engines = [e for e in engines if e.engine_type.value == engine_type]

        total_count = len(engines)

        # Apply offset and limit
        if offset:
            engines = engines[offset:]
        if limit and limit < len(engines):
            engines = engines[:limit]

        return engines, total_count

    def get_by_host(self, host: str, port: int, engine_type: EngineType) -> Optional[Engine]:
        """
        Find an engine by host, port, and type.

        Args:
            host: Database server host
            port: Database server port
            engine_type: Type of engine

        Returns:
            Engine if found, None otherwise
        """
        engines, _ = self.get_all()
        for engine in engines:
            if (engine.host == host and
                engine.port == port and
                engine.engine_type == engine_type):
                return engine
        return None

    def update(self, engine: Engine) -> Engine:
        """
        Update an existing engine configuration.

        Args:
            engine: Engine with updated values

        Returns:
            Updated Engine

        Raises:
            ValueError: If the engine configuration doesn't exist
        """
        table_client = self._get_table_client()

        # Check if exists
        try:
            table_client.get_entity("engine", engine.id)
        except ResourceNotFoundError:
            raise ValueError(f"Engine with ID '{engine.id}' not found")

        # Update timestamp
        engine.updated_at = datetime.utcnow()

        # Handle password update in Key Vault
        if engine.password and self._settings.use_key_vault:
            secret_name = engine.password_secret_name or f"engine-{engine.id}"
            if self._clients.set_secret(secret_name, engine.password):
                engine.password_secret_name = secret_name
                engine.password = None  # Don't store in Table
            else:
                logger.warning(f"Failed to update engine password in Key Vault")

        # Update entity (include password only in dev mode)
        include_password = self._settings.is_development
        entity = engine.to_table_entity(include_password=include_password)
        table_client.update_entity(entity, mode="replace")

        logger.info(f"Updated engine: {engine.id} ({engine.name})")
        return engine

    def delete(self, engine_id: str) -> bool:
        """
        Delete an engine configuration.

        Args:
            engine_id: ID of the engine to delete

        Returns:
            True if deleted, False if not found
        """
        table_client = self._get_table_client()

        # Get engine first to check for Key Vault secret
        engine = self.get(engine_id)
        if engine and engine.password_secret_name and self._settings.use_key_vault:
            self._clients.delete_secret(engine.password_secret_name)

        try:
            table_client.delete_entity("engine", engine_id)
            logger.info(f"Deleted engine: {engine_id}")
            return True
        except ResourceNotFoundError:
            logger.warning(f"Engine not found: {engine_id}")
            return False

    def get_database_count(self, engine_id: str) -> int:
        """
        Get the number of databases associated with an engine.

        Args:
            engine_id: ID of the engine

        Returns:
            Number of databases
        """
        table_client = self._get_table_client()

        filter_str = f"PartitionKey eq 'database' and engine_id eq '{engine_id}'"
        count = 0
        for _ in table_client.query_entities(query_filter=filter_str):
            count += 1
        return count

    def discover_databases(self, engine: Engine) -> list[DiscoveredDatabase]:
        """
        Discover databases available on an engine.

        Args:
            engine: Engine to discover databases on

        Returns:
            List of discovered databases

        Raises:
            ValueError: If engine doesn't have credentials for discovery
        """
        if not engine.has_credentials():
            raise ValueError("Engine doesn't have credentials for database discovery")

        # Get existing databases for this engine
        from .database_config_service import DatabaseConfigService
        db_service = DatabaseConfigService(self._clients)
        existing_dbs, _ = db_service.get_all()
        existing_db_names = {
            db.database_name for db in existing_dbs
            if db.engine_id == engine.id
        }

        # Get system databases to exclude
        system_dbs = SYSTEM_DATABASES.get(engine.engine_type, set())

        # Discover databases based on engine type
        discovered = []
        discovery_error = None

        try:
            if engine.engine_type == EngineType.MYSQL:
                discovered = self._discover_mysql(engine, existing_db_names, system_dbs)
            elif engine.engine_type == EngineType.POSTGRESQL:
                discovered = self._discover_postgresql(engine, existing_db_names, system_dbs)
            elif engine.engine_type == EngineType.SQLSERVER:
                discovered = self._discover_sqlserver(engine, existing_db_names, system_dbs)
        except Exception as e:
            logger.error(f"Failed to discover databases on {engine.name}: {e}")
            discovery_error = str(e)

        # Always include existing configured databases, even if discovery failed
        discovered_names = {db.name for db in discovered}
        existing_configs = [db for db in existing_dbs if db.engine_id == engine.id]

        for db_config in existing_configs:
            if db_config.database_name not in discovered_names:
                discovered.append(DiscoveredDatabase(
                    name=db_config.database_name,
                    exists=True,
                    is_system=False,
                ))

        # Update last_discovery timestamp
        engine.last_discovery = datetime.utcnow()
        self.update(engine)

        # If discovery failed and no existing DBs, raise the error
        if discovery_error and not existing_configs:
            raise ValueError(f"Failed to discover databases: {discovery_error}")

        return discovered

    def _discover_mysql(
        self,
        engine: Engine,
        existing_db_names: set,
        system_dbs: set
    ) -> list[DiscoveredDatabase]:
        """Discover databases on a MySQL server."""
        import subprocess

        cmd = [
            get_tool_path("mysql"),
            f"-h{engine.host}",
            f"-P{engine.port}",
            f"-u{engine.username}",
            f"-p{engine.password}",
            "-N", "-e", "SHOW DATABASES"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise ValueError(f"MySQL connection failed: {result.stderr}")

        discovered = []
        for line in result.stdout.strip().split("\n"):
            db_name = line.strip()
            if not db_name:
                continue

            is_system = db_name.lower() in system_dbs
            exists = db_name in existing_db_names

            discovered.append(DiscoveredDatabase(
                name=db_name,
                exists=exists,
                is_system=is_system,
            ))

        return discovered

    def _discover_postgresql(
        self,
        engine: Engine,
        existing_db_names: set,
        system_dbs: set
    ) -> list[DiscoveredDatabase]:
        """Discover databases on a PostgreSQL server."""
        import subprocess
        import os

        env = os.environ.copy()
        env["PGPASSWORD"] = engine.password

        cmd = [
            get_tool_path("psql"),
            "-h", engine.host,
            "-p", str(engine.port),
            "-U", engine.username,
            "-d", "postgres",
            "-t", "-A", "-c",
            "SELECT datname FROM pg_database WHERE datistemplate = false"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)
        if result.returncode != 0:
            raise ValueError(f"PostgreSQL connection failed: {result.stderr}")

        discovered = []
        for line in result.stdout.strip().split("\n"):
            db_name = line.strip()
            if not db_name:
                continue

            is_system = db_name.lower() in system_dbs
            exists = db_name in existing_db_names

            discovered.append(DiscoveredDatabase(
                name=db_name,
                exists=exists,
                is_system=is_system,
            ))

        return discovered

    def _discover_sqlserver(
        self,
        engine: Engine,
        existing_db_names: set,
        system_dbs: set
    ) -> list[DiscoveredDatabase]:
        """Discover databases on a SQL Server."""
        import subprocess

        cmd = [
            get_tool_path("sqlcmd"),
            "-S", f"{engine.host},{engine.port}",
            "-U", engine.username,
            "-P", engine.password,
            "-C",  # Trust server certificate
            "-h", "-1",  # No headers
            "-W",  # Trim spaces
            "-Q", "SELECT name FROM sys.databases WHERE database_id > 4"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            raise ValueError(f"SQL Server connection failed: {result.stderr}")

        discovered = []
        for line in result.stdout.strip().split("\n"):
            db_name = line.strip()
            # Skip empty lines, separator lines, and sqlcmd messages
            if not db_name or db_name.startswith("-") or db_name.startswith("(") or "rows affected" in db_name.lower():
                continue

            is_system = db_name.lower() in system_dbs
            exists = db_name in existing_db_names

            discovered.append(DiscoveredDatabase(
                name=db_name,
                exists=exists,
                is_system=is_system,
            ))

        return discovered
