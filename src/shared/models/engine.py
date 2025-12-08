"""
Engine (database server) configuration models.

An Engine represents a database server that can host multiple databases.
Databases can inherit credentials from their Engine or have their own.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class EngineType(str, Enum):
    """Supported database engine types."""

    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    SQLSERVER = "sqlserver"


class AuthMethod(str, Enum):
    """Authentication methods for database connections."""

    USER_PASSWORD = "user_password"
    MANAGED_IDENTITY = "managed_identity"
    AZURE_AD = "azure_ad"
    CONNECTION_STRING = "connection_string"


class Engine(BaseModel):
    """
    Configuration for a database server (Engine).

    This model is stored in Azure Table Storage with:
    - PartitionKey: "engine"
    - RowKey: engine ID (unique identifier)
    """

    id: str = Field(..., description="Unique identifier for the engine")
    name: str = Field(..., description="Display name for the engine")
    engine_type: EngineType = Field(..., description="Type of database engine")

    # Connection details
    host: str = Field(..., description="Database server host/IP")
    port: int = Field(..., description="Database server port")

    # Authentication (optional - engine may not have global credentials)
    auth_method: Optional[AuthMethod] = Field(
        default=None,
        description="Authentication method for engine-level access"
    )
    username: Optional[str] = Field(
        default=None,
        description="Username for user_password auth"
    )
    password: Optional[str] = Field(
        default=None,
        description="Password (dev only, use Key Vault in production)"
    )
    password_secret_name: Optional[str] = Field(
        default=None,
        description="Key Vault secret name for the password"
    )
    connection_string: Optional[str] = Field(
        default=None,
        description="Full connection string (for connection_string auth)"
    )

    # Discovery
    discovery_enabled: bool = Field(
        default=False,
        description="Whether this engine has credentials for database discovery"
    )
    last_discovery: Optional[datetime] = Field(
        default=None,
        description="Last time discovery was run on this engine"
    )

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = Field(default=None)

    @field_validator("port")
    @classmethod
    def validate_port(cls, v: int) -> int:
        """Validate port is in valid range."""
        if not 1 <= v <= 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v

    @classmethod
    def get_default_port(cls, engine_type: EngineType) -> int:
        """Get default port for engine type."""
        defaults = {
            EngineType.MYSQL: 3306,
            EngineType.POSTGRESQL: 5432,
            EngineType.SQLSERVER: 1433,
        }
        return defaults.get(engine_type, 3306)

    def has_credentials(self) -> bool:
        """Check if engine has any credentials configured."""
        if self.auth_method == AuthMethod.USER_PASSWORD:
            return bool(self.username and (self.password or self.password_secret_name))
        elif self.auth_method == AuthMethod.CONNECTION_STRING:
            return bool(self.connection_string)
        elif self.auth_method in (AuthMethod.MANAGED_IDENTITY, AuthMethod.AZURE_AD):
            return True
        return False

    def to_table_entity(self, include_password: bool = False) -> dict:
        """
        Convert to Azure Table Storage entity format.

        Args:
            include_password: If True, includes the password in the entity.
                              Only use in development environments.
        """
        entity = {
            "PartitionKey": "engine",
            "RowKey": self.id,
            "name": self.name,
            "engine_type": self.engine_type.value,
            "host": self.host,
            "port": self.port,
            "auth_method": self.auth_method.value if self.auth_method else "",
            "username": self.username or "",
            "password_secret_name": self.password_secret_name or "",
            "connection_string": self.connection_string or "",
            "discovery_enabled": self.discovery_enabled,
            "last_discovery": self.last_discovery.isoformat() if self.last_discovery else "",
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "created_by": self.created_by or "",
        }

        # Include password only in development mode
        if include_password and self.password:
            entity["password"] = self.password

        return entity

    @classmethod
    def from_table_entity(cls, entity: dict) -> "Engine":
        """Create instance from Azure Table Storage entity."""
        auth_method_str = entity.get("auth_method", "")
        auth_method = AuthMethod(auth_method_str) if auth_method_str else None

        last_discovery_str = entity.get("last_discovery", "")
        last_discovery = datetime.fromisoformat(last_discovery_str) if last_discovery_str else None

        return cls(
            id=entity["RowKey"],
            name=entity["name"],
            engine_type=EngineType(entity["engine_type"]),
            host=entity["host"],
            port=entity["port"],
            auth_method=auth_method,
            username=entity.get("username") or None,
            password=entity.get("password") or None,
            password_secret_name=entity.get("password_secret_name") or None,
            connection_string=entity.get("connection_string") or None,
            discovery_enabled=entity.get("discovery_enabled", False),
            last_discovery=last_discovery,
            created_at=datetime.fromisoformat(entity["created_at"]),
            updated_at=datetime.fromisoformat(entity["updated_at"]),
            created_by=entity.get("created_by") or None,
        )


class CreateEngineInput(BaseModel):
    """Input model for creating an engine."""

    name: str = Field(..., min_length=1, max_length=100)
    engine_type: EngineType
    host: str = Field(..., min_length=1)
    port: Optional[int] = Field(default=None)

    # Authentication (optional)
    auth_method: Optional[AuthMethod] = None
    username: Optional[str] = None
    password: Optional[str] = None
    connection_string: Optional[str] = None

    # Discovery
    discover_databases: bool = Field(
        default=False,
        description="Run discovery after creating the engine"
    )


class UpdateEngineInput(BaseModel):
    """Input model for updating an engine."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)

    # Credentials update
    auth_method: Optional[AuthMethod] = None
    username: Optional[str] = None
    password: Optional[str] = None
    connection_string: Optional[str] = None

    # Apply to all databases using engine credentials
    apply_to_all_databases: bool = Field(
        default=False,
        description="Also update databases with individual credentials"
    )


class DiscoveredDatabase(BaseModel):
    """A database discovered on an engine."""

    name: str = Field(..., description="Database name")
    exists: bool = Field(
        default=False,
        description="Whether this database already exists in the system"
    )
    existing_id: Optional[str] = Field(
        default=None,
        description="ID of existing database if exists=True"
    )
    is_system: bool = Field(
        default=False,
        description="Whether this is a system database"
    )


# System databases to exclude from discovery
SYSTEM_DATABASES = {
    EngineType.MYSQL: {"mysql", "information_schema", "performance_schema", "sys"},
    EngineType.POSTGRESQL: {"postgres", "template0", "template1"},
    EngineType.SQLSERVER: {"master", "tempdb", "model", "msdb"},
}
