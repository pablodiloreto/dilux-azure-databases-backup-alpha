# Dilux Database Backup Solution

## Contexto del Proyecto

Este es un sistema serverless de respaldos automatizados para bases de datos MySQL, PostgreSQL y SQL Server usando Azure Functions.

## Documentación

**IMPORTANTE: Antes de realizar cualquier cambio, lee TODOS los archivos en `/docs/`:**

- `docs/infra.md` - Infraestructura, DevContainer, Docker Compose, **Azure Deployment**, VNet Integration
- `docs/backend.md` - Backend Python: shared package, 3 Function Apps, modelos, servicios
- `docs/frontend.md` - Frontend React: componentes, hooks, API client, MUI
- `docs/api.md` - Referencia completa de endpoints de la API
- `docs/PLAN.md` - Estado del proyecto, sprints completados, releases
- `docs/AUTH_SETUP.md` - Configuración de autenticación Azure AD/Entra ID
- `docs/ENGINES_DESIGN.md` - Diseño de engines de backup (MySQL, PostgreSQL, SQL Server)
- `docs/dilux-azure-databases-backup-solution.md` - Visión general y arquitectura de la solución

## Arquitectura

```
src/
├── shared/           # Código Python compartido entre Function Apps
├── functions/
│   ├── api/          # HTTP triggers (puerto 7071)
│   ├── scheduler/    # Timer triggers (puerto 7072)
│   └── processor/    # Queue triggers (puerto 7073)
└── frontend/         # React + Vite + MUI (puerto 3000)

infra/
├── main.bicep        # Orquestador principal de infraestructura
├── azuredeploy.json  # ARM compilado (para Deploy to Azure button)
└── modules/          # Módulos Bicep reutilizables
```

## Servicios Docker (Desarrollo)

- **azurite**: Azure Storage emulator (puertos 10000-10002)
- **mysql**: MySQL 8.0 (puerto 3306)
- **postgres**: PostgreSQL 15 (puerto 5432)
- **sqlserver**: SQL Server 2022 (puerto 1433)

## Credenciales de Desarrollo

- MySQL/PostgreSQL: `DevPassword123!`
- SQL Server: `YourStrong@Passw0rd` (different due to stricter password policy)

## Comandos Útiles

### Desarrollo Local

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
sqlcmd -S sqlserver,1433 -U sa -P 'YourStrong@Passw0rd' -d testdb -C
```

### Crear Nueva Release

```bash
# Commit y push cambios
git add . && git commit -m "feat: cambios" && git push

# Crear tag (dispara GitHub Action que construye assets)
git tag v1.0.x && git push origin v1.0.x

# Verificar release
gh release view v1.0.x
```

### Deployment a Azure

```bash
# Opción 1: Script automático (recomendado)
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash

# Opción 2: Recompilar ARM después de cambios en Bicep
cd infra && az bicep build --file main.bicep --outfile azuredeploy.json

# Deploy via CLI
az deployment group create \
  --resource-group mi-rg \
  --template-file infra/main.bicep \
  --parameters appName=miapp adminEmail=admin@email.com azureAdClientId=xxx
```

### Configurar Autenticación (si Deploy to Azure no creó el App Registration)

```bash
# Script wizard interactivo para configurar Azure AD post-deployment
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-auth.sh | bash
```

## Convención de Nombres Azure

Los recursos globalmente únicos usan sufijo hash:

| Recurso | Patrón | Ejemplo |
|---------|--------|---------|
| Function Apps | `{appName}-{6chars}-{type}` | `dilux-abc123-api` |
| Static Website | `{storageAccount}.z*.web.core.windows.net` | `diluxstabc123.z13.web.core.windows.net` |
| Storage Account | `{appName}st{13chars}` | `diluxstabc123xyz456` |
| Key Vault | `{appName}-kv-{8chars}` | `dilux-kv-abc123xy` |

## Flujo de Deployment

```
1. Push tag vX.X.X
   ↓
2. GitHub Action construye 4 ZIPs (frontend, api, scheduler, processor)
   ↓
3. Crea GitHub Release con assets
   ↓
4. Usuario hace Deploy to Azure (o CLI)
   ↓
5. Bicep crea infra + descarga ZIPs del release
   ↓
6. Aplicación corriendo (~10-15 min total)
```
