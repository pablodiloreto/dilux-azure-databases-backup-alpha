"""
Database connection testing service.

Provides lightweight connection testing for MySQL, PostgreSQL, and SQL Server
without requiring full backup engine dependencies.
"""

import logging
import os
import subprocess
from dataclasses import dataclass
from typing import Optional

from shared.models import DatabaseType
from shared.utils.tool_paths import get_tool_path

logger = logging.getLogger(__name__)


@dataclass
class ConnectionTestResult:
    """Result of a connection test."""
    success: bool
    message: str
    error_type: Optional[str] = None
    duration_ms: Optional[float] = None


class ConnectionTester:
    """
    Tests database connectivity using native client tools.

    Uses lightweight ping/status commands rather than full queries
    to minimize impact on target databases.
    """

    def test_connection(
        self,
        database_type: DatabaseType,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        timeout_seconds: int = 30,
    ) -> ConnectionTestResult:
        """
        Test connection to a database.

        Args:
            database_type: Type of database to test
            host: Database host
            port: Database port
            database: Database name
            username: Username
            password: Password
            timeout_seconds: Timeout for connection test

        Returns:
            ConnectionTestResult with success status and message
        """
        import time
        start_time = time.time()

        try:
            if database_type == DatabaseType.MYSQL:
                result = self._test_mysql(host, port, database, username, password, timeout_seconds)
            elif database_type == DatabaseType.POSTGRESQL:
                result = self._test_postgresql(host, port, database, username, password, timeout_seconds)
            elif database_type in (DatabaseType.SQLSERVER, DatabaseType.AZURE_SQL):
                result = self._test_sqlserver(host, port, database, username, password, timeout_seconds)
            else:
                result = ConnectionTestResult(
                    success=False,
                    message=f"Unsupported database type: {database_type}",
                    error_type="UnsupportedType",
                )

            # Add duration
            duration_ms = (time.time() - start_time) * 1000
            result.duration_ms = round(duration_ms, 2)
            return result

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.exception(f"Connection test failed for {database_type}")
            return ConnectionTestResult(
                success=False,
                message=str(e),
                error_type=type(e).__name__,
                duration_ms=round(duration_ms, 2),
            )

    def _test_mysql(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        timeout: int,
    ) -> ConnectionTestResult:
        """Test MySQL connection using mysql client with a simple query."""
        # Use mysql client instead of mysqladmin because mysqladmin ping
        # returns exit code 0 even on authentication failure
        cmd = [
            get_tool_path("mysql"),
            f"--host={host}",
            f"--port={port}",
            f"--user={username}",
            f"--password={password}",
            "--connect-timeout=10",
            "-e", "SELECT 1",
            database,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=timeout,
            )

            stdout = result.stdout.decode("utf-8", errors="replace")
            stderr = result.stderr.decode("utf-8", errors="replace")

            # Check for actual success - must have exit code 0 AND no error in stderr
            if result.returncode == 0 and "error" not in stderr.lower() and "denied" not in stderr.lower():
                return ConnectionTestResult(
                    success=True,
                    message="Connection successful",
                )
            else:
                # Clean up error message
                error_msg = self._clean_mysql_error(stderr)
                return ConnectionTestResult(
                    success=False,
                    message=error_msg,
                    error_type="ConnectionFailed",
                )

        except subprocess.TimeoutExpired:
            return ConnectionTestResult(
                success=False,
                message=f"Connection timed out after {timeout} seconds",
                error_type="Timeout",
            )
        except FileNotFoundError:
            return ConnectionTestResult(
                success=False,
                message="mysql not found. MySQL client tools are not installed.",
                error_type="ToolNotFound",
            )

    def _test_postgresql(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        timeout: int,
    ) -> ConnectionTestResult:
        """Test PostgreSQL connection using psql with a simple query."""
        cmd = [
            get_tool_path("psql"),
            f"--host={host}",
            f"--port={port}",
            f"--username={username}",
            f"--dbname={database}",
            "--no-password",
            "-c", "SELECT 1",
        ]

        env = os.environ.copy()
        env["PGPASSWORD"] = password

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=timeout,
                env=env,
            )

            if result.returncode == 0:
                return ConnectionTestResult(
                    success=True,
                    message="Connection successful",
                )
            else:
                stderr = result.stderr.decode("utf-8", errors="replace")
                stdout = result.stdout.decode("utf-8", errors="replace")
                error_msg = stderr or stdout or "Connection failed"
                return ConnectionTestResult(
                    success=False,
                    message=error_msg.strip(),
                    error_type="ConnectionFailed",
                )

        except subprocess.TimeoutExpired:
            return ConnectionTestResult(
                success=False,
                message=f"Connection timed out after {timeout} seconds",
                error_type="Timeout",
            )
        except FileNotFoundError:
            return ConnectionTestResult(
                success=False,
                message="psql not found. PostgreSQL client tools are not installed.",
                error_type="ToolNotFound",
            )

    def _test_sqlserver(
        self,
        host: str,
        port: int,
        database: str,
        username: str,
        password: str,
        timeout: int,
    ) -> ConnectionTestResult:
        """Test SQL Server connection using sqlcmd."""
        server = f"{host},{port}"
        cmd = [
            get_tool_path("sqlcmd"),
            "-S", server,
            "-U", username,
            "-P", password,
            "-d", database,
            "-Q", "SELECT 1",
            "-C",  # Trust server certificate
            "-l", str(min(timeout, 60)),  # Login timeout
            "-h", "-1",  # No headers
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=timeout,
            )

            if result.returncode == 0:
                return ConnectionTestResult(
                    success=True,
                    message="Connection successful",
                )
            else:
                stderr = result.stderr.decode("utf-8", errors="replace")
                stdout = result.stdout.decode("utf-8", errors="replace")
                error_msg = self._clean_sqlserver_error(stderr or stdout)
                return ConnectionTestResult(
                    success=False,
                    message=error_msg,
                    error_type="ConnectionFailed",
                )

        except subprocess.TimeoutExpired:
            return ConnectionTestResult(
                success=False,
                message=f"Connection timed out after {timeout} seconds",
                error_type="Timeout",
            )
        except FileNotFoundError:
            return ConnectionTestResult(
                success=False,
                message="sqlcmd not found. SQL Server client tools are not installed.",
                error_type="ToolNotFound",
            )

    def _clean_mysql_error(self, error: str) -> str:
        """Clean up MySQL error message."""
        # Remove password warning
        lines = error.split("\n")
        lines = [l for l in lines if "Using a password on the command line" not in l]
        return " ".join(lines).strip() or "Connection failed"

    def _clean_sqlserver_error(self, error: str) -> str:
        """Clean up SQL Server error message."""
        # Extract meaningful error message
        if "Login failed" in error:
            return "Login failed - check username and password"
        if "Cannot open database" in error:
            return f"Cannot open database - check database name exists"
        if "network-related" in error.lower() or "instance-specific" in error.lower():
            return "Network error - check host and port"
        return error.strip()[:200] or "Connection failed"


# Singleton instance
_connection_tester = None


def get_connection_tester() -> ConnectionTester:
    """Get singleton ConnectionTester instance."""
    global _connection_tester
    if _connection_tester is None:
        _connection_tester = ConnectionTester()
    return _connection_tester
