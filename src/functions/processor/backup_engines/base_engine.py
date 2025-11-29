"""
Base backup engine defining the interface for all database backup engines.
"""

import gzip
import io
import logging
from abc import ABC, abstractmethod
from typing import BinaryIO, Tuple

logger = logging.getLogger(__name__)


class BaseBackupEngine(ABC):
    """
    Abstract base class for database backup engines.

    All database-specific engines must implement the execute_backup method.
    """

    @property
    @abstractmethod
    def database_type(self) -> str:
        """Return the database type this engine handles."""
        pass

    @property
    @abstractmethod
    def file_extension(self) -> str:
        """Return the file extension for uncompressed backups."""
        pass

    @abstractmethod
    def _execute_backup_command(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
    ) -> bytes:
        """
        Execute the database-specific backup command.

        Args:
            host: Database host
            port: Database port
            database: Database name
            username: Database username
            password: Database password

        Returns:
            Raw backup data as bytes
        """
        pass

    def execute_backup(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        compress: bool = True,
    ) -> Tuple[BinaryIO, str]:
        """
        Execute a backup and optionally compress the result.

        Args:
            host: Database host
            port: Database port
            database: Database name
            username: Database username
            password: Database password
            compress: Whether to gzip compress the backup

        Returns:
            Tuple of (file-like object with backup data, file format string)
        """
        logger.info(
            f"Starting {self.database_type} backup for {database} "
            f"on {host}:{port}"
        )

        # Execute the backup command
        backup_data = self._execute_backup_command(
            host=host,
            port=port,
            database=database,
            username=username,
            password=password,
        )

        logger.info(
            f"Backup command completed, raw size: {len(backup_data)} bytes"
        )

        # Compress if requested
        if compress:
            compressed_data = gzip.compress(backup_data)
            file_format = f"{self.file_extension}.gz"

            logger.info(
                f"Compressed backup from {len(backup_data)} to "
                f"{len(compressed_data)} bytes "
                f"({len(compressed_data) / len(backup_data) * 100:.1f}%)"
            )

            return io.BytesIO(compressed_data), file_format
        else:
            return io.BytesIO(backup_data), self.file_extension

    def test_connection(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
    ) -> bool:
        """
        Test database connectivity.

        Args:
            host: Database host
            port: Database port
            database: Database name
            username: Database username
            password: Database password

        Returns:
            True if connection successful, False otherwise
        """
        # Default implementation - subclasses can override
        try:
            self._execute_backup_command(
                host=host,
                port=port,
                database=database,
                username=username,
                password=password,
            )
            return True
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False
