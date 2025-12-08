#!/usr/bin/env python3
"""
Reset and Seed Script for Dilux Database Backup Solution

This script:
1. Resets all Azure Storage data (tables, blobs, queues)
2. Creates test databases with ~100-200MB of data in Docker
3. Seeds the application with realistic test data:
   - 3 Servers (MySQL, PostgreSQL, SQL Server)
   - 9 Databases (3 per engine)
   - 3 Users (admin, operator, viewer)
   - 60 days of backup history with real backup files
   - ~500 audit log entries

Usage:
    python scripts/reset-and-seed.py           # Full reset + seed
    python scripts/reset-and-seed.py --seed-only    # Only seed (no reset)
    python scripts/reset-and-seed.py --reset-only   # Only reset (no seed)
    python scripts/reset-and-seed.py --skip-backups # Skip generating backup files (faster)
"""

import argparse
import gzip
import json
import logging
import os
import random
import subprocess
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

# Add shared package to path
shared_path = Path(__file__).parent.parent / "src" / "shared"
sys.path.insert(0, str(shared_path))

from azure.data.tables import TableServiceClient
from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.storage.queue import QueueServiceClient

# Configure logging - suppress Azure SDK verbose output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Suppress Azure SDK verbose logging
logging.getLogger("azure").setLevel(logging.WARNING)
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)

# =============================================================================
# Configuration
# =============================================================================

AZURITE_CONNECTION_STRING = (
    "DefaultEndpointsProtocol=http;"
    "AccountName=devstoreaccount1;"
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
    "BlobEndpoint=http://azurite:10000/devstoreaccount1;"
    "QueueEndpoint=http://azurite:10001/devstoreaccount1;"
    "TableEndpoint=http://azurite:10002/devstoreaccount1;"
)

# Docker container names
MYSQL_CONTAINER = "dilux-mysql"
POSTGRES_CONTAINER = "dilux-postgres"
SQLSERVER_CONTAINER = "dilux-sqlserver"

# Database credentials
DB_PASSWORD = "DevPassword123!"
SQLSERVER_PASSWORD = "YourStrong@Passw0rd"

# Table names
# Note: engines and databases are both stored in "databaseconfigs" table with different PartitionKeys
TABLES = [
    "databaseconfigs",  # Contains both engines (PartitionKey='engine') and databases (PartitionKey='database')
    "backuphistory",
    "backuppolicies",
    "auditlogs",
    "users",
    "settings",
    "accessrequests",
]

# Blob containers
CONTAINERS = ["backups"]

# Queue names
QUEUES = ["backup-jobs"]

# =============================================================================
# Database Schemas for Seed Data
# =============================================================================

# Databases to create in Docker with test data
DOCKER_DATABASES = {
    "mysql": [
        {"name": "ecommerce_db", "size_mb": 150},
        {"name": "analytics_db", "size_mb": 100},
        {"name": "staging_db", "size_mb": 50},
    ],
    "postgresql": [
        {"name": "users_db", "size_mb": 120},
        {"name": "inventory_db", "size_mb": 80},
        {"name": "logs_db", "size_mb": 200},
    ],
    "sqlserver": [
        {"name": "finance_db", "size_mb": 180},
        {"name": "reports_db", "size_mb": 100},
        {"name": "dev_db", "size_mb": 40},
    ],
}

# Server configurations
SERVERS = [
    {
        "id": "srv-mysql-prod",
        "name": "MySQL Production",
        "engine_type": "mysql",
        "host": "mysql",  # Docker Compose service name
        "port": 3306,
        "username": "root",
        "password": DB_PASSWORD,
        "policy_id": "production-critical",
    },
    {
        "id": "srv-postgres-prod",
        "name": "PostgreSQL Production",
        "engine_type": "postgresql",
        "host": "postgres",  # Docker Compose service name
        "port": 5432,
        "username": "postgres",
        "password": DB_PASSWORD,
        "policy_id": "production-standard",
    },
    {
        "id": "srv-sqlserver-prod",
        "name": "SQL Server Production",
        "engine_type": "sqlserver",
        "host": "sqlserver",  # Docker Compose service name
        "port": 1433,
        "username": "sa",
        "password": SQLSERVER_PASSWORD,
        "policy_id": "production-critical",
    },
]

