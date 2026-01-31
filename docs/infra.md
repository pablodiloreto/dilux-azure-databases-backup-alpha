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
| Frontend | Vite dev server | Azure Blob Storage Static Website |
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
│         - Blob Storage Static Website (frontend)                    │
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
| Static Website | `{storageAccount}.z*.web.core.windows.net` | `diluxstabc123.z13.web.core.windows.net` | ✅ Yes |
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
    ├── storage.bicep             # Storage Account (blobs, queues, tables, static website)
    ├── keyvault.bicep            # Key Vault with RBAC enabled
    ├── appinsights.bicep         # Application Insights + Log Analytics
    ├── appserviceplan.bicep      # App Service Plan (Y1/EP1-EP3)
    ├── functionapp.bicep         # Reusable Function App template
    ├── identity.bicep            # User Assigned Managed Identity
    ├── appregistration.bicep     # Azure AD App Registration (via script)
    ├── rbac-native.bicep         # Native Bicep RBAC assignments (Key Vault + Storage)
    ├── rbac-contributor.bicep    # Contributor role for deployment identity
    └── code-deployment.bicep     # Downloads and deploys pre-built assets + configures CORS
```

### Native RBAC Module

The `rbac-native.bicep` module creates all role assignments using native Bicep resources. This uses the deploying user's permissions (not the deployment identity) to create role assignments.

**Why native Bicep instead of deployment scripts:**
- Deployment scripts use a Managed Identity with Contributor role
- Contributor role cannot create role assignments (requires Owner or User Access Administrator)
- Native Bicep uses the deploying user's credentials, which typically have the necessary permissions

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
| `functionAppSku` | ❌ No | `FC1` | SKU for Function Apps (see table below) |
| `enableAppInsights` | ❌ No | `true` | Enable Application Insights |
| `appVersion` | ❌ No | `latest` | Version to deploy (or specific tag) |
| `skipAppRegistration` | ❌ No | `false` | Skip Azure AD app creation |

### Function App Hosting Plans

| SKU | Name | VNet Integration | Cost | Use Case |
|-----|------|-----------------|------|----------|
| **FC1** | Flex Consumption | ✅ **Yes** | ~$0-10/month | **RECOMMENDED** - Serverless with VNet support |
| Y1 | Consumption (Legacy) | ❌ **No** | ~$0-5/month | Simple setups, public DBs only. **EOL Sept 2028** |
| EP1 | Premium | ✅ Yes | ~$150/month | Production, no cold starts |
| EP2 | Premium | ✅ Yes | ~$300/month | High performance |
| EP3 | Premium | ✅ Yes | ~$600/month | Maximum performance |

**IMPORTANT - VNet Integration:**
- If your databases are in Azure Virtual Networks (Private Endpoints, VMs in VNet), you **MUST** use FC1 or EP1/EP2/EP3
- Y1 (Consumption) does **NOT** support VNet integration and cannot connect to private networks
- FC1 (Flex Consumption) is recommended as it offers VNet support with serverless pricing

### Deploy to Azure Button

The README contains a "Deploy to Azure" button that launches the Azure Portal deployment experience:

```markdown
[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2F{owner}%2F{repo}%2Fmain%2Finfra%2Fazuredeploy.json)
```

### Manual Deployment via CLI

```bash
# Create resource group
az group create --name dilux-backup-rg --location eastus2

# Deploy with Flex Consumption (default, recommended)
az deployment group create \
  --resource-group dilux-backup-rg \
  --template-file infra/main.bicep \
  --parameters appName=diluxbackup adminEmail=admin@example.com

# Deploy with specific plan (e.g., Y1 for legacy, EP1 for Premium)
az deployment group create \
  --resource-group dilux-backup-rg \
  --template-file infra/main.bicep \
  --parameters appName=diluxbackup adminEmail=admin@example.com functionAppSku=EP1

# Deploy with specific version
az deployment group create \
  --resource-group dilux-backup-rg \
  --template-file infra/main.bicep \
  --parameters appName=diluxbackup adminEmail=admin@example.com appVersion=v1.0.2
```

### Frontend Deployment

The frontend is deployed automatically to Azure Blob Storage Static Website by the `code-deployment.bicep` module.

**How it works:**
1. Downloads `frontend.zip` from GitHub Release
2. Enables static website on Storage Account
3. Extracts and uploads files to `$web` container
4. Generates `config.json` with runtime configuration (API URL, Azure AD settings)
5. Configures CORS on API Function App with the specific frontend URL

**Frontend URL format:**
```
https://{storageAccountName}.z{N}.web.core.windows.net
```
Where `N` is the zone number assigned by Azure based on region.

**No manual deployment required** - everything is handled automatically by the deployment script.

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
   https://{storageAccountName}.z{N}.web.core.windows.net
   ```

