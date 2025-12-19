# Dilux Database Backup Solution

Solución serverless para respaldos automatizados de bases de datos MySQL, PostgreSQL y SQL Server usando Azure Functions.

## Deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fpablodiloreto%2Fdilux-azure-databases-backup-alpha%2Fmain%2Finfra%2Fazuredeploy.json)

### Cómo funciona

1. **Click en el botón** → Se abre Azure Portal
2. **Completás los parámetros** → El wizard te guía
3. **Click en "Review + Create"** → Azure despliega todo
4. **Listo** → Accedés a la URL del frontend

### Qué se crea automáticamente

- ✅ Storage Account (backups, colas, tablas)
- ✅ Key Vault (secrets)
- ✅ 3 Function Apps (API, Scheduler, Processor)
- ✅ Static Web App (Frontend React)
- ✅ Application Insights (monitoreo)
- ✅ App Registration en Azure AD (autenticación)
- ✅ Managed Identities + RBAC (permisos)

### Parámetros

| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| **App Name** | Nombre único para los recursos (3-20 chars) | `diluxbackup` |
| **Admin Email** | Tu email (serás el primer admin) | `admin@empresa.com` |
| **Location** | Región de Azure | `East US 2` |
| **Function App SKU** | Plan de Functions | `Y1` (gratis) o `EP1` (premium) |

### Requisitos del usuario que despliega

| Permiso | Para qué |
|---------|----------|
| **Contributor** en la Subscription | Crear recursos Azure |
| **Application Administrator** en Azure AD | Crear App Registration automáticamente |

