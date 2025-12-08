#!/usr/bin/env python3
"""
Migration script: Create engines for existing databases.

This script:
1. Reads all existing databases
2. Groups them by (host, port, engine_type)
3. Creates an Engine for each unique combination
4. Updates each database with engine_id and use_engine_credentials=False

Run with: python scripts/migrate_to_engines.py
"""

import sys
from pathlib import Path

# Add src directory to path for shared package imports
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))

from datetime import datetime
from uuid import uuid4

from shared.config import get_settings
from shared.services import DatabaseConfigService, EngineService
from shared.models import Engine, EngineType, DatabaseType


def map_db_type_to_engine_type(db_type: DatabaseType) -> EngineType:
    """Map DatabaseType to EngineType."""
    mapping = {
        DatabaseType.MYSQL: EngineType.MYSQL,
        DatabaseType.POSTGRESQL: EngineType.POSTGRESQL,
        DatabaseType.SQLSERVER: EngineType.SQLSERVER,
        DatabaseType.AZURE_SQL: EngineType.SQLSERVER,
    }
    return mapping[db_type]


def migrate():
    """Run the migration."""
    print("Starting migration: Create engines for existing databases")
    print("=" * 60)

    # Initialize services
    db_service = DatabaseConfigService()
    engine_service = EngineService()

    # Get all databases
    databases, total = db_service.get_all()
    print(f"Found {total} existing database(s)")

    if total == 0:
        print("No databases to migrate.")
        return

    # Group by (host, port, engine_type)
    engines_map = {}  # key -> engine_id
    databases_to_update = []

    for db in databases:
        # Skip if already has engine_id
        if db.engine_id:
            print(f"  - {db.name}: Already has engine_id, skipping")
            continue

        engine_type = map_db_type_to_engine_type(db.database_type)
        key = (db.host, db.port, engine_type)

        if key not in engines_map:
            # Check if engine already exists
            existing_engine = engine_service.get_by_host(db.host, db.port, engine_type)

            if existing_engine:
                print(f"  - Found existing engine for {db.host}:{db.port} ({engine_type.value})")
                engines_map[key] = existing_engine.id
            else:
                # Create new engine
                engine = Engine(
                    id=str(uuid4()),
                    name=f"{engine_type.value.title()} - {db.host}",
                    engine_type=engine_type,
                    host=db.host,
                    port=db.port,
                    discovery_enabled=False,  # No credentials yet
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )

                try:
                    created_engine = engine_service.create(engine)
                    engines_map[key] = created_engine.id
                    print(f"  + Created engine: {created_engine.name} ({created_engine.id})")
                except ValueError as e:
                    print(f"  ! Error creating engine for {db.host}:{db.port}: {e}")
                    continue

        # Mark database for update
        db.engine_id = engines_map[key]
        db.use_engine_credentials = False  # Keep using own credentials
        databases_to_update.append(db)

    # Update databases
    print("\nUpdating databases with engine_id...")
    updated = 0
    for db in databases_to_update:
        try:
            db_service.update(db)
            print(f"  + Updated: {db.name} -> engine_id={db.engine_id}")
            updated += 1
        except Exception as e:
            print(f"  ! Error updating {db.name}: {e}")

    # Summary
    print("\n" + "=" * 60)
    print("Migration complete!")
    print(f"  Engines created: {len([k for k in engines_map.values()])}")
    print(f"  Databases updated: {updated}")


if __name__ == "__main__":
    migrate()