2. **API health check:**
   ```
   https://{appName}-{suffix}-api.azurewebsites.net/api/health
   ```

3. **Login works:**
   - First user to login becomes Admin automatically
   - Azure AD authentication should redirect correctly

### Cost Estimation

With default settings (FC1 Flex Consumption SKU):

| Resource | Estimated Monthly Cost |
|----------|----------------------|
| Function Apps (FC1) | ~$0-10 (pay per execution) |
| Blob Storage Static Website | $0 (included in Storage) |
| Storage Account | ~$1-5 |
| Key Vault | ~$0.03/10k operations |
| App Insights | ~$2-5 |
| **Total** | **~$3-20/month** |

For production workloads with no cold starts, consider EP1-EP3 Premium plans.

### Troubleshooting Deployment

#### Error: "Website with given name already exists"
The Function App name is globally unique. Solutions:
- Use a different `appName`
- Delete the existing apps if from a failed deployment
- Deploy to the same resource group to update existing apps

#### Deployment times out
- Deployment should take ~10-15 minutes
- If it takes longer, check the deployment script logs in Azure Portal
- Ensure GitHub releases are accessible (public repo)

#### How to view deployment script logs
```bash
# Via Azure CLI
az deployment-scripts show-log \
  --resource-group <your-rg> \
  --name deploy-application-code
```

Or in Azure Portal:
1. Go to Resource Group
2. Find "deploy-application-code" resource
3. Click on it → Logs

---

## VNet Integration

### Overview

VNet Integration permite a los Function Apps conectarse a bases de datos en redes privadas (Private Endpoints, VNets).

**Planes soportados:**
| Plan | VNet Support | Recomendación |
|------|--------------|---------------|
| FC1 (Flex Consumption) | ✅ Sí | **Recomendado** |
| EP1/EP2/EP3 (Premium) | ✅ Sí | Para workloads enterprise |
| Y1 (Consumption) | ❌ No | EOL en 2028 |

### Scripts de Configuración

#### deploy.sh (Wizard de Instalación)

El wizard de instalación pregunta por VNet **ANTES** del deployment:

```bash
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash
```

**Flujo:**
1. `[1/7]` Pregunta si necesita VNet
2. `[2/7]` Lista VNets disponibles → **determina la región automáticamente**
3. `[3/7]` Nombre de la app
4. `[4/7]` Email del admin
5. `[5/7]` SKU (Y1 oculto si VNet seleccionada)
6. `[6/7]` Confirmación
7. `[7/7]` Deployment

#### configure-vnet.sh (Post-Deployment)

Para instalaciones existentes que necesitan VNet Integration:

```bash
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-vnet.sh | bash
```

**Características:**
- Detecta instalaciones de Dilux en la suscripción
- Lista VNets en la misma región
- Calcula subnet automáticamente (incluso para VNets pequeñas /24)
- Crea subnet con delegación a Microsoft.Web/serverFarms
- Integra las 3 Function Apps

### VNet Status API

El endpoint `/api/vnet-status` consulta Azure ARM en tiempo real.

**Request:**
```
GET /api/vnet-status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "has_vnet_integration": true,
  "vnets": [
    {
      "vnet_name": "my-vnet",
      "vnet_resource_group": "network-rg",
      "subnet_name": "dilux-subnet",
      "connected_apps": ["api", "scheduler", "processor"],
      "connection_status": "3/3",
      "is_complete": true
    }
  ],
  "function_apps": [
    {
      "name": "myapp-abc123-api",
      "type": "api",
      "vnet_name": "my-vnet",
      "subnet_name": "dilux-subnet",
      "is_connected": true,
      "error": null
    }
  ],
  "inconsistencies": [],
  "query_error": null
}
```

**Casos de error:**
```json
{
  "has_vnet_integration": false,
  "vnets": [],
  "function_apps": [],
  "inconsistencies": [],
  "query_error": "DILUX_RESOURCE_GROUP not configured"
}
```

### Variables de Entorno (Bicep)

Configuradas automáticamente por `infra/main.bicep`:

```bicep
additionalAppSettings: {
  // ... otras settings ...
  AZURE_SUBSCRIPTION_ID: subscription().subscriptionId
  DILUX_RESOURCE_GROUP: resourceGroup().name
  DILUX_API_APP_NAME: functionAppApiName
  DILUX_SCHEDULER_APP_NAME: functionAppSchedulerName
  DILUX_PROCESSOR_APP_NAME: functionAppProcessorName
}
```

