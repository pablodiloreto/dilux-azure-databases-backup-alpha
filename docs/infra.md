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

**Image:** Custom Dockerfile based on `mcr.microsoft.com/devcontainers/base:ubuntu-20.04`

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

**Port:** 55432 (external) → 5432 (internal container port)

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
- Password: `YourStrong@Passw0rd`
- Database: `testdb`

**Note:** SQL Server uses a different password than MySQL/PostgreSQL due to its stricter password policy requirements.

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
| 55432 | PostgreSQL | Database (maps to 5432 internal) | silent |
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
│   │   ├── models/             # Data models (DatabaseConfig, Engine, BackupJob, etc.)
│   │   ├── services/           # Business logic (StorageService, EngineService, etc.)
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
│       ├── mysql/
│       │   └── init.sql        # MySQL test data
│       ├── postgres/
│       │   └── init.sql        # PostgreSQL test data
│       └── sqlserver-init.sql  # SQL Server test data
│
├── docs/
│   ├── api.md                  # API reference documentation
│   ├── backend.md              # Backend architecture
│   ├── frontend.md             # Frontend documentation
│   ├── infra.md                # This file
│   ├── PLAN.md                 # Sprint planning and status
│   └── ENGINES_DESIGN.md       # Engines/Servers design doc
│
└── .env.example                # Environment variables template
```

---

## Getting Started

### 1. Open in Codespaces / DevContainer

The repository is configured to work with GitHub Codespaces. When you open it:

1. Docker Compose services start automatically
2. `post-create.sh` installs dependencies (runs once on container creation)
3. `post-start.sh` runs on every start:
   - Fixes file permissions for Docker-mounted files
   - Verifies all services are ready
   - Initializes test databases with sample data (first run only)

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

# PostgreSQL (from inside devcontainer)
PGPASSWORD=DevPassword123! psql -h postgres -p 5432 -U postgres testdb

# PostgreSQL (from host machine - uses mapped port)
PGPASSWORD=DevPassword123! psql -h localhost -p 55432 -U postgres testdb

# SQL Server
sqlcmd -S sqlserver,1433 -U sa -P 'YourStrong@Passw0rd' -d testdb -C
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

### Database Tables Not Created

If the test tables don't exist after container start:

```bash
# Check if marker file exists
ls -la /workspaces/.codespaces/.persistedshare/.db-initialized

