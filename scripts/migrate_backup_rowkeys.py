#!/usr/bin/env python3
"""
Migrate backup records to use inverted timestamp RowKey for descending sort order.

This script:
1. Reads all backup records from Table Storage
2. Deletes the old record (with UUID-only RowKey)
3. Inserts a new record with inverted timestamp RowKey

Run once to migrate existing data.
"""

import os
import sys
from datetime import datetime

# Add shared package to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "shared"))

from azure.data.tables import TableServiceClient

# Configuration
CONNECTION_STRING = os.environ.get(
    "STORAGE_CONNECTION_STRING",
    "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://azurite:10000/devstoreaccount1;QueueEndpoint=http://azurite:10001/devstoreaccount1;TableEndpoint=http://azurite:10002/devstoreaccount1"
)
TABLE_NAME = "backuphistory"

# Max ticks for inverted timestamp (year 9999)
MAX_TICKS = 3155378975999999999


def compute_new_rowkey(created_at_str: str, backup_id: str) -> str:
    """Compute the new RowKey format with inverted timestamp."""
    created_at = datetime.fromisoformat(created_at_str)
    current_ticks = int(created_at.timestamp() * 10_000_000)
    inverted_ticks = MAX_TICKS - current_ticks
    return f"{inverted_ticks:019d}_{backup_id}"


def is_legacy_rowkey(rowkey: str) -> bool:
    """Check if RowKey is in legacy format (UUID only)."""
    # New format: 19-digit inverted ticks + underscore + uuid
    # Legacy format: just UUID (36 chars with hyphens)
    if "_" not in rowkey and len(rowkey) == 36:
        return True
    return False


def migrate():
    """Migrate all backup records to new RowKey format."""
    print("Connecting to Table Storage...")
    table_service = TableServiceClient.from_connection_string(CONNECTION_STRING)
    table_client = table_service.get_table_client(TABLE_NAME)

    print(f"Reading all records from '{TABLE_NAME}' table...")
    entities = list(table_client.list_entities())
    print(f"Found {len(entities)} records")

    legacy_count = 0
    migrated_count = 0
    errors = []

    for entity in entities:
        rowkey = entity["RowKey"]
        partition_key = entity["PartitionKey"]

        if not is_legacy_rowkey(rowkey):
            continue  # Already migrated

        legacy_count += 1
        backup_id = rowkey  # Legacy RowKey is just the UUID
        created_at = entity.get("created_at")

        if not created_at:
            errors.append(f"No created_at for {rowkey}")
            continue

        new_rowkey = compute_new_rowkey(created_at, backup_id)
        print(f"  Migrating {backup_id[:8]}... -> {new_rowkey[:25]}...")

        try:
            # Create new entity with new RowKey
            new_entity = dict(entity)
            new_entity["RowKey"] = new_rowkey

            # Insert new record
            table_client.create_entity(new_entity)

            # Delete old record
            table_client.delete_entity(partition_key, rowkey)

            migrated_count += 1
        except Exception as e:
            errors.append(f"Error migrating {rowkey}: {e}")

    print(f"\nMigration complete:")
    print(f"  Total records: {len(entities)}")
    print(f"  Legacy records found: {legacy_count}")
    print(f"  Successfully migrated: {migrated_count}")

    if errors:
        print(f"  Errors: {len(errors)}")
        for err in errors:
            print(f"    - {err}")


if __name__ == "__main__":
    migrate()