# Database configurations to seed
DATABASE_CONFIGS = [
    # MySQL databases
    {
        "id": "db-mysql-ecommerce",
        "name": "E-Commerce DB",
        "database_type": "mysql",
        "engine_id": "srv-mysql-prod",
        "database_name": "ecommerce_db",
        "use_engine_credentials": True,
        "use_engine_policy": True,  # Inherits production-critical from server
        "policy_id": None,
        "enabled": True,
        "compression": True,
    },
    {
        "id": "db-mysql-analytics",
        "name": "Analytics DB",
        "database_type": "mysql",
        "engine_id": "srv-mysql-prod",
        "database_name": "analytics_db",
        "use_engine_credentials": True,
        "use_engine_policy": False,
        "policy_id": "production-standard",
        "enabled": True,
        "compression": True,
    },
    {
        "id": "db-mysql-staging",
        "name": "Staging DB",
        "database_type": "mysql",
        "engine_id": "srv-mysql-prod",
        "database_name": "staging_db",
        "use_engine_credentials": True,
        "use_engine_policy": False,
        "policy_id": "development",
        "enabled": True,
        "compression": True,
    },
    # PostgreSQL databases
    {
        "id": "db-postgres-users",
        "name": "Users DB",
        "database_type": "postgresql",
        "engine_id": "srv-postgres-prod",
        "database_name": "users_db",
        "use_engine_credentials": True,
        "use_engine_policy": True,  # Inherits production-standard from server
        "policy_id": None,
        "enabled": True,
        "compression": True,
    },
    {
        "id": "db-postgres-inventory",
        "name": "Inventory DB",
        "database_type": "postgresql",
        "engine_id": "srv-postgres-prod",
        "database_name": "inventory_db",
        "use_engine_credentials": True,
        "use_engine_policy": False,
        "policy_id": "production-standard",
        "enabled": True,
        "compression": True,
    },
    {
        "id": "db-postgres-logs",
        "name": "Logs DB",
        "database_type": "postgresql",
        "engine_id": "srv-postgres-prod",
        "database_name": "logs_db",
        "use_engine_credentials": True,
        "use_engine_policy": False,
        "policy_id": "development",
        "enabled": False,  # Disabled - for testing
        "compression": True,
    },
    # SQL Server databases
    {
        "id": "db-sqlserver-finance",
        "name": "Finance DB",
        "database_type": "sqlserver",
        "engine_id": "srv-sqlserver-prod",
        "database_name": "finance_db",
        "use_engine_credentials": True,
        "use_engine_policy": True,  # Inherits production-critical from server
        "policy_id": None,
        "enabled": True,
        "compression": True,
    },
    {
        "id": "db-sqlserver-reports",
        "name": "Reports DB",
        "database_type": "sqlserver",
        "engine_id": "srv-sqlserver-prod",
        "database_name": "reports_db",
        "use_engine_credentials": True,
        "use_engine_policy": False,
        "policy_id": "production-standard",
        "enabled": True,
        "compression": True,
    },
    {
        "id": "db-sqlserver-dev",
        "name": "Dev DB",
        "database_type": "sqlserver",
        "engine_id": "srv-sqlserver-prod",
        "database_name": "dev_db",
        "use_engine_credentials": True,
        "use_engine_policy": False,
        "policy_id": "development",
        "enabled": True,
        "compression": False,  # No compression - for testing
    },
]

# Users to seed
USERS = [
    {
        "id": "user-admin",
        "email": "admin@dilux.com",
        "name": "Admin User",
        "role": "admin",
        "enabled": True,
    },
    {
        "id": "user-operator",
        "email": "operator@dilux.com",
        "name": "Backup Operator",
        "role": "operator",
        "enabled": True,
    },
    {
        "id": "user-viewer",
        "email": "viewer@dilux.com",
        "name": "Read Only User",
        "role": "viewer",
        "enabled": True,
    },
]

# Default backup policies (system policies)
BACKUP_POLICIES = [
    {
        "id": "production-critical",
        "name": "Production Critical",
        "description": "Maximum protection for critical production databases",
        "is_system": True,
        "hourly": {"enabled": True, "keep_count": 24, "interval_hours": 1},
        "daily": {"enabled": True, "keep_count": 15, "time": "02:00"},
        "weekly": {"enabled": True, "keep_count": 8, "time": "03:00", "day_of_week": 0},
        "monthly": {"enabled": True, "keep_count": 4, "time": "04:00", "day_of_month": 1},
        "yearly": {"enabled": True, "keep_count": 2, "time": "05:00", "day_of_month": 1, "month": 1},
    },
    {
        "id": "production-standard",
        "name": "Production Standard",
        "description": "Balanced protection for standard production databases",
        "is_system": True,
        "hourly": {"enabled": True, "keep_count": 12, "interval_hours": 2},
        "daily": {"enabled": True, "keep_count": 7, "time": "02:00"},
        "weekly": {"enabled": True, "keep_count": 4, "time": "03:00", "day_of_week": 0},
        "monthly": {"enabled": True, "keep_count": 2, "time": "04:00", "day_of_month": 1},
        "yearly": {"enabled": True, "keep_count": 1, "time": "05:00", "day_of_month": 1, "month": 1},
    },
    {
        "id": "development",
        "name": "Development",
        "description": "Minimal backups for development databases",
        "is_system": True,
        "hourly": {"enabled": False, "keep_count": 0},
        "daily": {"enabled": True, "keep_count": 7, "time": "02:00"},
        "weekly": {"enabled": True, "keep_count": 2, "time": "03:00", "day_of_week": 0},
        "monthly": {"enabled": False, "keep_count": 0},
        "yearly": {"enabled": False, "keep_count": 0},
    },
]


