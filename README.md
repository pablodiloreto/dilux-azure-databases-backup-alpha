# Dilux Database Backup Solution

Solución serverless para respaldos automatizados de bases de datos MySQL, PostgreSQL y SQL Server usando Azure Functions.

## Instalación en Azure

### Opción 1: Script Automático (Recomendado)

Ejecuta este comando en [Azure Cloud Shell](https://shell.azure.com) o en tu terminal con Azure CLI:

```bash
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash
```

El script te guiará paso a paso:
1. ✅ Verifica tus permisos
2. ✅ Crea el App Registration automáticamente
3. ✅ Despliega toda la infraestructura
4. ✅ Configura la autenticación con Azure AD
5. ✅ El primer login será admin automáticamente

**Requisitos:**
- Azure CLI instalado (o usar [Azure Cloud Shell](https://shell.azure.com))
- Permisos de **Contributor** en la Subscription
- Permisos de **Global Admin** o **Application Administrator** en Azure AD

---

### Opción 2: Deploy to Azure (Botón)

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fpablodiloreto%2Fdilux-azure-databases-backup-alpha%2Fmain%2Finfra%2Fazuredeploy.json)

> ⚠️ **Nota:** Esta opción NO crea el App Registration automáticamente. Deberás:
> 1. Crear el App Registration manualmente ([ver instrucciones](#setup-manual-de-app-registration))
> 2. O pasar el parámetro `azureAdClientId` si ya tienes uno

---

### Qué se crea automáticamente

- ✅ Storage Account (backups, colas, tablas)
- ✅ Key Vault (secrets)
- ✅ 3 Function Apps (API, Scheduler, Processor)
- ✅ Frontend (Blob Storage Static Website)
- ✅ Application Insights (monitoreo)
- ✅ App Registration en Azure AD (solo con script)
- ✅ Managed Identities + RBAC (permisos)

---

### Setup manual de App Registration

Solo necesario si usas el botón "Deploy to Azure" sin el script:

1. Ve a **Azure Portal** → **Microsoft Entra ID** → **App registrations**
2. Click en **New registration**
3. Nombre: `Dilux Database Backup - {appName}`
4. Supported account types: **Single tenant**
5. Redirect URI: Selecciona **Single-page application (SPA)**
   - URL: `https://{storage-account}.z13.web.core.windows.net`
6. Click **Register**
7. En **Authentication**, agrega otro redirect URI:
   - `https://{storage-account}.z13.web.core.windows.net/auth/callback`
8. Copia el **Application (client) ID**
9. Actualiza:
   - Function App API: variable `AZURE_AD_CLIENT_ID` y `AUTH_MODE=azure`
   - Blob Storage: archivo `config.json` con `azureClientId` y `authMode: azure`

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
