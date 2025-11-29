"""
Validation utilities for Dilux Database Backup.

Provides validation functions for common inputs like cron expressions,
connection strings, and database names.
"""

import re
from typing import Optional


def validate_cron_expression(expression: str) -> tuple[bool, Optional[str]]:
    """
    Validate a cron expression.

    Supports standard 5-field cron format:
    minute hour day-of-month month day-of-week

    Args:
        expression: Cron expression to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not expression or not expression.strip():
        return False, "Cron expression cannot be empty"

    parts = expression.strip().split()

    if len(parts) != 5:
        return False, f"Expected 5 fields, got {len(parts)}"

    field_names = ["minute", "hour", "day-of-month", "month", "day-of-week"]
    field_ranges = [
        (0, 59),   # minute
        (0, 23),   # hour
        (1, 31),   # day-of-month
        (1, 12),   # month
        (0, 6),    # day-of-week (0=Sunday)
    ]

    for i, (part, name, (min_val, max_val)) in enumerate(
        zip(parts, field_names, field_ranges)
    ):
        if not _validate_cron_field(part, min_val, max_val):
            return False, f"Invalid {name} field: {part}"

    return True, None


def _validate_cron_field(field: str, min_val: int, max_val: int) -> bool:
    """
    Validate a single cron field.

    Supports:
    - * (any)
    - */n (every n)
    - n (specific value)
    - n-m (range)
    - n,m,o (list)
    """
    # Wildcard
    if field == "*":
        return True

    # Step values (*/n or n-m/n)
    if "/" in field:
        base, step = field.split("/", 1)
        if not step.isdigit():
            return False
        step_val = int(step)
        if step_val < 1:
            return False
        if base == "*":
            return True
        # Validate base as range
        return _validate_cron_field(base, min_val, max_val)

    # Range (n-m)
    if "-" in field:
        parts = field.split("-")
        if len(parts) != 2:
            return False
        if not all(p.isdigit() for p in parts):
            return False
        start, end = int(parts[0]), int(parts[1])
        return min_val <= start <= max_val and min_val <= end <= max_val and start <= end

    # List (n,m,o)
    if "," in field:
        parts = field.split(",")
        return all(_validate_cron_field(p, min_val, max_val) for p in parts)

    # Single value
    if field.isdigit():
        val = int(field)
        return min_val <= val <= max_val

    return False


def validate_connection_string(
    connection_string: str, database_type: str
) -> tuple[bool, Optional[str]]:
    """
    Validate a database connection string.

    Args:
        connection_string: Connection string to validate
        database_type: Type of database (mysql, postgresql, sqlserver)

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not connection_string or not connection_string.strip():
        return False, "Connection string cannot be empty"

    required_parts = {
        "mysql": ["Server", "Database", "Uid"],
        "postgresql": ["Host", "Database", "Username"],
        "sqlserver": ["Server", "Database", "User Id"],
        "azure_sql": ["Server", "Database", "User Id"],
    }

    db_type = database_type.lower()
    if db_type not in required_parts:
        return False, f"Unknown database type: {database_type}"

    # Parse connection string
    parts = {}
    for part in connection_string.split(";"):
        if "=" in part:
            key, value = part.split("=", 1)
            parts[key.strip()] = value.strip()

    # Check required parts
    missing = []
    for required in required_parts[db_type]:
        if required not in parts:
            missing.append(required)

    if missing:
        return False, f"Missing required parts: {', '.join(missing)}"

    return True, None


def validate_database_name(name: str) -> tuple[bool, Optional[str]]:
    """
    Validate a database name.

    Args:
        name: Database name to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not name or not name.strip():
        return False, "Database name cannot be empty"

    name = name.strip()

    # Length check
    if len(name) > 128:
        return False, "Database name cannot exceed 128 characters"

    # Character check (alphanumeric, underscore, hyphen)
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9_-]*$", name):
        return False, (
            "Database name must start with a letter and contain only "
            "letters, numbers, underscores, and hyphens"
        )

    # Reserved names
    reserved = ["master", "tempdb", "model", "msdb", "mysql", "information_schema"]
    if name.lower() in reserved:
        return False, f"'{name}' is a reserved database name"

    return True, None


def validate_port(port: int) -> tuple[bool, Optional[str]]:
    """
    Validate a port number.

    Args:
        port: Port number to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(port, int):
        return False, "Port must be an integer"

    if port < 1 or port > 65535:
        return False, "Port must be between 1 and 65535"

    return True, None


def validate_hostname(hostname: str) -> tuple[bool, Optional[str]]:
    """
    Validate a hostname or IP address.

    Args:
        hostname: Hostname to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not hostname or not hostname.strip():
        return False, "Hostname cannot be empty"

    hostname = hostname.strip()

    # Length check
    if len(hostname) > 255:
        return False, "Hostname cannot exceed 255 characters"

    # IP address pattern
    ip_pattern = r"^(\d{1,3}\.){3}\d{1,3}$"
    if re.match(ip_pattern, hostname):
        # Validate IP address octets
        octets = hostname.split(".")
        for octet in octets:
            if int(octet) > 255:
                return False, "Invalid IP address"
        return True, None

    # Hostname pattern
    hostname_pattern = r"^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
    if re.match(hostname_pattern, hostname):
        return True, None

    return False, "Invalid hostname format"