# =============================================================================
# Reset Functions
# =============================================================================

def reset_tables(table_service: TableServiceClient):
    """Delete and recreate all tables."""
    logger.info("Resetting tables...")

    for table_name in TABLES:
        try:
            table_service.delete_table(table_name)
            logger.info(f"  Deleted table: {table_name}")
        except Exception:
            pass  # Table doesn't exist

    # Wait a bit for deletions to propagate
    import time
    time.sleep(2)

    for table_name in TABLES:
        try:
            table_service.create_table(table_name)
            logger.info(f"  Created table: {table_name}")
        except Exception as e:
            logger.warning(f"  Could not create table {table_name}: {e}")


def reset_blobs(blob_service: BlobServiceClient):
    """Delete all blobs and recreate containers."""
    logger.info("Resetting blob containers...")

    for container_name in CONTAINERS:
        try:
            container = blob_service.get_container_client(container_name)
            # Delete all blobs
            blobs = list(container.list_blobs())
            for blob in blobs:
                container.delete_blob(blob.name)
            logger.info(f"  Deleted {len(blobs)} blobs from: {container_name}")
        except Exception:
            pass

        try:
            blob_service.create_container(container_name)
            logger.info(f"  Created container: {container_name}")
        except Exception:
            pass  # Already exists


def reset_queues(queue_service: QueueServiceClient):
    """Clear all queues."""
    logger.info("Resetting queues...")

    for queue_name in QUEUES:
        try:
            queue = queue_service.get_queue_client(queue_name)
            queue.clear_messages()
            logger.info(f"  Cleared queue: {queue_name}")
        except Exception:
            pass

        try:
            queue_service.create_queue(queue_name)
            logger.info(f"  Created queue: {queue_name}")
        except Exception:
            pass


def reset_all():
    """Reset all Azure Storage data."""
    logger.info("=" * 60)
    logger.info("RESETTING ALL DATA")
    logger.info("=" * 60)

    table_service = TableServiceClient.from_connection_string(AZURITE_CONNECTION_STRING)
    blob_service = BlobServiceClient.from_connection_string(AZURITE_CONNECTION_STRING)
    queue_service = QueueServiceClient.from_connection_string(AZURITE_CONNECTION_STRING)

    reset_tables(table_service)
    reset_blobs(blob_service)
    reset_queues(queue_service)

    logger.info("Reset complete!")


# =============================================================================
# Docker Database Setup Functions
# =============================================================================

def run_docker_command(container: str, command: str, check: bool = True) -> str:
    """Run a command in a Docker container."""
    full_command = f"docker exec {container} {command}"
    result = subprocess.run(
        full_command,
        shell=True,
        capture_output=True,
        text=True
    )
    if check and result.returncode != 0:
        logger.error(f"Command failed: {full_command}")
        logger.error(f"Error: {result.stderr}")
        raise Exception(f"Docker command failed: {result.stderr}")
    return result.stdout


def create_mysql_database(db_name: str, size_mb: int):
    """Create a MySQL database with test data."""
    logger.info(f"  Creating MySQL database: {db_name} (~{size_mb}MB)")

    # Create database
    run_docker_command(
        MYSQL_CONTAINER,
        f"mysql -u root -p{DB_PASSWORD} -e \"CREATE DATABASE IF NOT EXISTS {db_name};\""
    )

    # Create tables and insert data
    # Each row is approximately 1KB, so we need size_mb * 1000 rows
    rows_needed = size_mb * 1000
    batch_size = 10000

    # Create table
    create_table_sql = f"""
    CREATE TABLE IF NOT EXISTS {db_name}.test_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(36),
        name VARCHAR(255),
        email VARCHAR(255),
        description TEXT,
        amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data JSON,
        INDEX idx_uuid (uuid),
        INDEX idx_created (created_at)
    );
    """
    run_docker_command(
        MYSQL_CONTAINER,
        f"mysql -u root -p{DB_PASSWORD} -e \"{create_table_sql}\""
    )

    # Insert data in batches
    inserted = 0
    while inserted < rows_needed:
        batch = min(batch_size, rows_needed - inserted)
        insert_sql = f"""
        INSERT INTO {db_name}.test_data (uuid, name, email, description, amount, data)
        SELECT
            UUID(),
            CONCAT('User_', FLOOR(RAND() * 1000000)),
            CONCAT('user', FLOOR(RAND() * 1000000), '@example.com'),
            REPEAT('Lorem ipsum dolor sit amet. ', 10),
            ROUND(RAND() * 10000, 2),
            JSON_OBJECT('key', FLOOR(RAND() * 1000), 'value', UUID())
        FROM information_schema.tables t1, information_schema.tables t2
        LIMIT {batch};
        """
        run_docker_command(
            MYSQL_CONTAINER,
            f"mysql -u root -p{DB_PASSWORD} -e \"{insert_sql}\""
        )
        inserted += batch
        if inserted % 50000 == 0:
            logger.info(f"    Inserted {inserted}/{rows_needed} rows...")