# If it exists but tables are missing, delete it and re-run post-start
rm /workspaces/.codespaces/.persistedshare/.db-initialized
bash .devcontainer/scripts/post-start.sh
```

### Permission Denied Errors

Codespaces can have issues with file permissions. The `post-start.sh` script fixes this automatically, but if you see permission errors:

```bash
# Manually fix permissions
chmod 644 tools/db-init/mysql/*.sql
chmod 644 tools/db-init/postgres/*.sql
chmod 644 tools/db-init/*.sql
```

### Reset Everything

```bash
# Stop and remove all containers and volumes
docker-compose down -v

# Remove the DB initialization marker
rm -f /workspaces/.codespaces/.persistedshare/.db-initialized

# Rebuild
docker-compose up -d --build

# Re-run post-start to initialize DBs
bash .devcontainer/scripts/post-start.sh
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

---

## Azure Production Deployment

This section documents the Azure infrastructure deployment process.

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT FLOW                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Developer pushes tag (v1.0.x)                                   │
│         │                                                            │
│         ▼                                                            │
│  2. GitHub Action: build-release.yml                                │
│         │  - Builds frontend (npm run build)                        │
│         │  - Packages Function Apps (with shared/)                  │
│         │  - Creates GitHub Release with 4 ZIP assets               │
│         ▼                                                            │
│  3. GitHub Release (v1.0.x)                                         │
│         │  - frontend.zip                                           │
│         │  - api.zip                                                │
│         │  - scheduler.zip                                          │
│         │  - processor.zip                                          │
│         ▼                                                            │
│  4. User clicks "Deploy to Azure"                                   │
│         │                                                            │
│         ▼                                                            │
│  5. Azure Deployment (main.bicep)                                   │
│         │  - Creates infrastructure                                 │
│         │  - Resolves "latest" → actual version                     │
│         │  - Downloads pre-built ZIPs                               │
│         │  - Deploys code to resources                              │
│         ▼                                                            │
│  6. Application Running                                              │
│         - Static Web App (frontend)                                 │
│         - 3 Function Apps (api, scheduler, processor)               │
│         - Storage, Key Vault, App Insights                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Resource Naming Convention

All Azure resources are named with a unique suffix to ensure global uniqueness and support multiple deployments:

```
appName = "dilux"
uniqueSuffix = uniqueString(resourceGroup().id, appName)  → "abc123xyz..."
shortSuffix = take(uniqueSuffix, 6)                       → "abc123"
```

| Resource Type | Naming Pattern | Example | Globally Unique? |
|--------------|----------------|---------|------------------|
| Storage Account | `{appName}st{uniqueSuffix}` | `diluxstabc123xyz` | ✅ Yes |
| Key Vault | `{appName}-kv-{8chars}` | `dilux-kv-abc123xy` | ✅ Yes |
| Function App (API) | `{appName}-{6chars}-api` | `dilux-abc123-api` | ✅ Yes |
| Function App (Scheduler) | `{appName}-{6chars}-scheduler` | `dilux-abc123-scheduler` | ✅ Yes |
| Function App (Processor) | `{appName}-{6chars}-processor` | `dilux-abc123-processor` | ✅ Yes |
| Static Web App | `{appName}-{6chars}-web` | `dilux-abc123-web` | ✅ Yes |
| App Service Plan | `{appName}-plan` | `dilux-plan` | ❌ No (RG scoped) |
| App Insights | `{appName}-insights` | `dilux-insights` | ❌ No (RG scoped) |
| Managed Identity | `{appName}-deploy-identity` | `dilux-deploy-identity` | ❌ No (RG scoped) |

**Important:** The unique suffix is deterministic based on Resource Group ID + App Name. This means:
- Same RG + same appName = same suffix (idempotent re-deploys)
- Different RG or appName = different suffix (allows multiple installations)

### Bicep Modules

```
infra/
├── main.bicep                    # Main orchestrator
├── azuredeploy.json              # Compiled ARM template (for Deploy button)
├── parameters.json               # Parameter template
└── modules/
    ├── storage.bicep             # Storage Account (blobs, queues, 7 tables)
    ├── keyvault.bicep            # Key Vault with RBAC enabled
    ├── appinsights.bicep         # Application Insights + Log Analytics
    ├── appserviceplan.bicep      # App Service Plan (Y1/EP1-EP3)
    ├── functionapp.bicep         # Reusable Function App template
    ├── staticwebapp.bicep        # Static Web App for React frontend
    ├── identity.bicep            # User Assigned Managed Identity
    ├── appregistration.bicep     # Azure AD App Registration (via script)
    ├── rbac-resilient.bicep      # Resilient RBAC assignments (won't fail on re-deploy)
    ├── rbac-keyvault.bicep       # Key Vault Secrets User role
    ├── rbac-keyvault-officer.bicep # Key Vault Secrets Officer role
    ├── rbac-storage.bicep        # Storage data roles (Blob, Queue, Table)
    └── code-deployment.bicep     # Downloads and deploys pre-built assets
```

### Resilient RBAC Module

The `rbac-resilient.bicep` module creates all role assignments using a deployment script with error handling. This prevents the common `RoleAssignmentUpdateNotPermitted` error on re-deployments.

**How it works:**
```bash
# For each role assignment:
az role assignment create ... 2>&1 || true

# If role exists → SKIP (no error)
# If role doesn't exist → CREATE
# Never fails, never blocks deployment
```

**Role assignments created:**
| Principal | Resource | Role |
|-----------|----------|------|
| Deployment Identity | Resource Group | Contributor |
| API Function App | Key Vault | Key Vault Secrets User |
| API Function App | Storage | Blob, Queue, Table Data Contributor |
| Scheduler Function App | Key Vault | Key Vault Secrets User |
| Scheduler Function App | Storage | Blob, Queue, Table Data Contributor |
| Processor Function App | Key Vault | Key Vault Secrets User |
| Processor Function App | Storage | Blob, Queue, Table Data Contributor |

### Version Resolution

The deployment supports automatic version resolution:

```bicep
@description('Version to deploy ("latest" or specific tag like "v1.0.0")')
param appVersion string = 'latest'
```

When `appVersion` is `"latest"`:
1. The deployment script queries GitHub API: `GET /repos/{owner}/{repo}/releases/latest`
2. Extracts the `tag_name` (e.g., `v1.0.2`)
3. Downloads assets from that release
4. Deploys the resolved version

This means you never need to update the template when new versions are released.

### GitHub Actions Workflows

#### 1. Build Release Assets (`.github/workflows/build-release.yml`)

**Trigger:** Push of tags matching `v*` (e.g., `v1.0.0`, `v1.0.2`)

**What it does:**
1. Builds frontend: `npm ci && npm run build`
2. Packages each Function App with `shared/` code
3. Creates 4 ZIP files:
   - `frontend.zip` (~1.3 MB)
   - `api.zip` (~11 MB)
   - `scheduler.zip` (~12 MB)
   - `processor.zip` (~11 MB)
4. Creates GitHub Release with all assets

**Required permissions:**
```yaml
permissions:
  contents: write  # Needed to create releases
```

#### 2. Deploy to Azure (`.github/workflows/deploy.yml`)

**Trigger:** Manual (workflow_dispatch)

**What it does:**
1. Logs into Azure using OIDC
2. Runs `az deployment group create` with parameters
3. Deploys infrastructure + code

### Deployment Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `appName` | ✅ Yes | - | Base name for resources (3-20 chars) |
| `adminEmail` | ✅ Yes | - | Email of first admin user |
| `location` | ❌ No | RG location | Azure region |
| `functionAppSku` | ❌ No | `Y1` | SKU: Y1 (Consumption), EP1-EP3 (Premium) |
| `enableAppInsights` | ❌ No | `true` | Enable Application Insights |
| `appVersion` | ❌ No | `latest` | Version to deploy (or specific tag) |
| `skipAppRegistration` | ❌ No | `false` | Skip Azure AD app creation |

### Deploy to Azure Button

The README contains a "Deploy to Azure" button that launches the Azure Portal deployment experience:

```markdown
[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2F{owner}%2F{repo}%2Fmain%2Finfra%2Fazuredeploy.json)
```

### Manual Deployment via CLI

```bash
# Create resource group
az group create --name dilux-backup-rg --location eastus2

# Deploy
az deployment group create \
  --resource-group dilux-backup-rg \
  --template-file infra/main.bicep \
  --parameters appName=diluxbackup adminEmail=admin@example.com

# Or with specific version
az deployment group create \
  --resource-group dilux-backup-rg \
  --template-file infra/main.bicep \
  --parameters appName=diluxbackup adminEmail=admin@example.com appVersion=v1.0.2
```

### Frontend Deployment (Post-Infrastructure)

Starting from v1.0.4, the frontend must be deployed separately after the infrastructure deployment completes.

**Why?** The Azure CLI container used by deployment scripts runs CBL-Mariner Linux, which doesn't have Node.js/npm available. The SWA CLI requires Node.js.

**How to deploy the frontend:**

```bash
# 1. Install SWA CLI (requires Node.js locally)
npm install -g @azure/static-web-apps-cli

# 2. Download the pre-built frontend from the release
curl -L -o frontend.zip https://github.com/pablodiloreto/dilux-azure-databases-backup-alpha/releases/latest/download/frontend.zip
unzip frontend.zip -d frontend-dist

# 3. Get deployment token from Azure Portal
#    Go to: Static Web App → Settings → Manage deployment token → Copy

# 4. Deploy
swa deploy ./frontend-dist --deployment-token "<YOUR_TOKEN>"
```

**Alternative: GitHub Actions workflow** (recommended for automation)
You can configure the Static Web App to deploy from a GitHub Actions workflow. See the Azure Portal for setup instructions.

### Creating a New Release

To create a new release with updated code:

```bash
# 1. Make your code changes
# 2. Commit and push to main
git add . && git commit -m "feat: your changes" && git push

# 3. Create and push a new tag
git tag v1.0.4
git push origin v1.0.4

# 4. Wait for GitHub Action to complete (~2 min)
# 5. New release is created automatically with pre-built assets

# 6. Deploy uses "latest" by default, so new deployments get v1.0.4
```

### Post-Deployment Verification

After deployment, verify:

1. **Frontend accessible:**
   ```
   https://{appName}-{suffix}-web.azurestaticapps.net
   ```

2. **API health check:**
   ```
   https://{appName}-{suffix}-api.azurewebsites.net/api/health
   ```

3. **Version endpoint:**
   ```
   https://{appName}-{suffix}-api.azurewebsites.net/api/version
   ```

### Cost Estimation

With default settings (Y1 Consumption SKU):

| Resource | Estimated Monthly Cost |
|----------|----------------------|
| Function Apps (Y1) | ~$0-5 (pay per execution) |
| Static Web App (Free) | $0 |
| Storage Account | ~$1-5 |
| Key Vault | ~$0.03/10k operations |
| App Insights | ~$2-5 |
| **Total** | **~$3-15/month** |

For production workloads, consider EP1-EP3 Premium plans for better performance.

### Troubleshooting Deployment

#### Error: "Website with given name already exists"
The Function App name is globally unique. Solutions:
- Use a different `appName`
- Delete the existing apps if from a failed deployment
- Deploy to the same resource group to update existing apps

#### Error: "RoleAssignmentUpdateNotPermitted"
This was fixed in v1.0.1 with the resilient RBAC module. If you still see this:
- You're using an older version of the template
- Pull the latest `main` branch and rebuild `azuredeploy.json`

#### Frontend shows "Congratulations on your new site"
Starting from v1.0.4, the frontend deployment is separate from the Bicep deployment.
You need to deploy the frontend manually:

```bash
# Option 1: Using SWA CLI
npm install -g @azure/static-web-apps-cli

# Get deployment token from Azure Portal:
# Static Web App → Manage deployment token → Copy

# Deploy
swa deploy ./frontend-dist --deployment-token <YOUR_TOKEN>
```

```bash
# Option 2: Download and deploy from release
curl -L -o frontend.zip https://github.com/pablodiloreto/dilux-azure-databases-backup-alpha/releases/latest/download/frontend.zip
unzip frontend.zip -d frontend-dist
swa deploy ./frontend-dist --deployment-token <YOUR_TOKEN>
```

#### Deployment times out
- Deployment should take ~10-15 minutes
- If it takes longer, check the deployment script logs in Azure Portal
- Ensure GitHub releases are accessible (public repo)

#### Error: "Internal server error" in deployment script
This error can have multiple causes:

**v1.0.3 issue:** The Azure CLI container didn't have `jq` installed.
- Fixed in v1.0.3 by adding `apk add jq`

**v1.0.3 issue:** The script used `apk` (Alpine package manager) but Azure CLI container uses CBL-Mariner (not Alpine).
- Fixed in v1.0.4 by removing Node.js installation from script
- Frontend deployment is now manual (see above)

#### Error: "AuthorizationFailed" / "does not have authorization to perform action"
This occurs when the deployment script runs before Azure AD has propagated the RBAC role assignments.

**Root cause:** Azure AD role assignments can take up to 5 minutes to propagate internally. The script executes before the Managed Identity's Contributor role is recognized.

**Fixed in v1.0.5:**
- Added 60 second initial wait after RBAC assignments
- Added retry logic (5 attempts with 30s, 60s, 90s, 120s delays)

If you still see this error, try re-running the deployment - it should work on retry.

#### How to view deployment script logs
```bash
# Via Azure CLI
az deployment-scripts show-log \
  --resource-group <your-rg> \
  --name deploy-application-code

az deployment-scripts show-log \
  --resource-group <your-rg> \
  --name create-role-assignments
```

Or in Azure Portal:
1. Go to Resource Group
2. Find "deploy-application-code" or "create-role-assignments" resource
3. Click on it → Logs
