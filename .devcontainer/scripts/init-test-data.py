#!/usr/bin/env python3
"""
Initialize test data for development environment.

Creates:
- Pending access requests for testing the approval workflow
- Historical backup results for multiple previous days
"""

import sys
import os
from datetime import datetime, timedelta
from uuid import uuid4

# Add shared package to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../src'))

from shared.services.storage_service import StorageService
from shared.models import (
    AccessRequest,
    AccessRequestStatus,
    BackupResult,
    BackupStatus,
    DatabaseType,
)


def create_access_requests(storage: StorageService) -> int:
    """Create pending access requests for testing."""

    # Sample pending access requests
    requests_data = [
        {
            "email": "maria.gonzalez@contoso.com",
            "name": "Maria Gonzalez",
            "requested_days_ago": 0,  # Today
        },
        {
            "email": "carlos.rodriguez@contoso.com",
            "name": "Carlos Rodriguez",
            "requested_days_ago": 1,  # Yesterday
        },
        {
            "email": "ana.martinez@contoso.com",
            "name": "Ana Martinez",
            "requested_days_ago": 2,
        },
        {
            "email": "luis.fernandez@contoso.com",
            "name": "Luis Fernandez",
            "requested_days_ago": 3,
        },
        {
            "email": "sofia.lopez@contoso.com",
            "name": "Sofia Lopez",
            "requested_days_ago": 5,
        },
    ]

    created = 0
    for data in requests_data:
        # Check if request already exists
        existing = storage.get_access_request_by_email(data["email"])
        if existing:
            print(f"  [SKIP] Access request for {data['email']} already exists")
            continue

        request = AccessRequest(
            id=str(uuid4()),
            email=data["email"],
            name=data["name"],
            azure_ad_id=str(uuid4()),  # Fake Azure AD ID for testing
            status=AccessRequestStatus.PENDING,
            requested_at=datetime.utcnow() - timedelta(days=data["requested_days_ago"]),
        )

        storage.save_access_request(request)
        print(f"  [OK] Created access request for {data['email']}")
        created += 1

    return created


def create_historical_backups(storage: StorageService) -> int:
    """Create historical backup results for multiple previous days."""

    # Database configurations for test data
    databases = [
        {"id": "mysql-prod", "name": "MySQL Production", "type": DatabaseType.MYSQL},
        {"id": "postgres-prod", "name": "PostgreSQL Production", "type": DatabaseType.POSTGRESQL},
        {"id": "sqlserver-prod", "name": "SQL Server Production", "type": DatabaseType.SQLSERVER},
        {"id": "mysql-staging", "name": "MySQL Staging", "type": DatabaseType.MYSQL},
        {"id": "postgres-staging", "name": "PostgreSQL Staging", "type": DatabaseType.POSTGRESQL},
    ]

    # Generate backups for the last 14 days
    created = 0
    now = datetime.utcnow()

    for days_ago in range(1, 15):  # 1 to 14 days ago
        backup_date = now - timedelta(days=days_ago)

        for db in databases:
            # Create 1-3 backups per day per database (some scheduled, some manual)
            num_backups = 2 if days_ago <= 7 else 1  # More recent = more backups

            for backup_num in range(num_backups):
                # Vary the time of day
                hour = 2 + (backup_num * 12)  # 2 AM, 2 PM
                backup_time = backup_date.replace(hour=hour, minute=0, second=0, microsecond=0)

                # Determine trigger type
                triggered_by = "scheduler" if backup_num == 0 else "manual"

                # Most backups succeed, some fail
                import random
                random.seed(f"{db['id']}-{days_ago}-{backup_num}")  # Reproducible
                success_rate = 0.85
                is_success = random.random() < success_rate

                # Create backup result
                job_id = str(uuid4())
                result_id = str(uuid4())

                if is_success:
                    # Successful backup
                    duration = random.uniform(30, 180)  # 30s to 3 min
                    file_size = random.randint(1_000_000, 500_000_000)  # 1MB to 500MB

                    # File format based on database type
                    if db["type"] == DatabaseType.MYSQL:
                        file_format = "sql.gz"
                    elif db["type"] == DatabaseType.POSTGRESQL:
                        file_format = "sql.gz"
                    else:
                        file_format = "bak"

                    blob_name = f"{db['type'].value}/{db['id']}/{backup_time.strftime('%Y-%m-%d_%H%M%S')}.{file_format}"

                    result = BackupResult(
                        id=result_id,
                        job_id=job_id,
                        database_id=db["id"],
                        database_name=db["name"],
                        database_type=db["type"],
                        status=BackupStatus.COMPLETED,
                        started_at=backup_time,
                        completed_at=backup_time + timedelta(seconds=duration),
                        duration_seconds=duration,
                        blob_name=blob_name,
                        blob_url=f"https://devstoreaccount1.blob.core.windows.net/backups/{blob_name}",
                        file_size_bytes=file_size,
                        file_format=file_format,
                        triggered_by=triggered_by,
                        created_at=backup_time,
                    )
                else:
                    # Failed backup
                    duration = random.uniform(5, 30)  # Failures are usually faster
                    error_messages = [
                        "Connection refused",
                        "Timeout waiting for database response",
                        "Insufficient disk space",
                        "Authentication failed",
                        "Database locked by another process",
                    ]

                    result = BackupResult(
                        id=result_id,
                        job_id=job_id,
                        database_id=db["id"],
                        database_name=db["name"],
                        database_type=db["type"],
                        status=BackupStatus.FAILED,
                        started_at=backup_time,
                        completed_at=backup_time + timedelta(seconds=duration),
                        duration_seconds=duration,
                        error_message=random.choice(error_messages),
                        triggered_by=triggered_by,
                        created_at=backup_time,
                    )

                storage.save_backup_result(result)
                created += 1

    return created


def main():
    """Main entry point."""
    print("")
    print("=" * 50)
    print("  Initializing Test Data")
    print("=" * 50)
    print("")

    try:
        storage = StorageService()

        # Create access requests
        print("Creating pending access requests...")
        requests_created = create_access_requests(storage)
        print(f"  Total: {requests_created} new access requests")
        print("")

        # Create historical backups
        print("Creating historical backup results...")
        backups_created = create_historical_backups(storage)
        print(f"  Total: {backups_created} backup history records")
        print("")

        print("=" * 50)
        print("  Test Data Initialization Complete!")
        print("=" * 50)
        print("")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