def create_postgresql_database(db_name: str, size_mb: int):
    """Create a PostgreSQL database with test data."""
    logger.info(f"  Creating PostgreSQL database: {db_name} (~{size_mb}MB)")

    # Create database (use bash -c for proper pipe handling)
    run_docker_command(
        POSTGRES_CONTAINER,
        f"bash -c \"psql -U postgres -tc \\\"SELECT 1 FROM pg_database WHERE datname='{db_name}'\\\" | grep -q 1 || psql -U postgres -c \\\"CREATE DATABASE {db_name}\\\"\"",
        check=False
    )

    # Create table
    create_table_sql = f"""
    CREATE TABLE IF NOT EXISTS test_data (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        email VARCHAR(255),
        description TEXT,
        amount DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data JSONB
    );
    CREATE INDEX IF NOT EXISTS idx_uuid ON test_data(uuid);
    CREATE INDEX IF NOT EXISTS idx_created ON test_data(created_at);
    """
    run_docker_command(
        POSTGRES_CONTAINER,
        f"psql -U postgres -d {db_name} -c \"{create_table_sql}\""
    )

    # Insert data
    rows_needed = size_mb * 1000
    batch_size = 10000
    inserted = 0

    while inserted < rows_needed:
        batch = min(batch_size, rows_needed - inserted)
        insert_sql = f"""
        INSERT INTO test_data (name, email, description, amount, data)
        SELECT
            'User_' || (random() * 1000000)::int,
            'user' || (random() * 1000000)::int || '@example.com',
            repeat('Lorem ipsum dolor sit amet. ', 10),
            round((random() * 10000)::numeric, 2),
            jsonb_build_object('key', (random() * 1000)::int, 'value', gen_random_uuid()::text)
        FROM generate_series(1, {batch});
        """
        run_docker_command(
            POSTGRES_CONTAINER,
            f"psql -U postgres -d {db_name} -c \"{insert_sql}\""
        )
        inserted += batch
        if inserted % 50000 == 0:
            logger.info(f"    Inserted {inserted}/{rows_needed} rows...")


def create_sqlserver_database(db_name: str, size_mb: int):
    """Create a SQL Server database with test data."""
    logger.info(f"  Creating SQL Server database: {db_name} (~{size_mb}MB)")

    sqlcmd = f"/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '{SQLSERVER_PASSWORD}' -C"

    # Create database
    run_docker_command(
        SQLSERVER_CONTAINER,
        f"{sqlcmd} -Q \"IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '{db_name}') CREATE DATABASE {db_name}\""
    )

    # Create table
    create_table_sql = f"""
    USE {db_name};
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='test_data' AND xtype='U')
    CREATE TABLE test_data (
        id INT IDENTITY(1,1) PRIMARY KEY,
        uuid UNIQUEIDENTIFIER DEFAULT NEWID(),
        name NVARCHAR(255),
        email NVARCHAR(255),
        description NVARCHAR(MAX),
        amount DECIMAL(10,2),
        created_at DATETIME DEFAULT GETDATE(),
        data NVARCHAR(MAX)
    );
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_uuid')
    CREATE INDEX idx_uuid ON test_data(uuid);
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_created')
    CREATE INDEX idx_created ON test_data(created_at);
    """
    run_docker_command(
        SQLSERVER_CONTAINER,
        f"{sqlcmd} -Q \"{create_table_sql}\""
    )

    # Insert data in smaller batches (SQL Server is slower)
    rows_needed = size_mb * 1000
    batch_size = 5000
    inserted = 0

    while inserted < rows_needed:
        batch = min(batch_size, rows_needed - inserted)
        # SQL Server doesn't have generate_series, use a different approach
        # Note: JSON pattern must be built separately to avoid f-string escaping issues
        json_concat = "CONCAT('{" + '"' + "key" + '"' + ":', ABS(CHECKSUM(NEWID())) % 1000, '," + '"' + "value" + '"' + ":" + '"' + "', NEWID(), '" + '"' + "}')"
        insert_sql = f"""
        USE {db_name};
        SET NOCOUNT ON;
        DECLARE @i INT = 0;
        WHILE @i < {batch}
        BEGIN
            INSERT INTO test_data (name, email, description, amount, data)
            VALUES (
                CONCAT('User_', ABS(CHECKSUM(NEWID())) % 1000000),
                CONCAT('user', ABS(CHECKSUM(NEWID())) % 1000000, '@example.com'),
                REPLICATE('Lorem ipsum dolor sit amet. ', 10),
                ROUND(RAND() * 10000, 2),
                {json_concat}
            );
            SET @i = @i + 1;
        END
        """
        run_docker_command(
            SQLSERVER_CONTAINER,
            f"{sqlcmd} -Q \"{insert_sql}\""
        )
        inserted += batch
        if inserted % 20000 == 0:
            logger.info(f"    Inserted {inserted}/{rows_needed} rows...")


