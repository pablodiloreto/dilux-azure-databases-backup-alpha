"""
Application settings and configuration management.

Loads configuration from environment variables with sensible defaults.
"""

import os
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = Field(default="Dilux Database Backup")
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # Azure Storage
    storage_connection_string: str = Field(
        default="UseDevelopmentStorage=true",
        alias="STORAGE_CONNECTION_STRING"
    )
    backup_container_name: str = Field(default="backups")
    backup_queue_name: str = Field(default="backup-jobs")
    history_table_name: str = Field(default="backuphistory")
    config_table_name: str = Field(default="databaseconfigs")

    # Azure Functions
    azure_functions_environment: str = Field(default="Development")

    # Backup settings
    backup_retention_days: int = Field(default=30)

    # MySQL (Test Database)
    mysql_host: str = Field(default="mysql")
    mysql_port: int = Field(default=3306)
    mysql_database: str = Field(default="testdb")
    mysql_user: str = Field(default="root")
    mysql_password: str = Field(default="DevPassword123!")

    # PostgreSQL (Test Database)
    postgres_host: str = Field(default="postgres")
    postgres_port: int = Field(default=5432)
    postgres_database: str = Field(default="testdb")
    postgres_user: str = Field(default="postgres")
    postgres_password: str = Field(default="DevPassword123!")

    # SQL Server (Test Database)
    sqlserver_host: str = Field(default="sqlserver")
    sqlserver_port: int = Field(default=1433)
    sqlserver_database: str = Field(default="testdb")
    sqlserver_user: str = Field(default="sa")
    sqlserver_password: str = Field(default="DevPassword123!")

    # Azure AD (Optional)
    azure_client_id: Optional[str] = Field(default=None)
    azure_tenant_id: Optional[str] = Field(default=None)
    azure_client_secret: Optional[str] = Field(default=None)

    # Key Vault (Optional)
    keyvault_url: Optional[str] = Field(default=None)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.environment.lower() in ("development", "dev", "local")

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment.lower() in ("production", "prod")

    def get_mysql_connection_string(self) -> str:
        """Get MySQL connection string."""
        return (
            f"Server={self.mysql_host};"
            f"Port={self.mysql_port};"
            f"Database={self.mysql_database};"
            f"Uid={self.mysql_user};"
            f"Pwd={self.mysql_password};"
        )

    def get_postgres_connection_string(self) -> str:
        """Get PostgreSQL connection string."""
        return (
            f"Host={self.postgres_host};"
            f"Port={self.postgres_port};"
            f"Database={self.postgres_database};"
            f"Username={self.postgres_user};"
            f"Password={self.postgres_password};"
        )

    def get_sqlserver_connection_string(self) -> str:
        """Get SQL Server connection string."""
        return (
            f"Server={self.sqlserver_host},{self.sqlserver_port};"
            f"Database={self.sqlserver_database};"
            f"User Id={self.sqlserver_user};"
            f"Password={self.sqlserver_password};"
            f"TrustServerCertificate=True;"
        )


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Uses lru_cache to ensure settings are only loaded once.
    """
    return Settings()
