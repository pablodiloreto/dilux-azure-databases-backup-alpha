"""User model for authentication and authorization."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class UserRole(str, Enum):
    """User roles for authorization."""

    ADMIN = "admin"  # Full access: manage users, databases, backups, settings
    OPERATOR = "operator"  # Can trigger backups, view all, but no user management
    VIEWER = "viewer"  # Read-only access to dashboards and history


class User(BaseModel):
    """
    User model for hybrid authentication.

    - Azure AD handles authentication (who you are)
    - This model handles authorization (what you can do)
    """

    # Azure AD identity
    id: str = Field(..., description="Azure AD Object ID (oid claim)")
    email: str = Field(..., description="User email from Azure AD")
    name: str = Field(..., description="Display name from Azure AD")

    # App-managed authorization
    role: UserRole = Field(default=UserRole.VIEWER, description="Application role")
    enabled: bool = Field(default=True, description="Whether user can access the app")

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = Field(default=None)
    created_by: Optional[str] = Field(default=None, description="ID of user who created this user")

    def to_table_entity(self) -> dict:
        """Convert to Azure Table Storage entity."""
        return {
            "PartitionKey": "users",
            "RowKey": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role.value,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "last_login": self.last_login.isoformat() if self.last_login else None,
            "created_by": self.created_by,
        }

    @classmethod
    def from_table_entity(cls, entity: dict) -> "User":
        """Create from Azure Table Storage entity."""
        return cls(
            id=entity["RowKey"],
            email=entity["email"],
            name=entity["name"],
            role=UserRole(entity.get("role", "viewer")),
            enabled=entity.get("enabled", True),
            created_at=datetime.fromisoformat(entity["created_at"])
            if entity.get("created_at")
            else datetime.utcnow(),
            updated_at=datetime.fromisoformat(entity["updated_at"])
            if entity.get("updated_at")
            else datetime.utcnow(),
            last_login=datetime.fromisoformat(entity["last_login"])
            if entity.get("last_login")
            else None,
            created_by=entity.get("created_by"),
        )

    def can_manage_users(self) -> bool:
        """Check if user can manage other users."""
        return self.role == UserRole.ADMIN

    def can_manage_databases(self) -> bool:
        """Check if user can create/edit/delete databases."""
        return self.role in (UserRole.ADMIN, UserRole.OPERATOR)

    def can_trigger_backup(self) -> bool:
        """Check if user can trigger manual backups."""
        return self.role in (UserRole.ADMIN, UserRole.OPERATOR)

    def can_manage_settings(self) -> bool:
        """Check if user can modify app settings."""
        return self.role == UserRole.ADMIN

    def can_view(self) -> bool:
        """Check if user can view dashboards and history."""
        return self.enabled  # All enabled users can view


class CreateUserInput(BaseModel):
    """Input for creating a new user."""

    email: str = Field(..., description="User email (must match Azure AD)")
    name: str = Field(..., description="Display name")
    role: UserRole = Field(default=UserRole.VIEWER)


class UpdateUserInput(BaseModel):
    """Input for updating a user."""

    name: Optional[str] = None
    role: Optional[UserRole] = None
    enabled: Optional[bool] = None