def setup_docker_databases():
    """Create all test databases in Docker containers."""
    logger.info("=" * 60)
    logger.info("SETTING UP DOCKER DATABASES")
    logger.info("=" * 60)

    logger.info("Creating MySQL databases...")
    for db in DOCKER_DATABASES["mysql"]:
        create_mysql_database(db["name"], db["size_mb"])

    logger.info("Creating PostgreSQL databases...")
    for db in DOCKER_DATABASES["postgresql"]:
        create_postgresql_database(db["name"], db["size_mb"])

    logger.info("Creating SQL Server databases...")
    for db in DOCKER_DATABASES["sqlserver"]:
        create_sqlserver_database(db["name"], db["size_mb"])

    logger.info("Docker databases setup complete!")


# =============================================================================
# Seed Functions
# =============================================================================

def seed_backup_policies(table_service: TableServiceClient):
    """Seed default backup policies."""
    logger.info("Seeding backup policies...")
    table = table_service.get_table_client("backuppolicies")

    now = datetime.utcnow().isoformat()

    for policy in BACKUP_POLICIES:
        # Use flat structure matching BackupPolicy.to_table_entity() format
        entity = {
            "PartitionKey": "backup_policy",
            "RowKey": policy["id"],
            "name": policy["name"],
            "description": policy.get("description", ""),
            "is_system": policy["is_system"],
            # Hourly tier
            "hourly_enabled": policy["hourly"].get("enabled", False),
            "hourly_keep_count": policy["hourly"].get("keep_count", 0),
            "hourly_interval_hours": policy["hourly"].get("interval_hours", 1),
            # Daily tier
            "daily_enabled": policy["daily"].get("enabled", False),
            "daily_keep_count": policy["daily"].get("keep_count", 0),
            "daily_time": policy["daily"].get("time", "02:00"),
            # Weekly tier
            "weekly_enabled": policy["weekly"].get("enabled", False),
            "weekly_keep_count": policy["weekly"].get("keep_count", 0),
            "weekly_day_of_week": policy["weekly"].get("day_of_week", 0),
            "weekly_time": policy["weekly"].get("time", "03:00"),
            # Monthly tier
            "monthly_enabled": policy["monthly"].get("enabled", False),
            "monthly_keep_count": policy["monthly"].get("keep_count", 0),
            "monthly_day_of_month": policy["monthly"].get("day_of_month", 1),
            "monthly_time": policy["monthly"].get("time", "04:00"),
            # Yearly tier
            "yearly_enabled": policy["yearly"].get("enabled", False),
            "yearly_keep_count": policy["yearly"].get("keep_count", 0),
            "yearly_month": policy["yearly"].get("month", 1),
            "yearly_day_of_month": policy["yearly"].get("day_of_month", 1),
            "yearly_time": policy["yearly"].get("time", "05:00"),
            # Metadata
            "created_at": now,
            "updated_at": now,
        }
        table.upsert_entity(entity)
        logger.info(f"  Created policy: {policy['name']}")


def seed_servers(table_service: TableServiceClient):
    """Seed server (engine) configurations."""
    logger.info("Seeding servers...")
    table = table_service.get_table_client("databaseconfigs")

    now = datetime.utcnow().isoformat()

    for server in SERVERS:
        entity = {
            "PartitionKey": "engine",
            "RowKey": server["id"],
            "name": server["name"],
            "engine_type": server["engine_type"],
            "host": server["host"],
            "port": server["port"],
            "auth_method": "user_password",
            "username": server["username"],
            "password": server["password"],
            "password_secret_name": "",
            "connection_string": "",
            "policy_id": server.get("policy_id", ""),
            "discovery_enabled": True,
            "last_discovery": "",
            "created_at": now,
            "updated_at": now,
            "created_by": "seed-script",
        }
        table.upsert_entity(entity)
        logger.info(f"  Created server: {server['name']}")


def seed_databases(table_service: TableServiceClient):
    """Seed database configurations."""
    logger.info("Seeding database configurations...")
    table = table_service.get_table_client("databaseconfigs")

    now = datetime.utcnow().isoformat()

    # Get server info for host/port
    server_map = {s["id"]: s for s in SERVERS}

    for db in DATABASE_CONFIGS:
        server = server_map[db["engine_id"]]
        entity = {
            "PartitionKey": "database",
            "RowKey": db["id"],
            "name": db["name"],
            "database_type": db["database_type"],
            "engine_id": db["engine_id"],
            "use_engine_credentials": db["use_engine_credentials"],
            "host": server["host"],
            "port": server["port"],
            "database_name": db["database_name"],
            "auth_method": "",
            "username": server["username"] if db["use_engine_credentials"] else "",
            "password": server["password"] if db["use_engine_credentials"] else "",
            "password_secret_name": "",
            "policy_id": db["policy_id"] or "",
            "use_engine_policy": db["use_engine_policy"],
            "enabled": db["enabled"],
            "schedule": "",
            "retention_days": 0,
            "backup_destination": "",
            "compression": db["compression"],
            "tags": "{}",
            "created_at": now,
            "updated_at": now,
            "created_by": "seed-script",
        }
        table.upsert_entity(entity)
        logger.info(f"  Created database: {db['name']}")


