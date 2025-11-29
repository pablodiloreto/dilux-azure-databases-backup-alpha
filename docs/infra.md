# Dilux Database Backup - Infrastructure Documentation

## Development Environment Architecture

This document describes the local development infrastructure for the Dilux Database Backup solution.

### Overview

The development environment uses **Docker Compose** with multiple services to emulate the Azure production environment locally:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DevContainer                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Development Tools                                            │    │
│  │  - Python 3.10 + Azure Functions Core Tools                  │    │
│  │  - Node.js 18 + npm                                          │    │
│  │  - Azure CLI + Bicep                                         │    │
│  │  - Database clients (mysql, psql, sqlcmd)                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐
│   Azurite   │     │    MySQL    │     │        PostgreSQL           │
│  (Storage)  │     │     8.0     │     │          15                 │
│             │     │             │     │                             │
│ Blob :10000 │     │ Port: 3306  │     │        Port: 5432           │
│ Queue:10001 │     └─────────────┘     └─────────────────────────────┘
│ Table:10002 │
└─────────────┘              │
                             ▼
                    ┌─────────────────┐
                    │   SQL Server    │
                    │      2022       │
                    │                 │
                    │   Port: 1433    │
                    └─────────────────┘
```

### Services

#### 1. DevContainer (Main Development Environment)

**Image:** Custom Dockerfile based on `mcr.microsoft.com/devcontainers/base:ubuntu-22.04`

**Installed Tools:**
- Python 3.10 with pip
- Node.js 18 with npm
- Azure Functions Core Tools 4
- Azure CLI with Bicep
- Database clients:
  - `mysql-client` for MySQL
  - `postgresql-client` for PostgreSQL
  - `mssql-tools18` for SQL Server

**Purpose:** Primary development environment where you write code, run tests, and debug.

#### 2. Azurite (Azure Storage Emulator)

**Image:** `mcr.microsoft.com/azure-storage/azurite:latest`

**Ports:**
| Port  | Service | Description |
|-------|---------|-------------|
| 10000 | Blob    | Backup file storage |
| 10001 | Queue   | Backup job queue |
| 10002 | Table   | Configuration & history |

**Connection String:**
```
DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://azurite:10000/devstoreaccount1;QueueEndpoint=http://azurite:10001/devstoreaccount1;TableEndpoint=http://azurite:10002/devstoreaccount1;
```

**Purpose:** Emulates Azure Storage for local development. Stores backup files (Blob), backup jobs (Queue), and database configurations/history (Table).

#### 3. MySQL 8.0 (Test Database)

**Image:** `mysql:8.0`

**Port:** 3306

**Credentials:**
- User: `root`
- Password: `DevPassword123!`
- Database: `testdb`

**Purpose:** Test database for MySQL backup functionality. Pre-populated with sample data.

#### 4. PostgreSQL 15 (Test Database)

**Image:** `postgres:15-alpine`

**Port:** 5432

**Credentials:**
- User: `postgres`
- Password: `DevPassword123!`
- Database: `testdb`

**Purpose:** Test database for PostgreSQL backup functionality. Pre-populated with sample data.

#### 5. SQL Server 2022 (Test Database)

**Image:** `mcr.microsoft.com/mssql/server:2022-latest`

**Port:** 1433

**Credentials:**
- User: `sa`
- Password: `DevPassword123!`
- Database: `testdb`

**Purpose:** Test database for SQL Server backup functionality. Pre-populated with sample data.

### Network Configuration

All services are connected via a Docker bridge network named `dilux-network`. Services can communicate using their container names as hostnames:

- `azurite` - Azure Storage emulator
- `mysql` - MySQL database
- `postgres` - PostgreSQL database
- `sqlserver` - SQL Server database

### Volume Persistence

Data is persisted across container restarts using named volumes:

| Volume | Service | Purpose |
|--------|---------|---------|
| `dilux-azurite-data` | Azurite | Storage data |
| `dilux-mysql-data` | MySQL | Database files |
| `dilux-postgres-data` | PostgreSQL | Database files |
| `dilux-sqlserver-data` | SQL Server | Database files |

### Port Mapping

| Port | Service | Description | Auto-forward |
|------|---------|-------------|--------------|
| 3000 | React Frontend | Development server | notify |
| 7071 | Functions API | HTTP triggers | silent |
| 7072 | Functions Scheduler | Timer triggers | silent |
| 7073 | Functions Processor | Queue triggers | silent |
| 10000 | Azurite Blob | Blob storage | silent |
| 10001 | Azurite Queue | Queue storage | silent |
| 10002 | Azurite Table | Table storage | silent |
| 3306 | MySQL | Database | silent |
| 5432 | PostgreSQL | Database | silent |
| 1433 | SQL Server | Database | silent |

---

## Project Structure

```
dilux-azure-databases-backup-alpha/
│
├── .devcontainer/              # DevContainer configuration
│   ├── devcontainer.json       # Main config file
│   └── scripts/
│       ├── post-create.sh      # Runs once after container creation
│       └── post-start.sh       # Runs on every container start
│
├── Dockerfile                  # DevContainer image definition
├── docker-compose.yml          # Service orchestration
│
├── src/
│   ├── shared/                 # Shared Python code (used by all Function Apps)
│   │   ├── config/             # Settings, Azure clients
│   │   ├── models/             # Data models (DatabaseConfig, BackupJob, etc.)
│   │   ├── services/           # Business logic (StorageService, etc.)
│   │   ├── utils/              # Validators, helpers
│   │   └── exceptions/         # Custom exceptions
│   │
│   ├── functions/
│   │   ├── api/                # Function App 1: HTTP triggers
│   │   ├── scheduler/          # Function App 2: Timer triggers
│   │   └── processor/          # Function App 3: Queue triggers
│   │
│   └── frontend/               # React + Vite + MUI
│
├── tools/
│   └── db-init/                # Database initialization scripts
│       ├── mysql-init.sql
│       ├── postgres-init.sql
│       └── sqlserver-init.sql
│
├── docs/
│   ├── dilux-azure-databases-backup-solution.md
│   └── infra.md                # This file
│
└── .env.example                # Environment variables template
```

---

## Getting Started

### 1. Open in Codespaces / DevContainer

The repository is configured to work with GitHub Codespaces. When you open it:

1. Docker Compose services start automatically
2. `post-create.sh` installs dependencies
3. `post-start.sh` verifies all services are ready

### 2. Verify Services

After the container starts, check that all services are running:

```bash
# Check service status
docker ps