### RBAC para VNet Status

El API Function App necesita rol **Reader** en el Resource Group para poder consultar la configuración de VNet de los otros Function Apps:

```bicep
// infra/main.bicep
var readerRoleId = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
resource apiReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, functionAppApiName, readerRoleId, 'vnet-status')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', readerRoleId)
    principalId: functionAppApi.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}
```

### Arquitectura del Servicio

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  StatusPage.tsx                                              │    │
│  │  └── VNetStatusCard                                          │    │
│  │      └── useQuery('vnet-status', { staleTime: 5min })       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ GET /api/vnet-status
┌─────────────────────────────────────────────────────────────────────┐
│                      API Function App                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  function_app.py                                             │    │
│  │  └── vnet_status()                                           │    │
│  │      └── AzureService.get_vnet_status()                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Managed Identity + Reader Role
┌─────────────────────────────────────────────────────────────────────┐
│                    Azure Resource Manager                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  WebSiteManagementClient.web_apps.list_vnet_connections()   │    │
│  │  - Query API Function App VNet                               │    │
│  │  - Query Scheduler Function App VNet                         │    │
│  │  - Query Processor Function App VNet                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Troubleshooting VNet

#### VNet Status muestra "error"

1. Verificar que las variables de entorno estén configuradas:
   ```bash
   az functionapp config appsettings list \
     --name <app>-api \
     --resource-group <rg> \
     --query "[?name=='DILUX_RESOURCE_GROUP'].value" -o tsv
   ```

2. Verificar el rol Reader:
   ```bash
   az role assignment list \
     --assignee <api-principal-id> \
     --scope /subscriptions/<sub>/resourceGroups/<rg> \
     --query "[?roleDefinitionName=='Reader']"
   ```

#### VNet Status muestra "not configured"

Ejecutar el script de configuración:
```bash
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-vnet.sh | bash
```

#### Inconsistencias (2/3 apps conectadas)

Re-ejecutar `configure-vnet.sh` para integrar las apps faltantes.

### Algoritmo de Cálculo de Subnets

El script `deploy.sh` incluye un algoritmo inteligente para calcular el espacio disponible en VNets.

#### Ejemplo de Salida

```
═══════════════════════════════════════════════════════════════
   Análisis de Espacio de Direcciones
═══════════════════════════════════════════════════════════════

  VNet:         10.13.0.0/16
  Rango:        10.13.0.0 - 10.13.255.255
  Total IPs:    65536

  Subnets existentes: 30
  IPs usadas:       8192 (12%)
  IPs disponibles:  57344

Bloques libres encontrados:

  [1] 10.13.6.0 - 10.13.6.255 (256 IPs, cabe: /26+)
  [2] 10.13.29.0 - 10.13.255.255 (58112 IPs, cabe: /26+)

Tamaño del subnet:
  1) /28 = 16 IPs
  2) /27 = 32 IPs (recomendado)
  3) /26 = 64 IPs
  0) Cancelar
```

#### Cómo Funciona

1. **Parsea el CIDR de la VNet** y calcula el rango total de IPs
2. **Lista todos los subnets existentes** con sus rangos
3. **Convierte IPs a enteros** para comparación numérica precisa
4. **Ordena los rangos** por dirección de inicio
5. **Encuentra huecos (gaps)** entre subnets existentes
6. **Muestra bloques libres** con tamaño y qué CIDRs caben
7. **Valida la selección** antes de crear el subnet
8. **Alinea la dirección** al boundary correcto del CIDR

#### Validaciones Automáticas

| Validación | Comportamiento |
|------------|----------------|
| VNet sin espacio | Muestra error claro y no permite continuar |
| Bloque pequeño | Indica qué tamaños caben (/28, /27, /26) |
| Nombre duplicado | Pide otro nombre si ya existe |
| Tamaño excede espacio | No permite seleccionar un tamaño que no cabe |
| Alineación CIDR | Ajusta automáticamente al boundary correcto |

#### Manejo de Errores

El script usa `set +e` antes de comandos críticos para capturar errores:

```bash
set +e
CREATE_OUTPUT=$(az network vnet subnet create ... 2>&1)
CREATE_RESULT=$?
set -e

if [ $CREATE_RESULT -ne 0 ]; then
    echo "Error: $CREATE_OUTPUT"
    # Ofrece reintentar o seleccionar subnet existente
fi
```

Esto evita que el script termine abruptamente sin mostrar el error.
