"""Audit log model for tracking all system actions."""

from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field
import uuid


class AuditAction(str, Enum):
    """Types of actions that can be audited."""

    # Backup actions
    BACKUP_COMPLETED = "backup_completed"
    BACKUP_FAILED = "backup_failed"
    BACKUP_DELETED = "backup_deleted"
    BACKUP_DELETED_BULK = "backup_deleted_bulk"
    BACKUP_DELETED_RETENTION = "backup_deleted_retention"
    BACKUP_TRIGGERED = "backup_triggered"
    BACKUP_DOWNLOADED = "backup_downloaded"

    # Database actions
    DATABASE_CREATED = "database_created"
    DATABASE_UPDATED = "database_updated"
    DATABASE_DELETED = "database_deleted"
    DATABASE_TEST_CONNECTION = "database_test_connection"

    # Policy actions
    POLICY_CREATED = "policy_created"
    POLICY_UPDATED = "policy_updated"
    POLICY_DELETED = "policy_deleted"

    # User actions
    USER_CREATED = "user_created"
    USER_UPDATED = "user_updated"
    USER_DELETED = "user_deleted"
    USER_LOGIN = "user_login"
    ACCESS_REQUEST_APPROVED = "access_request_approved"
    ACCESS_REQUEST_REJECTED = "access_request_rejected"

    # Settings actions
    SETTINGS_UPDATED = "settings_updated"


class AuditResourceType(str, Enum):
    """Types of resources that can be audited."""

    BACKUP = "backup"
    DATABASE = "database"
    POLICY = "policy"
    USER = "user"
    SETTINGS = "settings"
    ACCESS_REQUEST = "access_request"


class AuditStatus(str, Enum):
    """Status of the audited action."""

    SUCCESS = "success"
    FAILED = "failed"


class AuditLog(BaseModel):
    """
    Audit log entry for tracking system actions.

    Stored in Azure Table Storage with:
    - PartitionKey: YYYYMM (for efficient date range queries)
    - RowKey: inverted timestamp + uuid (for descending order)
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Who performed the action
    user_id: str = Field(..., description="User ID or 'system' for automated actions")
    user_email: str = Field(..., description="User email for display")

    # What action was performed
    action: AuditAction = Field(..., description="Type of action")

    # What resource was affected
    resource_type: AuditResourceType = Field(..., description="Type of resource")
    resource_id: str = Field(..., description="ID of the affected resource")
    resource_name: str = Field(..., description="Human-readable name (preserved even if resource deleted)")

    # Additional details
    details: Optional[dict[str, Any]] = Field(default=None, description="Additional context")
    status: AuditStatus = Field(default=AuditStatus.SUCCESS)
    error_message: Optional[str] = Field(default=None, description="Error message if failed")

    # Request metadata
    ip_address: Optional[str] = Field(default=None)

    def to_table_entity(self) -> dict:
        """Convert to Azure Table Storage entity."""
        # Use YYYYMM as partition key for efficient date queries
        partition_key = self.timestamp.strftime("%Y%m")

        # Use inverted timestamp for descending order (newest first)
        # Max timestamp minus actual = inverted (so newer = smaller number)
        max_ts = 9999999999999999
        ts_microseconds = int(self.timestamp.timestamp() * 1000000)
        inverted_ts = max_ts - ts_microseconds
        row_key = f"{inverted_ts:016d}_{self.id}"

        entity = {
            "PartitionKey": partition_key,
            "RowKey": row_key,
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "user_id": self.user_id,
            "user_email": self.user_email,
            "action": self.action.value,
            "resource_type": self.resource_type.value,
            "resource_id": self.resource_id,
            "resource_name": self.resource_name,
            "status": self.status.value,
            "error_message": self.error_message,
            "ip_address": self.ip_address,
        }

        # Store details as JSON string
        if self.details:
            import json
            entity["details"] = json.dumps(self.details)

        return entity

    @classmethod
    def from_table_entity(cls, entity: dict) -> "AuditLog":
        """Create from Azure Table Storage entity."""
        import json

        details = None
        if entity.get("details"):
            try:
                details = json.loads(entity["details"])
            except (json.JSONDecodeError, TypeError):
                details = None

        return cls(
            id=entity["id"],
            timestamp=datetime.fromisoformat(entity["timestamp"]),
            user_id=entity["user_id"],
            user_email=entity["user_email"],
            action=AuditAction(entity["action"]),
            resource_type=AuditResourceType(entity["resource_type"]),
            resource_id=entity["resource_id"],
            resource_name=entity["resource_name"],
            details=details,
            status=AuditStatus(entity.get("status", "success")),
            error_message=entity.get("error_message"),
            ip_address=entity.get("ip_address"),
        )


class AuditLogCreate(BaseModel):
    """Input model for creating an audit log entry."""

    user_id: str
    user_email: str
    action: AuditAction
    resource_type: AuditResourceType
    resource_id: str
    resource_name: str
    details: Optional[dict[str, Any]] = None
    status: AuditStatus = AuditStatus.SUCCESS
    error_message: Optional[str] = None
    ip_address: Optional[str] = None
