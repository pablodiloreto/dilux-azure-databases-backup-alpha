"""
PostgreSQL backup engine using pg_dump.

In development mode, uses docker exec to run pg_dump inside the PostgreSQL container
to avoid version mismatch issues between local pg_dump and server version.
"""

import logging
import os
import subprocess
from typing import Optional

from .base_engine import BaseBackupEngine
from shared.config.settings import get_settings

logger = logging.getLogger(__name__)


class PostgreSQLBackupEngine(BaseBackupEngine):
    """
    Backup engine for PostgreSQL databases using pg_dump.

    Produces .sql files that can be restored using psql.
    """

    @property
    def database_type(self) -> str:
        return "postgresql"

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
        Execute pg_dump to create a backup.

        In development mode, uses docker exec to run pg_dump inside the PostgreSQL
        container to avoid version mismatch issues.

        Args:
            host: PostgreSQL host
            port: PostgreSQL port
            database: Database name
            username: PostgreSQL username
            password: PostgreSQL password
            additional_options: Additional pg_dump options

        Returns:
            SQL dump as bytes
        """
        settings = get_settings()

        # pg_dump options (common for both modes)
        pg_dump_options = [
            "--format=plain",  # Plain text SQL
            "--no-owner",  # Don't output ownership commands
            "--no-privileges",  # Don't output privilege commands
            "--clean",  # Include DROP statements
            "--if-exists",  # Use IF EXISTS with DROP
        ]

        # Add any additional options
        if additional_options:
            pg_dump_options.extend(additional_options)

        if settings.is_development and host in ("postgres", "localhost", "127.0.0.1"):
            # In development, use docker exec to run pg_dump inside container
            # This avoids pg_dump version mismatch issues
            return self._execute_via_docker(database, username, password, pg_dump_options)
        else:
            # In production, use local pg_dump
            return self._execute_locally(host, port, database, username, password, pg_dump_options)

    def _execute_via_docker(
        self,
        database: str,
        username: str,
        password: str,
        pg_dump_options: list,
    ) -> bytes:
        """Execute pg_dump via docker exec inside the PostgreSQL container."""
        # Build the pg_dump command to run inside container
        pg_dump_cmd = " ".join([
            "pg_dump",
            f"--username={username}",
            "--no-password",
        ] + pg_dump_options + [database])

        # Docker exec command with PGPASSWORD environment variable
        cmd = [
            "docker", "exec",
            "-e", f"PGPASSWORD={password}",
            "dilux-postgres",  # Container name from docker-compose
            "sh", "-c", pg_dump_cmd
        ]

        logger.info(f"Executing pg_dump via docker exec for database: {database}")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                check=True,
                timeout=3600,  # 1 hour timeout
            )

            if result.stderr:
                stderr_text = result.stderr.decode("utf-8", errors="replace")
                logger.debug(f"pg_dump output: {stderr_text}")

            return result.stdout

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e)
            logger.error(f"pg_dump (docker) failed: {error_msg}")
            raise RuntimeError(f"PostgreSQL backup failed: {error_msg}")

        except subprocess.TimeoutExpired:
            logger.error("pg_dump timed out after 1 hour")
            raise RuntimeError("PostgreSQL backup timed out")

    def _execute_locally(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        pg_dump_options: list,
    ) -> bytes:
        """Execute pg_dump locally (for production environments)."""
        cmd = [
            "pg_dump",
            f"--host={host}",
            f"--port={port}",
            f"--username={username}",
            "--no-password",  # Don't prompt for password (use PGPASSWORD env)
        ] + pg_dump_options + [database]

        logger.info(f"Executing pg_dump for database: {database}")

        # Set password via environment variable (more secure than command line)
        env = os.environ.copy()
        env["PGPASSWORD"] = password

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                check=True,
                timeout=3600,  # 1 hour timeout
                env=env,
            )

            if result.stderr:
                # pg_dump writes info to stderr in verbose mode
                stderr_text = result.stderr.decode("utf-8", errors="replace")
                logger.debug(f"pg_dump output: {stderr_text}")

            return result.stdout

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode("utf-8", errors="replace") if e.stderr else str(e)
            logger.error(f"pg_dump failed: {error_msg}")
            raise RuntimeError(f"PostgreSQL backup failed: {error_msg}")

        except subprocess.TimeoutExpired:
            logger.error("pg_dump timed out after 1 hour")
            raise RuntimeError("PostgreSQL backup timed out")

    def test_connection(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
    ) -> bool:
        """Test PostgreSQL connection using pg_isready."""
        cmd = [
            "pg_isready",
            f"--host={host}",
            f"--port={port}",
            f"--username={username}",
            f"--dbname={database}",
        ]

        env = os.environ.copy()
        env["PGPASSWORD"] = password

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
                env=env,
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"PostgreSQL connection test failed: {e}")
            return False
