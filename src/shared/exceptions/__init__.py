"""Custom exceptions for Dilux Database Backup."""


class DiluxBackupError(Exception):
    """Base exception for all Dilux Backup errors."""

    pass


class ConfigurationError(DiluxBackupError):
    """Error in configuration."""

    pass


class DatabaseConnectionError(DiluxBackupError):
    """Error connecting to a database."""

    def __init__(self, database_type: str, message: str):
        self.database_type = database_type
        super().__init__(f"[{database_type}] {message}")


class BackupExecutionError(DiluxBackupError):
    """Error during backup execution."""

    def __init__(self, database_name: str, message: str, details: str = None):
        self.database_name = database_name
        self.details = details
        super().__init__(f"Backup failed for '{database_name}': {message}")


class StorageError(DiluxBackupError):
    """Error with Azure Storage operations."""

    pass


class AuthenticationError(DiluxBackupError):
    """Error with authentication."""

    pass


class ValidationError(DiluxBackupError):
    """Error in input validation."""

    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f"Validation error for '{field}': {message}")


class NotFoundError(DiluxBackupError):
    """Resource not found."""

    def __init__(self, resource_type: str, resource_id: str):
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(f"{resource_type} '{resource_id}' not found")


class DuplicateError(DiluxBackupError):
    """Duplicate resource error."""

    def __init__(self, resource_type: str, resource_id: str):
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(f"{resource_type} '{resource_id}' already exists")


__all__ = [
    "DiluxBackupError",
    "ConfigurationError",
    "DatabaseConnectionError",
    "BackupExecutionError",
    "StorageError",
    "AuthenticationError",
    "ValidationError",
    "NotFoundError",
    "DuplicateError",
]
