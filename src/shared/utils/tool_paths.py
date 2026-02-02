"""
Database tool path resolver.

Provides paths to database CLI tools (mysql, mysqldump, pg_dump, etc.)
that are bundled with the Function App deployment.

In production (Azure Functions), tools are in: /home/site/wwwroot/tools/bin/
In development, tools are installed in the system PATH.
"""

import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# Tool names mapped to their binary files
TOOL_NAMES = {
    # MySQL
    "mysql": "mysql",
    "mysqldump": "mysqldump",
    "mysqladmin": "mysqladmin",
    # PostgreSQL
    "pg_dump": "pg_dump",
    "psql": "psql",
    "pg_isready": "pg_isready",
    # SQL Server
    "sqlcmd": "sqlcmd",
    "bcp": "bcp",
}


@lru_cache(maxsize=1)
def get_tools_bin_path() -> Optional[str]:
    """
    Get the path to the bundled tools/bin directory.

    Returns:
        Path to tools/bin directory if it exists, None otherwise.
    """
    # Azure Functions path (production)
    azure_path = "/home/site/wwwroot/tools/bin"
    if os.path.isdir(azure_path):
        logger.debug(f"Using Azure Functions tool path: {azure_path}")
        return azure_path

    # Relative to function app root (for local testing with bundled tools)
    # This handles when running from src/functions/api, src/functions/processor, etc.
    possible_paths = [
        os.path.join(os.getcwd(), "tools", "bin"),
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "tools", "bin"),
    ]

    for path in possible_paths:
        abs_path = os.path.abspath(path)
        if os.path.isdir(abs_path):
            logger.debug(f"Using local tool path: {abs_path}")
            return abs_path

    # No bundled tools found - will fall back to system PATH
    logger.debug("No bundled tools directory found, will use system PATH")
    return None


def get_tool_path(tool_name: str) -> str:
    """
    Get the full path to a database tool.

    If bundled tools are available, returns the full path to the bundled binary.
    Otherwise, returns just the tool name (relying on system PATH).

    Args:
        tool_name: Name of the tool (e.g., "mysql", "pg_dump", "sqlcmd")

    Returns:
        Full path to the tool if bundled, otherwise just the tool name.
    """
    if tool_name not in TOOL_NAMES:
        logger.warning(f"Unknown tool requested: {tool_name}, using as-is")
        binary_name = tool_name
    else:
        binary_name = TOOL_NAMES[tool_name]

    tools_bin = get_tools_bin_path()

    if tools_bin:
        tool_path = os.path.join(tools_bin, binary_name)
        if os.path.isfile(tool_path) and os.access(tool_path, os.X_OK):
            logger.debug(f"Using bundled tool: {tool_path}")
            return tool_path
        else:
            logger.debug(f"Bundled tool not found/executable: {tool_path}, falling back to PATH")

    # Fall back to system PATH
    return binary_name


def is_using_bundled_tools() -> bool:
    """
    Check if bundled tools are being used.

    Returns:
        True if bundled tools directory exists and is being used.
    """
    return get_tools_bin_path() is not None


def get_available_tools() -> dict:
    """
    Get a dictionary of available tools and their paths.

    Returns:
        Dict mapping tool names to their resolved paths.
    """
    return {name: get_tool_path(name) for name in TOOL_NAMES}
