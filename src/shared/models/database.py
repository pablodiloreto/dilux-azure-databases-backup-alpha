"""
Database configuration models.

Defines the structure for database configurations stored in Azure Table Storage.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from .engine import AuthMethod


class DatabaseType(str, Enum):
    """Supported database types."""

    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    SQLSERVER = "sqlserver"
    AZURE_SQL = "azure_sql"


class BackupSchedule(str, Enum):
    """Predefined backup schedules."""

    EVERY_15_MIN = "*/15 * * * *"
    HOURLY = "0 * * * *"
    EVERY_6_HOURS = "0 */6 * * *"
    DAILY = "0 0 * * *"
    WEEKLY = "0 0 * * 0"


class DatabaseConfig(BaseModel):
    """
    Configuration for a database to backup.

    This model is stored in Azure Table Storage with:
    - PartitionKey: "database"
    - RowKey: database ID (unique identifier)
    """

    id: str = Field(..., description="Unique identifier for the database")
    name: str = Field(..., description="Display name for the database")
    database_type: DatabaseType = Field(..., description="Type of database")

    # Engine relationship (required - every database belongs to an engine)
    engine_id: Optional[str] = Field(
        default=None,
        description="ID of the engine (server) this database belongs to. Required for new databases."
    )

    # Credential source
    use_engine_credentials: bool = Field(
        default=True,
        description="If True, use credentials from the engine. If False, use database-specific credentials."
    )

    # Connection details (inherited from engine, but kept for backward compatibility and overrides)
    host: str = Field(..., description="Database host/server")
    port: int = Field(..., description="Database port")
    database_name: str = Field(..., description="Name of the database to backup")

    # Database-specific credentials (only used if use_engine_credentials=False)
    auth_method: Optional[AuthMethod] = Field(
        default=None,
        description="Authentication method (only if not using engine credentials)"
    )
    username: Optional[str] = Field(
        default=None,
        description="Database username (only if not using engine credentials)"
    )

    # Password is stored in Key Vault, this is the secret name
    password_secret_name: Optional[str] = Field(
        default=None,
        description="Key Vault secret name for the password"
    )

    # For local development, password can be stored directly (not recommended for prod)
    password: Optional[str] = Field(
        default=None,
        description="Database password (dev only, use Key Vault in production)"
    )

    # Backup configuration
    policy_id: str = Field(
        default="production-standard",
        description="ID of the backup policy to use"
    )
    enabled: bool = Field(default=True, description="Whether backups are enabled")

    # Legacy fields - kept for backward compatibility during migration
    schedule: Optional[str] = Field(
        default=None,
        description="[DEPRECATED] Use policy_id instead"
    )
    retention_days: Optional[int] = Field(
        default=None,
        description="[DEPRECATED] Use policy_id instead"
    )

    # Optional settings
    backup_destination: Optional[str] = Field(
        default=None,
        description="Custom blob container for this database's backups"
    )
    compression: bool = Field(
        default=True,
        description="Whether to compress backups"
    )
    tags: dict[str, str] = Field(
        default_factory=dict,
        description="Custom tags for the database"
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

    def get_connection_string(self) -> str:
        """
        Generate connection string based on database type.

        Note: Password should be retrieved from Key Vault in production.
        """
        pwd = self.password or "[PASSWORD_FROM_KEYVAULT]"

        if self.database_type == DatabaseType.MYSQL:
            return (
                f"Server={self.host};"
                f"Port={self.port};"
                f"Database={self.database_name};"
                f"Uid={self.username};"
                f"Pwd={pwd};"
            )
        elif self.database_type == DatabaseType.POSTGRESQL:
            return (
                f"Host={self.host};"
                f"Port={self.port};"
                f"Database={self.database_name};"
                f"Username={self.username};"
                f"Password={pwd};"
            )
        elif self.database_type in (DatabaseType.SQLSERVER, DatabaseType.AZURE_SQL):
            return (
                f"Server={self.host},{self.port};"
                f"Database={self.database_name};"
                f"User Id={self.username};"
                f"Password={pwd};"
                f"TrustServerCertificate=True;"
            )
        else:
            raise ValueError(f"Unsupported database type: {self.database_type}")

    def to_table_entity(self, include_password: bool = False) -> dict:
        """
        Convert to Azure Table Storage entity format.

        Args:
            include_password: If True, includes the password in the entity.
                              Only use in development environments.
        """
        entity = {
            "PartitionKey": "database",
            "RowKey": self.id,
            "name": self.name,
            "database_type": self.database_type.value,
            # Engine relationship
            "engine_id": self.engine_id or "",
            "use_engine_credentials": self.use_engine_credentials,
            # Connection details
            "host": self.host,
            "port": self.port,
            "database_name": self.database_name,
            # Credentials (only relevant if use_engine_credentials=False)
            "auth_method": self.auth_method.value if self.auth_method else "",
            "username": self.username or "",
            "password_secret_name": self.password_secret_name or "",
            "policy_id": self.policy_id,
            "enabled": self.enabled,
            # Legacy fields - keep for backward compatibility
            "schedule": self.schedule or "",
            "retention_days": self.retention_days or 0,
            "backup_destination": self.backup_destination or "",
            "compression": self.compression,
            "tags": str(self.tags),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "created_by": self.created_by or "",
        }

        # Include password only in development mode
        if include_password and self.password:
            entity["password"] = self.password

        return entity

    @classmethod
    def from_table_entity(cls, entity: dict) -> "DatabaseConfig":
        """Create instance from Azure Table Storage entity."""
        import ast

        tags_str = entity.get("tags", "{}")
        try:
            tags = ast.literal_eval(tags_str) if tags_str else {}
        except (ValueError, SyntaxError):
            tags = {}

        # Handle migration: if policy_id doesn't exist, default to production-standard
        policy_id = entity.get("policy_id", "production-standard")

        # Handle auth_method (new field)
        auth_method_str = entity.get("auth_method", "")
        auth_method = AuthMethod(auth_method_str) if auth_method_str else None

        # Handle migration: databases without engine_id use their own credentials
        engine_id = entity.get("engine_id") or None
        use_engine_credentials = entity.get("use_engine_credentials", False) if engine_id else False

        return cls(
            id=entity["RowKey"],
            name=entity["name"],
            database_type=DatabaseType(entity["database_type"]),
            # Engine relationship
            engine_id=engine_id,
            use_engine_credentials=use_engine_credentials,
            # Connection details
            host=entity["host"],
            port=entity["port"],
            database_name=entity["database_name"],
            # Credentials
            auth_method=auth_method,
            username=entity.get("username") or None,
            password=entity.get("password") or None,
            password_secret_name=entity.get("password_secret_name") or None,
            # Backup config
            policy_id=policy_id,
            enabled=entity.get("enabled", True),
            # Legacy fields
            schedule=entity.get("schedule") or None,
            retention_days=entity.get("retention_days") or None,
            backup_destination=entity.get("backup_destination") or None,
            compression=entity.get("compression", True),
            tags=tags,
            created_at=datetime.fromisoformat(entity["created_at"]),
            updated_at=datetime.fromisoformat(entity["updated_at"]),
            created_by=entity.get("created_by") or None,
        )
