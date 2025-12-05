"""Application settings model."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AppSettings(BaseModel):
    """Application-wide settings stored in Table Storage."""

    # UI Settings
    dark_mode: bool = Field(default=False, description="Enable dark mode in UI")

    # Backup Defaults
    default_retention_days: int = Field(
        default=30,
        ge=1,
        le=365,
        description="Default retention period for new databases"
    )
    default_compression: bool = Field(
        default=True,
        description="Default compression setting for new databases"
    )

    # Metadata
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def to_table_entity(self) -> dict:
        """Convert to Azure Table Storage entity."""
        return {
            "PartitionKey": "settings",
            "RowKey": "app",
            "dark_mode": self.dark_mode,
            "default_retention_days": self.default_retention_days,
            "default_compression": self.default_compression,
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_table_entity(cls, entity: dict) -> "AppSettings":
        """Create from Azure Table Storage entity."""
        return cls(
            dark_mode=entity.get("dark_mode", False),
            default_retention_days=entity.get("default_retention_days", 30),
            default_compression=entity.get("default_compression", True),
            updated_at=datetime.fromisoformat(entity["updated_at"])
            if entity.get("updated_at")
            else datetime.utcnow(),
        )
