# Dilux Database Backup Solution

Solución serverless para respaldos automatizados de bases de datos MySQL, PostgreSQL y SQL Server usando Azure Functions.

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
