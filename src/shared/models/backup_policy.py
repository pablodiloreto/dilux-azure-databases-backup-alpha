"""
Backup Policy models.

Defines backup policies that combine schedule and retention for each tier.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from .backup import BackupTier


class DayOfWeek(int, Enum):
    """Days of the week (0 = Sunday, matching JS convention)."""

    SUNDAY = 0
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6


class TierConfig(BaseModel):
    """Configuration for a single backup tier."""

    enabled: bool = Field(default=False, description="Whether this tier is enabled")
    keep_count: int = Field(default=0, ge=0, description="Number of backups to retain")

    # Schedule configuration (meaning depends on tier)
    # Hourly: interval_hours = how often (1, 2, 4, 6, 12)
    # Daily: time = "HH:MM"
    # Weekly: day_of_week (0-6) + time
    # Monthly: day_of_month (1-28) + time
    # Yearly: month (1-12) + day_of_month + time

    interval_hours: Optional[int] = Field(
        default=1, ge=1, le=12, description="Hours between backups (hourly tier only)"
    )
    time: Optional[str] = Field(
        default="02:00",
        pattern=r"^\d{2}:\d{2}$",
        description="Time of day HH:MM (daily/weekly/monthly/yearly)",
    )
    day_of_week: Optional[int] = Field(
        default=0, ge=0, le=6, description="Day of week 0=Sun (weekly tier)"
    )
    day_of_month: Optional[int] = Field(
        default=1, ge=1, le=28, description="Day of month 1-28 (monthly/yearly tier)"
    )
    month: Optional[int] = Field(
        default=1, ge=1, le=12, description="Month 1-12 (yearly tier)"
    )

    def get_schedule_description(self, tier: BackupTier) -> str:
        """Get human-readable schedule description."""
        if not self.enabled:
            return "Disabled"

        if tier == BackupTier.HOURLY:
            if self.interval_hours == 1:
                return "Every hour"
            return f"Every {self.interval_hours} hours"

        if tier == BackupTier.DAILY:
            return f"Daily at {self.time}"

        if tier == BackupTier.WEEKLY:
            days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            day_name = days[self.day_of_week or 0]
            return f"Every {day_name} at {self.time}"

        if tier == BackupTier.MONTHLY:
            return f"Day {self.day_of_month} at {self.time}"

        if tier == BackupTier.YEARLY:
            months = [
                "",
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
            ]
            month_name = months[self.month or 1]
            return f"{month_name} {self.day_of_month} at {self.time}"

        return "Unknown"


class BackupPolicy(BaseModel):
    """
    Backup Policy that defines schedule and retention for all tiers.

    Stored in Azure Table Storage with:
    - PartitionKey: "backup_policy"
    - RowKey: policy ID
    """

    id: str = Field(..., description="Unique identifier for the policy")
    name: str = Field(..., description="Display name for the policy")
    description: Optional[str] = Field(default=None, description="Policy description")
    is_system: bool = Field(
        default=False, description="Whether this is a system-defined policy"
    )

    # Tier configurations
    hourly: TierConfig = Field(default_factory=TierConfig)
    daily: TierConfig = Field(default_factory=TierConfig)
    weekly: TierConfig = Field(default_factory=TierConfig)
    monthly: TierConfig = Field(default_factory=TierConfig)
    yearly: TierConfig = Field(default_factory=TierConfig)

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def get_summary(self) -> str:
        """Get compact summary like '24h/15d/8w/4m/2y'."""
        parts = []
        if self.hourly.enabled and self.hourly.keep_count > 0:
            parts.append(f"{self.hourly.keep_count}h")
        if self.daily.enabled and self.daily.keep_count > 0:
            parts.append(f"{self.daily.keep_count}d")
        if self.weekly.enabled and self.weekly.keep_count > 0:
            parts.append(f"{self.weekly.keep_count}w")
        if self.monthly.enabled and self.monthly.keep_count > 0:
            parts.append(f"{self.monthly.keep_count}m")
        if self.yearly.enabled and self.yearly.keep_count > 0:
            parts.append(f"{self.yearly.keep_count}y")
        return "/".join(parts) if parts else "No retention"

    def to_table_entity(self) -> dict:
        """Convert to Azure Table Storage entity format."""
        return {
            "PartitionKey": "backup_policy",
            "RowKey": self.id,
            "name": self.name,
            "description": self.description or "",
            "is_system": self.is_system,
            # Hourly tier
            "hourly_enabled": self.hourly.enabled,
            "hourly_keep_count": self.hourly.keep_count,
            "hourly_interval_hours": self.hourly.interval_hours or 1,
            # Daily tier
            "daily_enabled": self.daily.enabled,
            "daily_keep_count": self.daily.keep_count,
            "daily_time": self.daily.time or "02:00",
            # Weekly tier
            "weekly_enabled": self.weekly.enabled,
            "weekly_keep_count": self.weekly.keep_count,
            "weekly_day_of_week": self.weekly.day_of_week or 0,
            "weekly_time": self.weekly.time or "03:00",
            # Monthly tier
            "monthly_enabled": self.monthly.enabled,
            "monthly_keep_count": self.monthly.keep_count,
            "monthly_day_of_month": self.monthly.day_of_month or 1,
            "monthly_time": self.monthly.time or "04:00",
            # Yearly tier
            "yearly_enabled": self.yearly.enabled,
            "yearly_keep_count": self.yearly.keep_count,
            "yearly_month": self.yearly.month or 1,
            "yearly_day_of_month": self.yearly.day_of_month or 1,
            "yearly_time": self.yearly.time or "05:00",
            # Metadata
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    @classmethod
    def from_table_entity(cls, entity: dict) -> "BackupPolicy":
        """Create instance from Azure Table Storage entity."""
        return cls(
            id=entity["RowKey"],
            name=entity["name"],
            description=entity.get("description") or None,
            is_system=entity.get("is_system", False),
            hourly=TierConfig(
                enabled=entity.get("hourly_enabled", False),
                keep_count=entity.get("hourly_keep_count", 0),
                interval_hours=entity.get("hourly_interval_hours", 1),
            ),
            daily=TierConfig(
                enabled=entity.get("daily_enabled", False),
                keep_count=entity.get("daily_keep_count", 0),
                time=entity.get("daily_time", "02:00"),
            ),
            weekly=TierConfig(
                enabled=entity.get("weekly_enabled", False),
                keep_count=entity.get("weekly_keep_count", 0),
                day_of_week=entity.get("weekly_day_of_week", 0),
                time=entity.get("weekly_time", "03:00"),
            ),
            monthly=TierConfig(
                enabled=entity.get("monthly_enabled", False),
                keep_count=entity.get("monthly_keep_count", 0),
                day_of_month=entity.get("monthly_day_of_month", 1),
                time=entity.get("monthly_time", "04:00"),
            ),
            yearly=TierConfig(
                enabled=entity.get("yearly_enabled", False),
                keep_count=entity.get("yearly_keep_count", 0),
                month=entity.get("yearly_month", 1),
                day_of_month=entity.get("yearly_day_of_month", 1),
                time=entity.get("yearly_time", "05:00"),
            ),
            created_at=datetime.fromisoformat(entity["created_at"]),
            updated_at=datetime.fromisoformat(entity["updated_at"]),
        )


# ============================================================================
# Default System Policies
# ============================================================================


def get_default_policies() -> list[BackupPolicy]:
    """Get the default system backup policies."""
    now = datetime.utcnow()

    return [
        BackupPolicy(
            id="production-critical",
            name="Production Critical",
            description="Maximum protection for critical databases: hourly + daily + weekly + monthly + yearly backups",
            is_system=True,
            hourly=TierConfig(enabled=True, keep_count=24, interval_hours=1),
            daily=TierConfig(enabled=True, keep_count=15, time="02:00"),
            weekly=TierConfig(enabled=True, keep_count=8, day_of_week=0, time="03:00"),
            monthly=TierConfig(enabled=True, keep_count=4, day_of_month=1, time="04:00"),
            yearly=TierConfig(
                enabled=True, keep_count=2, month=1, day_of_month=1, time="05:00"
            ),
            created_at=now,
            updated_at=now,
        ),
        BackupPolicy(
            id="production-standard",
            name="Production Standard",
            description="Balanced protection for production databases",
            is_system=True,
            hourly=TierConfig(enabled=True, keep_count=12, interval_hours=1),
            daily=TierConfig(enabled=True, keep_count=7, time="02:00"),
            weekly=TierConfig(enabled=True, keep_count=4, day_of_week=0, time="03:00"),
            monthly=TierConfig(enabled=True, keep_count=2, day_of_month=1, time="04:00"),
            yearly=TierConfig(
                enabled=True, keep_count=1, month=1, day_of_month=1, time="05:00"
            ),
            created_at=now,
            updated_at=now,
        ),
        BackupPolicy(
            id="development",
            name="Development",
            description="Minimal backups for development/test databases",
            is_system=True,
            hourly=TierConfig(enabled=False, keep_count=0),
            daily=TierConfig(enabled=True, keep_count=7, time="02:00"),
            weekly=TierConfig(enabled=True, keep_count=2, day_of_week=0, time="03:00"),
            monthly=TierConfig(enabled=False, keep_count=0),
            yearly=TierConfig(enabled=False, keep_count=0),
            created_at=now,
            updated_at=now,
        ),
    ]
