"""
Database configuration models.

Defines the structure for database configurations stored in Azure Table Storage.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


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

    # Connection details
    host: str = Field(..., description="Database host/server")
    port: int = Field(..., description="Database port")
    database_name: str = Field(..., description="Name of the database to backup")
    username: str = Field(..., description="Database username")

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
    schedule: str = Field(
        default=BackupSchedule.DAILY.value,
        description="Cron expression for backup schedule"
    )
    enabled: bool = Field(default=True, description="Whether backups are enabled")
    retention_days: int = Field(
        default=30,
        description="Number of days to retain backups"
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

    @field_validator("retention_days")
    @classmethod
    def validate_retention(cls, v: int) -> int:
        """Validate retention days is reasonable."""
        if not 1 <= v <= 365:
            raise ValueError("Retention days must be between 1 and 365")
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
            "host": self.host,
            "port": self.port,
            "database_name": self.database_name,
            "username": self.username,
            "password_secret_name": self.password_secret_name or "",
            "schedule": self.schedule,
            "enabled": self.enabled,
            "retention_days": self.retention_days,
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

        return cls(
            id=entity["RowKey"],
            name=entity["name"],
            database_type=DatabaseType(entity["database_type"]),
            host=entity["host"],
            port=entity["port"],
            database_name=entity["database_name"],
            username=entity["username"],
            password=entity.get("password") or None,  # Restore password if stored (dev only)
            password_secret_name=entity.get("password_secret_name") or None,
            schedule=entity.get("schedule", BackupSchedule.DAILY.value),
            enabled=entity.get("enabled", True),
            retention_days=entity.get("retention_days", 30),
            backup_destination=entity.get("backup_destination") or None,
            compression=entity.get("compression", True),
            tags=tags,
            created_at=datetime.fromisoformat(entity["created_at"]),
            updated_at=datetime.fromisoformat(entity["updated_at"]),
            created_by=entity.get("created_by") or None,
        )