def seed_users(table_service: TableServiceClient):
    """Seed user accounts."""
    logger.info("Seeding users...")
    table = table_service.get_table_client("users")

    now = datetime.utcnow().isoformat()

    for user in USERS:
        entity = {
            "PartitionKey": "user",
            "RowKey": user["id"],
            "email": user["email"],
            "name": user["name"],
            "role": user["role"],
            "enabled": user["enabled"],
            "dark_mode": False,
            "page_size": 25,
            "created_at": now,
            "updated_at": now,
            "last_login": now,
            "created_by": "seed-script",
        }
        table.upsert_entity(entity)
        logger.info(f"  Created user: {user['email']} ({user['role']})")


def seed_settings(table_service: TableServiceClient):
    """Seed application settings."""
    logger.info("Seeding settings...")
    table = table_service.get_table_client("settings")

    now = datetime.utcnow().isoformat()

    entity = {
        "PartitionKey": "settings",
        "RowKey": "global",
        "default_retention_days": 30,
        "default_compression": True,
        "max_concurrent_backups": 5,
        "access_requests_enabled": True,
        "updated_at": now,
    }
    table.upsert_entity(entity)
    logger.info("  Created global settings")


# =============================================================================
# Backup History Generation
# =============================================================================

def generate_backup_history(
    table_service: TableServiceClient,
    blob_service: BlobServiceClient,
    days: int = 60,
    skip_files: bool = False
):
    """Generate realistic backup history for the past N days."""
    logger.info("=" * 60)
    logger.info(f"GENERATING {days} DAYS OF BACKUP HISTORY")
    logger.info("=" * 60)

    history_table = table_service.get_table_client("backuphistory")
    container = blob_service.get_container_client("backups")

    # Ensure container exists
    try:
        container.create_container()
    except Exception:
        pass

    now = datetime.utcnow()
    server_map = {s["id"]: s for s in SERVERS}

    total_backups = 0
    total_size = 0

    for db_config in DATABASE_CONFIGS:
        if not db_config["enabled"]:
            continue

        server = server_map[db_config["engine_id"]]
        db_type = db_config["database_type"]
        db_name = db_config["database_name"]

        # Determine backup frequency based on policy
        policy_id = db_config["policy_id"]
        if db_config["use_engine_policy"]:
            policy_id = server.get("policy_id", "production-standard")

        # Simplified: more backups for critical, fewer for development
        if policy_id == "production-critical":
            backups_per_day = random.randint(2, 4)
        elif policy_id == "production-standard":
            backups_per_day = random.randint(1, 2)
        else:  # development
            backups_per_day = 0.3  # ~2 per week

        logger.info(f"Generating backups for {db_config['name']} ({policy_id})...")

        # Generate backups for each day
        for day_offset in range(days, 0, -1):
            backup_date = now - timedelta(days=day_offset)

            # Random number of backups for this day
            num_backups = int(backups_per_day) if backups_per_day >= 1 else (1 if random.random() < backups_per_day else 0)

            for backup_num in range(num_backups):
                # Random time during the day
                hours = random.randint(0, 23)
                minutes = random.randint(0, 59)
                backup_time = backup_date.replace(hour=hours, minute=minutes, second=0, microsecond=0)

                # Determine tier based on time
                if hours < 6:
                    tier = "daily"
                elif hours % 2 == 0:
                    tier = "hourly"
                else:
                    tier = "hourly"

                # 95% success rate
                is_success = random.random() < 0.95

                # Generate backup
                job_id = str(uuid.uuid4())
                backup_id = str(uuid.uuid4())

                # Create inverted timestamp for RowKey (for proper sorting)
                inverted_ts = str(9999999999 - int(backup_time.timestamp()))
                row_key = f"{db_config['id']}_{inverted_ts}_{backup_id[:8]}"

                if is_success:
                    # Determine file extension
                    if db_type == "mysql":
                        ext = ".sql.gz" if db_config["compression"] else ".sql"
                    elif db_type == "postgresql":
                        ext = ".sql.gz" if db_config["compression"] else ".sql"
                    else:
                        ext = ".bak"

                    blob_name = f"{db_config['id']}/{backup_time.strftime('%Y/%m/%d')}/{backup_id}{ext}"

                    # Generate or skip actual backup file
                    if skip_files:
                        file_size = random.randint(1000000, 50000000)  # 1-50MB fake size
                    else:
                        file_size = create_backup_file(
                            container, blob_name, db_type, server, db_name,
                            db_config["compression"]
                        )

                    total_size += file_size

                    # Create history record
                    duration = random.randint(5, 120)
                    entity = {
                        "PartitionKey": "backup",
                        "RowKey": row_key,
                        "id": backup_id,
                        "job_id": job_id,
                        "database_id": db_config["id"],
                        "database_name": db_config["name"],
                        "database_type": db_type,
                        "engine_id": db_config["engine_id"],
                        "status": "completed",
                        "started_at": backup_time.isoformat(),
                        "completed_at": (backup_time + timedelta(seconds=duration)).isoformat(),
                        "duration_seconds": duration,
                        "blob_name": blob_name,
                        "blob_url": f"http://azurite:10000/devstoreaccount1/backups/{blob_name}",
                        "file_size_bytes": file_size,
                        "file_format": ext.replace(".", ""),
                        "error_message": "",
                        "triggered_by": "scheduler",
                        "tier": tier,
                        "created_at": backup_time.isoformat(),
                    }
                else:
                    # Failed backup
                    error_messages = [
                        "Connection refused",
                        "Authentication failed",
                        "Timeout exceeded",
                        "Disk space full",
                        "Database locked",
                    ]
                    entity = {
                        "PartitionKey": "backup",
                        "RowKey": row_key,
                        "id": backup_id,
                        "job_id": job_id,
                        "database_id": db_config["id"],
                        "database_name": db_config["name"],
                        "database_type": db_type,
                        "engine_id": db_config["engine_id"],
                        "status": "failed",
                        "started_at": backup_time.isoformat(),
                        "completed_at": backup_time.isoformat(),
                        "duration_seconds": random.randint(1, 10),
                        "blob_name": "",
                        "blob_url": "",
                        "file_size_bytes": 0,
                        "file_format": "",
                        "error_message": random.choice(error_messages),
                        "triggered_by": "scheduler",
                        "tier": tier,
                        "created_at": backup_time.isoformat(),
                    }

                history_table.upsert_entity(entity)
                total_backups += 1

        logger.info(f"  Generated backups for {db_config['name']}")

    logger.info(f"Total backups generated: {total_backups}")
    logger.info(f"Total backup size: {total_size / (1024*1024):.2f} MB")


