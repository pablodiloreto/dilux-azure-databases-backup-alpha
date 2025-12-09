#!/usr/bin/env python3
"""Generate audit logs for testing."""
import json
import random
import sys
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, "src/shared")
from azure.data.tables import TableServiceClient

AZURITE_CONNECTION_STRING = (
    "DefaultEndpointsProtocol=http;"
    "AccountName=devstoreaccount1;"
    "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
    "TableEndpoint=http://azurite:10002/devstoreaccount1;"
)

SERVERS = [
    {"id": "srv-mysql-prod", "host": "mysql", "port": 3306, "engine_type": "mysql"},
    {"id": "srv-postgres-prod", "host": "postgres", "port": 5432, "engine_type": "postgresql"},
    {"id": "srv-sqlserver-prod", "host": "sqlserver", "port": 1433, "engine_type": "sqlserver"},
]

DATABASE_CONFIGS = [
    {"id": "db-mysql-ecommerce", "name": "E-Commerce DB", "database_type": "mysql", "engine_id": "srv-mysql-prod"},
    {"id": "db-mysql-analytics", "name": "Analytics DB", "database_type": "mysql", "engine_id": "srv-mysql-prod"},
    {"id": "db-mysql-staging", "name": "Staging DB", "database_type": "mysql", "engine_id": "srv-mysql-prod"},
    {"id": "db-postgres-users", "name": "Users DB", "database_type": "postgresql", "engine_id": "srv-postgres-prod"},
    {"id": "db-postgres-inventory", "name": "Inventory DB", "database_type": "postgresql", "engine_id": "srv-postgres-prod"},
    {"id": "db-postgres-logs", "name": "Logs DB", "database_type": "postgresql", "engine_id": "srv-postgres-prod"},
    {"id": "db-sqlserver-finance", "name": "Finance DB", "database_type": "sqlserver", "engine_id": "srv-sqlserver-prod"},
    {"id": "db-sqlserver-reports", "name": "Reports DB", "database_type": "sqlserver", "engine_id": "srv-sqlserver-prod"},
    {"id": "db-sqlserver-dev", "name": "Dev DB", "database_type": "sqlserver", "engine_id": "srv-sqlserver-prod"},
]

USERS = [
    {"id": "user-admin", "email": "admin@dilux.com"},
    {"id": "user-operator", "email": "operator@dilux.com"},
    {"id": "user-viewer", "email": "viewer@dilux.com"},
]


def generate_audit_logs(days: int = 60, count: int = 500):
    """Generate realistic audit log entries."""
    print(f"Generating {count} audit log entries...")

    table_service = TableServiceClient.from_connection_string(AZURITE_CONNECTION_STRING)
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
            print(f"  Generated {i + 1}/{count} audit logs...")

    print(f"Generated {count} audit log entries")


if __name__ == "__main__":
    generate_audit_logs()
