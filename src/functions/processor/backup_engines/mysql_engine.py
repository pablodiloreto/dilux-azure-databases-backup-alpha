"""
MySQL backup engine using mysqldump.
"""

import logging
import subprocess
from typing import Optional

from .base_engine import BaseBackupEngine

logger = logging.getLogger(__name__)


class MySQLBackupEngine(BaseBackupEngine):
    """
    Backup engine for MySQL databases using mysqldump.

    Produces .sql files that can be restored using mysql client.
    """

    @property
    def database_type(self) -> str:
        return "mysql"

    @property
    def file_extension(self) -> str:
        return "sql"

    def _execute_backup_command(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        additional_options: Optional[list] = None,
    ) -> bytes:
        """
        Execute mysqldump to create a backup.

        Args:
            host: MySQL host
            port: MySQL port
            database: Database name
            username: MySQL username
            password: MySQL password
            additional_options: Additional mysqldump options

        Returns:
            SQL dump as bytes
        """
        # Build mysqldump command
        cmd = [
            "mysqldump",
            f"--host={host}",
            f"--port={port}",
            f"--user={username}",
            f"--password={password}",
            "--single-transaction",  # Consistent snapshot for InnoDB
            "--routines",  # Include stored procedures
            "--triggers",  # Include triggers
            "--events",  # Include events
            "--set-gtid-purged=OFF",  # Avoid GTID issues
            "--skip-lock-tables",  # Don't lock tables
            "--quick",  # Retrieve rows one at a time
            "--hex-blob",  # Dump binary as hex
        ]

        # Add any additional options
        if additional_options:
            cmd.extend(additional_options)

        # Add database name
        cmd.append(database)

        logger.info(f"Executing mysqldump for database: {database}")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                check=True,
                timeout=3600,  # 1 hour timeout
            )

            if result.stderr:
                # mysqldump writes warnings to stderr
                stderr_text = result.stderr.decode("utf-8", errors="replace")
                # Filter out password warning
                if "Using a password on the command line" not in stderr_text:
                    logger.warning(f"mysqldump stderr: {stderr_text}")

            return result.stdout

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e)
            logger.error(f"mysqldump failed: {error_msg}")
            raise RuntimeError(f"MySQL backup failed: {error_msg}")

        except subprocess.TimeoutExpired:
            logger.error("mysqldump timed out after 1 hour")
            raise RuntimeError("MySQL backup timed out")

    def test_connection(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
    ) -> bool:
        """Test MySQL connection using mysqladmin ping."""
        cmd = [
            "mysqladmin",
            f"--host={host}",
            f"--port={port}",
            f"--user={username}",
            f"--password={password}",
            "ping",
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"MySQL connection test failed: {e}")
            return False