def create_backup_file(
    container,
    blob_name: str,
    db_type: str,
    server: dict,
    db_name: str,
    compress: bool
) -> int:
    """Create an actual backup file and upload to blob storage."""
    import tempfile

    # Create a temporary file for the backup
    with tempfile.NamedTemporaryFile(delete=False, suffix=".sql") as tmp:
        tmp_path = tmp.name

    try:
        if db_type == "mysql":
            # Use mysqldump
            cmd = f"docker exec {MYSQL_CONTAINER} mysqldump -u {server['username']} -p{server['password']} {db_name} --single-transaction --quick"
            result = subprocess.run(cmd, shell=True, capture_output=True)
            with open(tmp_path, 'wb') as f:
                f.write(result.stdout)

        elif db_type == "postgresql":
            # Use pg_dump via docker
            cmd = f"docker exec {POSTGRES_CONTAINER} pg_dump -U {server['username']} {db_name}"
            result = subprocess.run(cmd, shell=True, capture_output=True)
            with open(tmp_path, 'wb') as f:
                f.write(result.stdout)

        else:  # sqlserver
            # For SQL Server, create a simple backup script output
            # Real .bak files require SQL Server backup commands
            sqlcmd = f"/opt/mssql-tools18/bin/sqlcmd -S localhost -U {server['username']} -P '{server['password']}' -C"
            cmd = f"docker exec {SQLSERVER_CONTAINER} {sqlcmd} -Q \"SELECT * FROM {db_name}.INFORMATION_SCHEMA.TABLES\" -s\",\" -W"
            result = subprocess.run(cmd, shell=True, capture_output=True)
            with open(tmp_path, 'wb') as f:
                f.write(result.stdout)

        # Compress if needed
        if compress and db_type in ("mysql", "postgresql"):
            with open(tmp_path, 'rb') as f_in:
                compressed_path = tmp_path + '.gz'
                with gzip.open(compressed_path, 'wb') as f_out:
                    f_out.writelines(f_in)
            os.unlink(tmp_path)
            tmp_path = compressed_path

        # Upload to blob storage
        file_size = os.path.getsize(tmp_path)
        with open(tmp_path, 'rb') as f:
            blob = container.get_blob_client(blob_name)
            content_type = "application/gzip" if compress else "application/sql"
            blob.upload_blob(
                f,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type)
            )

        return file_size

    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# =============================================================================
# Audit Log Generation
# =============================================================================