# Expected output shows 5 containers:
# - dilux-azurite
# - dilux-mysql
# - dilux-postgres
# - dilux-sqlserver
# - devcontainer
```

### 3. Connect to Test Databases

```bash
# MySQL
mysql -h mysql -P 3306 -u root -pDevPassword123! testdb

# PostgreSQL
PGPASSWORD=DevPassword123! psql -h postgres -p 5432 -U postgres testdb

# SQL Server
sqlcmd -S sqlserver,1433 -U sa -P 'DevPassword123!' -d testdb -C
```

### 4. Start Development Servers

```bash
# Terminal 1: Start Functions API
cd src/functions/api && func start --port 7071

# Terminal 2: Start Frontend
cd src/frontend && npm run dev

# Terminal 3 (optional): Start Scheduler
cd src/functions/scheduler && func start --port 7072
```

### 5. Access the Application

- **Frontend:** http://localhost:3000
- **API:** http://localhost:7071/api/health
- **API Docs:** http://localhost:7071/api/databases

---

## Environment Variables

Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_CONNECTION_STRING` | Azurite | Azure Storage connection |
| `MYSQL_HOST` | `mysql` | MySQL hostname |
| `POSTGRES_HOST` | `postgres` | PostgreSQL hostname |
| `SQLSERVER_HOST` | `sqlserver` | SQL Server hostname |
| `*_PASSWORD` | `DevPassword123!` | Database passwords |

---

## Troubleshooting

### Service Not Starting

```bash
# Check container logs
docker logs dilux-azurite
docker logs dilux-mysql
docker logs dilux-postgres
docker logs dilux-sqlserver
```

### SQL Server Takes Long to Start

SQL Server requires ~60 seconds to initialize. The health check handles this automatically, but if you see connection errors, wait a bit longer.

### Port Already in Use

If ports conflict with local services:

1. Stop local MySQL/PostgreSQL/SQL Server
2. Or modify ports in `docker-compose.yml`

### Reset Everything

```bash
# Stop and remove all containers and volumes
docker-compose down -v

# Rebuild
docker-compose up -d --build
```

---

## Production vs Development

| Aspect | Development | Production |
|--------|-------------|------------|
| Storage | Azurite (local) | Azure Storage Account |
| Databases | Docker containers | Azure SQL, Managed MySQL/PostgreSQL |
| Auth | None/optional | Azure AD |
| Functions | Local Core Tools | Azure Function Apps (Flex Consumption) |
| Frontend | Vite dev server | Azure Static Web Apps |
| Secrets | `.env` file | Azure Key Vault |

---

## VS Code Extensions

The DevContainer automatically installs these extensions:

**Azure Development:**
- Azure Functions
- Azure Storage
- Azure Account

**Python:**
- Python
- Pylance
- Black Formatter

**Frontend:**
- ESLint
- Prettier

**Database:**
- SQLTools + drivers (MySQL, PostgreSQL, MSSQL)

**Productivity:**
- GitLens
- Error Lens
- REST Client
- Claude Code