> **Nota:** Si no tenés Application Administrator, el deploy continúa pero te muestra instrucciones para crear el App Registration manualmente. Ver [Setup manual de App Registration](#setup-manual-de-app-registration).

---

### Setup manual de App Registration

Solo necesario si el deploy automático no pudo crear el App Registration:

1. Ve a **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Click en **New registration**
3. Nombre: `Dilux Database Backup - {appName}`
4. Supported account types: **Single tenant**
5. Redirect URI (Web): `https://{appName}-web.azurestaticapps.net`
6. En **Authentication**:
   - Agrega: `https://{appName}-web.azurestaticapps.net/auth/callback`
   - Marca: **ID tokens** y **Access tokens**
7. Copia el **Application (client) ID**
8. Ve a las Function Apps y agrega la variable `AZURE_AD_CLIENT_ID`

---

### Deploy alternativo (CLI)

```bash
az login
az group create --name rg-dilux-backup --location eastus2
az deployment group create \
  --resource-group rg-dilux-backup \
  --template-file infra/main.bicep \
  --parameters appName=diluxbackup adminEmail=tu@email.com
```

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Frontend                                    │
│                    React + TypeScript + Material UI                      │
│                      Azure Static Web Apps                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Azure Functions                                │
│  ┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐    │
│  │     API     │    │    Scheduler     │    │     Processor       │    │
│  │   (HTTP)    │    │    (Timer)       │    │     (Queue)         │    │
│  │  Port 7071  │    │   Port 7072      │    │    Port 7073        │    │
│  └─────────────┘    └──────────────────┘    └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Azure Storage                                   │
│         Blobs (backups)  │  Queues (jobs)  │  Tables (config/history)   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Inicio Rápido

### Requisitos

- GitHub Codespaces o Docker Desktop con VS Code DevContainers

### Iniciar el Entorno

1. Abre el repositorio en GitHub Codespaces
2. Espera a que Docker Compose inicie todos los servicios (~2 min)
3. Inicia los servidores de desarrollo:

```bash
# Terminal 1: API
cd src/functions/api && func start --port 7071

# Terminal 2: Frontend
cd src/frontend && npm run dev

# Terminal 3 (opcional): Scheduler
cd src/functions/scheduler && func start --port 7072
```

4. Accede a la aplicación:
   - **Frontend:** http://localhost:3000
   - **API:** http://localhost:7071/api/health

## Estructura del Proyecto

```
├── .devcontainer/           # Configuración DevContainer
├── docker-compose.yml       # Servicios Docker (Azurite, MySQL, PostgreSQL, SQL Server)
├── Dockerfile               # Imagen del DevContainer
│
├── src/
│   ├── shared/              # Código Python compartido
│   │   ├── config/          # Settings, clientes Azure
│   │   ├── models/          # DatabaseConfig, BackupJob, BackupResult
│   │   ├── services/        # StorageService, DatabaseConfigService
│   │   └── exceptions/      # Excepciones personalizadas
│   │
│   ├── functions/
│   │   ├── api/             # HTTP endpoints (CRUD databases, backups)
│   │   ├── scheduler/       # Timer triggers (evalúa schedules cada 15 min)
│   │   └── processor/       # Queue triggers (ejecuta backups)
│   │
│   └── frontend/            # React + Vite + MUI
│
├── tools/
│   └── db-init/             # Scripts SQL de inicialización
│
└── docs/                    # Documentación detallada
```

## Servicios del Entorno de Desarrollo

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Frontend | 3000 | React dev server |
| API | 7071 | Azure Functions HTTP |
| Scheduler | 7072 | Azure Functions Timer |
| Processor | 7073 | Azure Functions Queue |
| Azurite Blob | 10000 | Azure Storage Emulator |
| Azurite Queue | 10001 | Azure Storage Emulator |
| Azurite Table | 10002 | Azure Storage Emulator |
| MySQL | 3306 | Base de datos de prueba |
| PostgreSQL | 5432 | Base de datos de prueba |
| SQL Server | 1433 | Base de datos de prueba |

## Bases de Datos de Prueba

Todas las bases de datos tienen credenciales de desarrollo y datos de ejemplo (users, products, orders):

| DB | Host | Puerto | Usuario | Password | Database |
|----|------|--------|---------|----------|----------|
| MySQL | mysql | 3306 | root | DevPassword123! | testdb |
| PostgreSQL | postgres | 5432 | postgres | DevPassword123! | testdb |
| SQL Server | sqlserver | 1433 | sa | DevPassword123! | testdb |

### Conectar a las bases de datos

```bash
# MySQL
mysql -h mysql -u root -pDevPassword123! testdb

# PostgreSQL
PGPASSWORD=DevPassword123! psql -h postgres -U postgres testdb

# SQL Server
sqlcmd -S sqlserver,1433 -U sa -P 'DevPassword123!' -d testdb -C
```

### Crear configuración de backup via API

```bash
# MySQL
curl -X POST http://localhost:7071/api/databases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MySQL Test DB",
    "database_type": "mysql",
    "host": "mysql",
    "port": 3306,
    "database_name": "testdb",
    "username": "root",
    "password": "DevPassword123!",
    "schedule": "0 0 * * *",
    "enabled": true,
    "retention_days": 7,
    "compression": true
  }'

# PostgreSQL
curl -X POST http://localhost:7071/api/databases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PostgreSQL Test DB",
    "database_type": "postgresql",
    "host": "postgres",
    "port": 5432,
    "database_name": "testdb",
    "username": "postgres",
    "password": "DevPassword123!",
    "schedule": "0 0 * * *",
    "enabled": true,
    "retention_days": 7,
    "compression": true
  }'

# SQL Server
curl -X POST http://localhost:7071/api/databases \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SQL Server Test DB",
    "database_type": "sqlserver",
    "host": "sqlserver",
    "port": 1433,
    "database_name": "testdb",
    "username": "sa",
    "password": "DevPassword123!",
    "schedule": "0 0 * * *",
    "enabled": true,
    "retention_days": 7,
    "compression": true
  }'
```

### Trigger backup manual

```bash
# Reemplazar {id} con el ID retornado al crear la configuración
curl -X POST http://localhost:7071/api/databases/{id}/backup
```

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/databases` | Listar configuraciones |
| POST | `/api/databases` | Crear configuración |
| GET | `/api/databases/{id}` | Obtener configuración |
| PUT | `/api/databases/{id}` | Actualizar configuración |
| DELETE | `/api/databases/{id}` | Eliminar configuración |
| POST | `/api/databases/{id}/backup` | Trigger backup manual |
| GET | `/api/backups` | Historial de backups |
| GET | `/api/backups/files` | Listar archivos |
| GET | `/api/backups/download` | Obtener URL de descarga |

## Documentación

| Documento | Descripción |
|-----------|-------------|
| [docs/infra.md](docs/infra.md) | Infraestructura y DevContainer |
| [docs/backend.md](docs/backend.md) | Backend (Function Apps, shared package) |
| [docs/frontend.md](docs/frontend.md) | Frontend (React, MUI, hooks) |
| [docs/api.md](docs/api.md) | Referencia completa de la API |

## Stack Tecnológico

**Backend:**
- Python 3.10
- Azure Functions V2 (decorator model)
- Pydantic para validación
- Azure SDK (Storage, Tables, Queues)

**Frontend:**
- React 18 + TypeScript
- Vite
- Material UI (MUI)
- React Query
- React Router
- Axios

**Infraestructura:**
- Docker Compose
- Azurite (Azure Storage Emulator)
- Azure Static Web Apps
- Azure Functions (Flex Consumption)

## Known Issues / TODO

### Backups no aparecen en /backups después de trigger

**Síntoma:** Al hacer clic en el botón play (trigger backup) en `/databases`, el mensaje dice "Backup queued" pero luego en `/backups` aparece "No backup history found".

**Causa:** El **processor** (Function App que procesa la cola de backups) no está corriendo. El botón play solo encola el job en Azure Queue Storage, pero necesita el processor para ejecutarlo.

**Solución:** Iniciar el processor en una terminal adicional:

```bash
cd src/functions/processor && func start --port 7073
```

**Nota:** Para desarrollo completo necesitas 3 terminales:
1. API (puerto 7071) - CRUD de databases y backups
2. Frontend (puerto 3000) - UI React
3. Processor (puerto 7073) - Ejecuta los backups de la cola
