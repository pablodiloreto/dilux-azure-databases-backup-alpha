"""Services for Dilux Database Backup."""

from .storage_service import StorageService
from .database_config_service import DatabaseConfigService
from .engine_service import EngineService
from .connection_tester import ConnectionTester, ConnectionTestResult, get_connection_tester
from .audit_service import AuditService, get_audit_service

# AzureService requires azure-mgmt-web which is only installed in the API
# Import conditionally to avoid breaking processor/scheduler
try:
    from .azure_service import AzureService, get_azure_service
    _HAS_AZURE_SERVICE = True
except ImportError:
    AzureService = None  # type: ignore
    get_azure_service = None  # type: ignore
    _HAS_AZURE_SERVICE = False

__all__ = [
    "StorageService",
    "DatabaseConfigService",
    "EngineService",
    "ConnectionTester",
    "ConnectionTestResult",
    "get_connection_tester",
    "AuditService",
    "get_audit_service",
    "AzureService",
    "get_azure_service",
]