def generate_audit_logs(table_service: TableServiceClient, days: int = 60, count: int = 500):
    """Generate realistic audit log entries."""
    logger.info(f"Generating {count} audit log entries...")

    table = table_service.get_table_client("auditlogs")
    now = datetime.utcnow()

    # Actions with weights
    actions = [
        ("backup_completed", 0.4),
        ("backup_failed", 0.05),
        ("backup_triggered", 0.1),
        ("backup_downloaded", 0.05),
        ("database_created", 0.02),
        ("database_updated", 0.05),
        ("user_login", 0.2),
        ("settings_updated", 0.03),
    ]

    users = USERS + [{"id": "anonymous", "email": "anonymous"}]
    server_map = {s["id"]: s for s in SERVERS}

    for i in range(count):
        # Random time in the past N days
        random_seconds = random.randint(0, days * 24 * 3600)
        log_time = now - timedelta(seconds=random_seconds)

        # Select action based on weights
        action = random.choices(
            [a[0] for a in actions],
            weights=[a[1] for a in actions]
        )[0]

        # Select user
        user = random.choice(users)

        # Build log entry based on action type
        log_id = str(uuid.uuid4())
        inverted_ts = str(9999999999 - int(log_time.timestamp()))
        row_key = f"{inverted_ts}_{log_id[:8]}"

        if action.startswith("backup"):
            db = random.choice(DATABASE_CONFIGS)
            server = server_map[db["engine_id"]]
            resource_type = "backup"
            resource_id = str(uuid.uuid4())
            resource_name = db["name"]
            details = {
                "database_id": db["id"],
                "database_type": db["database_type"],
                "engine_id": db["engine_id"],
                "host": server["host"],
                "port": server["port"],
            }
        elif action.startswith("database"):
            db = random.choice(DATABASE_CONFIGS)
            server = server_map[db["engine_id"]]
            resource_type = "database"
            resource_id = db["id"]
            resource_name = db["name"]
            details = {
                "database_type": db["database_type"],
                "engine_id": db["engine_id"],
                "host": server["host"],
                "port": server["port"],
            }
        elif action == "user_login":
            resource_type = "user"
            resource_id = user["id"]
            resource_name = user["email"]
            details = {"login_method": "azure_ad"}
        else:
            resource_type = "settings"
            resource_id = "global"
            resource_name = "Global Settings"
            details = {}

        status = "success" if "failed" not in action else "failed"

        entity = {
            "PartitionKey": "audit",
            "RowKey": row_key,
            "id": log_id,
            "timestamp": log_time.isoformat(),
            "user_id": user["id"],
            "user_email": user["email"],
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "resource_name": resource_name,
            "details": json.dumps(details),
            "status": status,
            "error_message": "Backup failed due to connection timeout" if status == "failed" else "",
            "ip_address": f"192.168.1.{random.randint(1, 254)}",
        }

        table.upsert_entity(entity)

        if (i + 1) % 100 == 0:
            logger.info(f"  Generated {i + 1}/{count} audit logs...")

    logger.info(f"Generated {count} audit log entries")


# =============================================================================
# Main
# =============================================================================

def seed_all(skip_backups: bool = False):
    """Seed all test data."""
    logger.info("=" * 60)
    logger.info("SEEDING TEST DATA")
    logger.info("=" * 60)

    table_service = TableServiceClient.from_connection_string(AZURITE_CONNECTION_STRING)
    blob_service = BlobServiceClient.from_connection_string(AZURITE_CONNECTION_STRING)

    # Seed basic data
    seed_backup_policies(table_service)
    seed_servers(table_service)
    seed_databases(table_service)
    seed_users(table_service)
    seed_settings(table_service)

    # Generate backup history
    generate_backup_history(table_service, blob_service, days=60, skip_files=skip_backups)

    # Generate audit logs
    generate_audit_logs(table_service, days=60, count=500)

    logger.info("=" * 60)
    logger.info("SEEDING COMPLETE!")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Reset and seed Dilux Database Backup test data"
    )
    parser.add_argument(
        "--reset-only",
        action="store_true",
        help="Only reset data, don't seed"
    )
    parser.add_argument(
        "--seed-only",
        action="store_true",
        help="Only seed data, don't reset"
    )
    parser.add_argument(
        "--skip-backups",
        action="store_true",
        help="Skip generating actual backup files (faster)"
    )
    parser.add_argument(
        "--skip-db-setup",
        action="store_true",
        help="Skip creating test databases in Docker"
    )

    args = parser.parse_args()

    try:
        if args.reset_only:
            reset_all()
        elif args.seed_only:
            if not args.skip_db_setup:
                setup_docker_databases()
            seed_all(skip_backups=args.skip_backups)
        else:
            # Full reset + seed
            reset_all()
            if not args.skip_db_setup:
                setup_docker_databases()
            seed_all(skip_backups=args.skip_backups)

        logger.info("")
        logger.info("Done! You can now access the application at http://localhost:3000")

    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
