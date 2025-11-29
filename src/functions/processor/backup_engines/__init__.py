"""
Backup engines for different database types.

Each engine handles the specific backup process for its database type.
"""

from .base_engine import BaseBackupEngine
from .mysql_engine import MySQLBackupEngine
from .postgres_engine import PostgreSQLBackupEngine
from .sqlserver_engine import SQLServerBackupEngine

from shared.models import DatabaseType


def get_backup_engine(database_type: DatabaseType) -> BaseBackupEngine:
    """
    Get the appropriate backup engine for a database type.

    Args:
        database_type: Type of database

    Returns:
        Backup engine instance

    Raises:
        ValueError: If database type is not supported
    """
    engines = {
        DatabaseType.MYSQL: MySQLBackupEngine,
        DatabaseType.POSTGRESQL: PostgreSQLBackupEngine,
        DatabaseType.SQLSERVER: SQLServerBackupEngine,
        DatabaseType.AZURE_SQL: SQLServerBackupEngine,  # Same engine for Azure SQL
    }

    engine_class = engines.get(database_type)
    if not engine_class:
        raise ValueError(f"Unsupported database type: {database_type}")

    return engine_class()


__all__ = [
    "BaseBackupEngine",
    "MySQLBackupEngine",
    "PostgreSQLBackupEngine",
    "SQLServerBackupEngine",
    "get_backup_engine",
]
