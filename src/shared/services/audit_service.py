"""
Audit service for logging and querying system actions.

Provides a centralized way to log all actions and query the audit trail.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Any

from azure.core.exceptions import ResourceExistsError

from ..config import AzureClients, get_settings
from ..models import AuditLog, AuditLogCreate, AuditAction, AuditResourceType, AuditStatus

logger = logging.getLogger(__name__)


class AuditService:
    """
    Service for audit log operations.

    Stores audit logs in Azure Table Storage with:
    - PartitionKey: YYYYMM (for efficient date range queries)
    - RowKey: inverted timestamp + uuid (for descending order)
    """

    TABLE_NAME = "auditlogs"

    def __init__(self, azure_clients: Optional[AzureClients] = None):
        """Initialize audit service."""
        from ..config.azure_clients import get_azure_clients

        self._clients = azure_clients or get_azure_clients()
        self._settings = get_settings()
        self._ensure_table_exists()

    def _ensure_table_exists(self):
        """Ensure the audit logs table exists."""
        try:
            table_client = self._clients.get_table_client(self.TABLE_NAME)
            table_client.create_table()
            logger.info(f"Created table: {self.TABLE_NAME}")
        except ResourceExistsError:
            pass
        except Exception as e:
            logger.warning(f"Could not create audit table: {e}")

    # ===========================================
    # Write Operations
    # ===========================================

    def log(
        self,
        user_id: str,
        user_email: str,
        action: AuditAction,
        resource_type: AuditResourceType,
        resource_id: str,
        resource_name: str,
        details: Optional[dict[str, Any]] = None,
        status: AuditStatus = AuditStatus.SUCCESS,
        error_message: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        """
        Log an action to the audit trail.

        Args:
            user_id: ID of the user performing the action (or 'system')
            user_email: Email for display
            action: Type of action
            resource_type: Type of resource affected
            resource_id: ID of the resource
            resource_name: Human-readable name (preserved even if deleted)
            details: Additional context
            status: Success or failed
            error_message: Error message if failed
            ip_address: IP address of the request

        Returns:
            The created AuditLog entry
        """
        audit_log = AuditLog(
            user_id=user_id,
            user_email=user_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_name=resource_name,
            details=details,
            status=status,
            error_message=error_message,
            ip_address=ip_address,
        )

        try:
            table_client = self._clients.get_table_client(self.TABLE_NAME)
            table_client.create_entity(audit_log.to_table_entity())
            logger.debug(f"Audit log created: {action.value} on {resource_type.value}/{resource_id}")
        except Exception as e:
            # Log errors but don't fail the main operation
            logger.error(f"Failed to create audit log: {e}")

        return audit_log

    def log_from_create(self, create_input: AuditLogCreate) -> AuditLog:
        """Log an action from an AuditLogCreate input."""
        return self.log(
            user_id=create_input.user_id,
            user_email=create_input.user_email,
            action=create_input.action,
            resource_type=create_input.resource_type,
            resource_id=create_input.resource_id,
            resource_name=create_input.resource_name,
            details=create_input.details,
            status=create_input.status,
            error_message=create_input.error_message,
            ip_address=create_input.ip_address,
        )

    # ===========================================
    # Read Operations
    # ===========================================

    def get_logs(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        user_id: Optional[str] = None,
        action: Optional[AuditAction] = None,
        resource_type: Optional[AuditResourceType] = None,
        status: Optional[AuditStatus] = None,
        search: Optional[str] = None,
        database_type: Optional[str] = None,
        resource_name: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AuditLog], int]:
        """
        Query audit logs with filters and pagination.

        Args:
            start_date: Filter from date
            end_date: Filter until date
            user_id: Filter by user ID
            action: Filter by action type
            resource_type: Filter by resource type
            status: Filter by status
            search: Search in resource_name and user_email
            database_type: Filter by database type (engine) from details
            resource_name: Filter by resource name (alias) - partial match
            limit: Maximum results per page
            offset: Skip N results

        Returns:
            Tuple of (list of AuditLog, total count)
        """
        table_client = self._clients.get_table_client(self.TABLE_NAME)

        # Build filter conditions
        filters = []

        # Date range filter using PartitionKey (YYYYMM)
        if start_date:
            start_pk = start_date.strftime("%Y%m")
            filters.append(f"PartitionKey ge '{start_pk}'")
        if end_date:
            end_pk = end_date.strftime("%Y%m")
            filters.append(f"PartitionKey le '{end_pk}'")

        # Other filters
        if user_id:
            filters.append(f"user_id eq '{user_id}'")
        if action:
            filters.append(f"action eq '{action.value}'")
        if resource_type:
            filters.append(f"resource_type eq '{resource_type.value}'")
        if status:
            filters.append(f"status eq '{status.value}'")

        # Combine filters
        filter_str = " and ".join(filters) if filters else None

        try:
            # Query entities
            if filter_str:
                entities = list(table_client.query_entities(filter_str))
            else:
                entities = list(table_client.list_entities())

            # Convert to AuditLog objects
            logs = [AuditLog.from_table_entity(e) for e in entities]

            # Apply search filter (client-side for now)
            if search:
                search_lower = search.lower()
                logs = [
                    log for log in logs
                    if search_lower in log.resource_name.lower()
                    or search_lower in log.user_email.lower()
                    or (log.resource_id and search_lower in log.resource_id.lower())
                ]

            # Apply database_type filter (engine) - from details.database_type
            if database_type:
                logs = [
                    log for log in logs
                    if log.details and log.details.get("database_type", "").lower() == database_type.lower()
                ]

            # Apply resource_name filter (alias) - partial match
            if resource_name:
                resource_name_lower = resource_name.lower()
                logs = [
                    log for log in logs
                    if resource_name_lower in log.resource_name.lower()
                ]

            # Apply fine-grained date filter (PartitionKey is month-level)
            if start_date:
                logs = [log for log in logs if log.timestamp >= start_date]
            if end_date:
                # End date should be inclusive (end of day)
                end_of_day = end_date.replace(hour=23, minute=59, second=59)
                logs = [log for log in logs if log.timestamp <= end_of_day]

            # Get total count before pagination
            total = len(logs)

            # Apply pagination
            logs = logs[offset:offset + limit]

            return logs, total

        except Exception as e:
            logger.exception(f"Error querying audit logs: {e}")
            return [], 0

    def get_log_by_id(self, log_id: str) -> Optional[AuditLog]:
        """Get a specific audit log by ID."""
        table_client = self._clients.get_table_client(self.TABLE_NAME)

        try:
            # Search across all partitions
            entities = list(table_client.query_entities(f"id eq '{log_id}'"))
            if entities:
                return AuditLog.from_table_entity(entities[0])
            return None
        except Exception as e:
            logger.exception(f"Error getting audit log {log_id}: {e}")
            return None

    def get_logs_for_resource(
        self,
        resource_type: AuditResourceType,
        resource_id: str,
        limit: int = 50,
    ) -> list[AuditLog]:
        """Get all audit logs for a specific resource."""
        logs, _ = self.get_logs(
            resource_type=resource_type,
            limit=limit,
        )
        # Filter by resource_id (client-side)
        return [log for log in logs if log.resource_id == resource_id]

    def get_logs_for_user(
        self,
        user_id: str,
        limit: int = 50,
    ) -> list[AuditLog]:
        """Get all audit logs for a specific user."""
        logs, _ = self.get_logs(user_id=user_id, limit=limit)
        return logs

    # ===========================================
    # Statistics
    # ===========================================

    def get_stats(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get audit log statistics."""
        logs, total = self.get_logs(
            start_date=start_date,
            end_date=end_date,
            limit=10000,  # Get all for stats
        )

        # Count by action
        by_action: dict[str, int] = {}
        for log in logs:
            action = log.action.value
            by_action[action] = by_action.get(action, 0) + 1

        # Count by resource type
        by_resource: dict[str, int] = {}
        for log in logs:
            rt = log.resource_type.value
            by_resource[rt] = by_resource.get(rt, 0) + 1

        # Count by status
        by_status: dict[str, int] = {}
        for log in logs:
            status = log.status.value
            by_status[status] = by_status.get(status, 0) + 1

        return {
            "total": total,
            "by_action": by_action,
            "by_resource_type": by_resource,
            "by_status": by_status,
        }


# Singleton instance
_audit_service: Optional[AuditService] = None


def get_audit_service() -> AuditService:
    """Get the singleton AuditService instance."""
    global _audit_service
    if _audit_service is None:
        _audit_service = AuditService()
    return _audit_service
