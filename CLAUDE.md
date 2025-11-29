# Dilux Database Backup Solution

## Contexto del Proyecto

Este es un sistema serverless de respaldos automatizados para bases de datos MySQL, PostgreSQL y SQL Server usando Azure Functions.

## Documentación

Antes de realizar cualquier cambio, lee la documentación completa:

- `docs/infra.md` - Infraestructura, DevContainer, Docker Compose, servicios
- `docs/backend.md` - Backend Python: shared package, 3 Function Apps, modelos, servicios
- `docs/frontend.md` - Frontend React: componentes, hooks, API client, MUI
- `docs/api.md` - Referencia completa de endpoints de la API

## Arquitectura

```
src/
├── shared/           # Código Python compartido entre Function Apps
├── functions/
│   ├── api/          # HTTP triggers (puerto 7071)
│   ├── scheduler/    # Timer triggers (puerto 7072)
│   └── processor/    # Queue triggers (puerto 7073)
└── frontend/         # React + Vite + MUI (puerto 3000)
```

## Servicios Docker

- **azurite**: Azure Storage emulator (puertos 10000-10002)
- **mysql**: MySQL 8.0 (puerto 3306)
- **postgres**: PostgreSQL 15 (puerto 5432)
- **sqlserver**: SQL Server 2022 (puerto 1433)

## Credenciales de Desarrollo

Todas las DBs usan password: `DevPassword123!`

## Comandos Útiles

```bash
# Iniciar API
cd src/functions/api && func start --port 7071

# Iniciar Frontend
cd src/frontend && npm run dev

# Conectar a MySQL
mysql -h mysql -u root -pDevPassword123! testdb

# Conectar a PostgreSQL
PGPASSWORD=DevPassword123! psql -h postgres -U postgres testdb

# Conectar a SQL Server
sqlcmd -S sqlserver,1433 -U sa -P 'DevPassword123!' -d testdb -C
```
