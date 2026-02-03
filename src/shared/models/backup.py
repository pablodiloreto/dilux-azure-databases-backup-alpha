"""
Backup job and result models.

Defines the structure for backup jobs and their execution results.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from .database import DatabaseType


class BackupStatus(str, Enum):
    """Status of a backup job."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BackupTier(str, Enum):
    """Backup tier levels for retention."""

    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class BackupJob(BaseModel):
    """
    Represents a backup job to be processed.

    This model is sent to the backup queue for processing.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    database_id: str = Field(..., description="ID of the database to backup")
    database_name: str = Field(..., description="Display name of the database")
    database_type: DatabaseType = Field(..., description="Type of database")

    # Connection info (password retrieved separately from Key Vault)
    host: str
    port: int
    database_name_target: str = Field(
        ..., alias="target_database", description="Name of the database to backup"
    )
    username: str
    password_secret_name: Optional[str] = None

    # Backup options
    compression: bool = Field(default=True)
    backup_destination: Optional[str] = Field(
        default=None, description="Custom container name"
    )

    # Metadata
    triggered_by: str = Field(
        default="scheduler", description="Who/what triggered the backup"
    )
    tier: Optional[str] = Field(
        default=None,
        description="Backup tier: hourly, daily, weekly, monthly, yearly"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    scheduled_at: Optional[datetime] = Field(default=None)

    class Config:
        populate_by_name = True

    def to_queue_message(self) -> str:
        """Serialize to JSON for queue message."""
        return self.model_dump_json()

    @classmethod
    def from_queue_message(cls, message: str) -> "BackupJob":
        """Deserialize from queue message."""
        return cls.model_validate_json(message)


class BackupResult(BaseModel):
    """
    Result of a backup execution.

    Stored in Azure Table Storage for history/audit.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    job_id: str = Field(..., description="ID of the backup job")
    database_id: str = Field(..., description="ID of the database")
    database_name: str = Field(..., description="Display name of the database")
    database_type: DatabaseType

    # Execution details
    status: BackupStatus = Field(default=BackupStatus.PENDING)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None

    # Result details
    blob_name: Optional[str] = Field(
        default=None, description="Name of the backup file in blob storage"
    )
    blob_url: Optional[str] = Field(
        default=None, description="URL to download the backup"
    )
    file_size_bytes: Optional[int] = Field(
        default=None, description="Size of the backup file"
    )
    file_format: Optional[str] = Field(
        default=None, description="Format: sql.gz, bacpac, bak"
    )

    # Error information
    error_message: Optional[str] = None
    error_details: Optional[str] = None
    retry_count: int = Field(default=0)

    # Metadata
    triggered_by: str = Field(default="scheduler")
    tier: Optional[str] = Field(
        default=None,
        description="Backup tier: hourly, daily, weekly, monthly, yearly"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def mark_started(self) -> None:
        """Mark the backup as started."""
        self.status = BackupStatus.IN_PROGRESS
        self.started_at = datetime.utcnow()

    def mark_completed(
        self,
        blob_name: str,
        blob_url: str,
        file_size_bytes: int,
        file_format: str,
    ) -> None:
        """Mark the backup as completed successfully."""
        self.status = BackupStatus.COMPLETED
        self.completed_at = datetime.utcnow()
        self.blob_name = blob_name
        self.blob_url = blob_url
        self.file_size_bytes = file_size_bytes
        self.file_format = file_format

        if self.started_at:
            self.duration_seconds = (
                self.completed_at - self.started_at
            ).total_seconds()

    def mark_failed(self, error_message: str, error_details: Optional[str] = None) -> None:
        """Mark the backup as failed."""
        self.status = BackupStatus.FAILED
        self.completed_at = datetime.utcnow()
        self.error_message = error_message
        self.error_details = error_details

        if self.started_at:
            self.duration_seconds = (
                self.completed_at - self.started_at
            ).total_seconds()

    def to_table_entity(self) -> dict:
        """Convert to Azure Table Storage entity format."""
        # Use date as partition key for efficient querying by date range
        partition_key = self.created_at.strftime("%Y-%m-%d")

        # Use inverted timestamp as RowKey prefix for descending order by default
        # MAX_TICKS (year 9999) - current_ticks = newer records have smaller values = appear first
        max_ticks = 3155378975999999999  # DateTime.MaxValue.Ticks in .NET
        current_ticks = int(self.created_at.timestamp() * 10_000_000)
        inverted_ticks = max_ticks - current_ticks
        # Format: inverted_ticks (19 digits) + underscore + id (for uniqueness)
        row_key = f"{inverted_ticks:019d}_{self.id}"

        return {
            "PartitionKey": partition_key,
            "RowKey": row_key,
            "job_id": self.job_id,
            "database_id": self.database_id,
            "database_name": self.database_name,
            "database_type": self.database_type.value,
            "status": self.status.value,
            "started_at": self.started_at.isoformat() if self.started_at else "",
            "completed_at": self.completed_at.isoformat() if self.completed_at else "",
            "duration_seconds": self.duration_seconds or 0,
            "blob_name": self.blob_name or "",
            "blob_url": self.blob_url or "",
            "file_size_bytes": self.file_size_bytes or 0,
            "file_format": self.file_format or "",
            "error_message": self.error_message or "",
            "error_details": self.error_details or "",
            "retry_count": self.retry_count,
            "triggered_by": self.triggered_by,
            "tier": self.tier or "",
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_table_entity(cls, entity: dict) -> "BackupResult":
        """Create instance from Azure Table Storage entity."""

        def parse_datetime(value: str) -> Optional[datetime]:
            if not value:
                return None
            return datetime.fromisoformat(value)

        # Extract ID from RowKey (format: "inverted_ticks_id" or legacy "id")
        row_key = entity["RowKey"]
        if "_" in row_key and len(row_key) > 20:
            # New format: "0123456789012345678_uuid"
            backup_id = row_key.split("_", 1)[1]
        else:
            # Legacy format: just the UUID
            backup_id = row_key

        return cls(
            id=backup_id,
            job_id=entity["job_id"],
            database_id=entity["database_id"],
            database_name=entity["database_name"],
            database_type=DatabaseType(entity["database_type"]),
            status=BackupStatus(entity["status"]),
            started_at=parse_datetime(entity.get("started_at", "")),
            completed_at=parse_datetime(entity.get("completed_at", "")),
            duration_seconds=entity.get("duration_seconds") or None,
            blob_name=entity.get("blob_name") or None,
            blob_url=entity.get("blob_url") or None,
            file_size_bytes=entity.get("file_size_bytes") or None,
            file_format=entity.get("file_format") or None,
            error_message=entity.get("error_message") or None,
            error_details=entity.get("error_details") or None,
            retry_count=entity.get("retry_count", 0),
            triggered_by=entity.get("triggered_by", "scheduler"),
            tier=entity.get("tier") or None,
            created_at=parse_datetime(entity["created_at"]) or datetime.utcnow(),
        )
