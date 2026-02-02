# Dilux Database Backup - Estado del Proyecto

**Última actualización:** 2026-02-02 18:30 UTC

---

## ESTADO: v1.0.43 - DEPLOYMENT FC1 EXITOSO ✅

### 🎉 Deployment Exitoso en FC1 (dilux102-rg)

**Versión:** v1.0.43
**Plan:** FC1 (Flex Consumption)
**Región:** Brazil South
**Fecha:** 2026-02-02

| Recurso | URL |
|---------|-----|
| **Frontend** | https://dilux102staf5qp747bpnlw.z15.web.core.windows.net/ |
| **API** | https://dilux102-af5qp7-api.azurewebsites.net |

### ✅ Verificado
- ✅ Deployment completo sin errores
- ✅ Login con Azure AD funcionando
- ✅ Frontend carga correctamente

### ⏳ Pendiente de Testing Funcional
- ⬜ Connection test MySQL
- ⬜ Connection test PostgreSQL
- ⬜ Connection test SQL Server
- ⬜ Backup real MySQL
- ⬜ Backup real PostgreSQL
- ⬜ Backup real SQL Server

---

## Fase 1 Completada (Tasks 1-7)

Se ha completado la migración de Docker containers a ZIP deployment con herramientas bundled:

- ✅ Bicep revertido a Python 3.11 nativo (no Docker)
- ✅ GitHub Action modificado para descargar database tools
- ✅ Tools empaquetados en ZIP: mysql, mysqldump, pg_dump, psql, sqlcmd, bcp
- ✅ Código Python modificado para usar rutas dinámicas a tools
- ✅ deploy.sh pregunta tamaño de DBs y filtra planes según respuesta
- ✅ azuredeploy.json recompilado
- ✅ **Deploy exitoso a FC1 (dilux102-rg)**
- ✅ **Login funcionando**

### Pendiente: Testing Funcional y Cleanup (Tasks 8-11)

| Tarea | Estado |
|-------|--------|
| Probar connection test | 🔄 En progreso (usuario probando) |
| Probar backup real | ⬜ Pendiente |
| Limpiar código Docker | ⬜ Pendiente |
| Actualizar documentación | ⬜ Pendiente |

### Fixes aplicados durante deployment

| Versión | Fix |
|---------|-----|
| v1.0.40 | PostgreSQL 16 para Ubuntu 24.04 runners |
| v1.0.41 | apt-get install para PostgreSQL client |
| v1.0.42 | Remover symlink shared antes de copiar |
| v1.0.43 | Remover FUNCTIONS_WORKER_RUNTIME para FC1 |

---

## CONTEXTO: v1.0.38 - INVESTIGANDO DEPLOYMENT FC1

### ⚠️ PROBLEMA CRÍTICO DESCUBIERTO (2026-02-02)

**Azure Functions Flex Consumption (FC1) NO soporta Docker containers.**

Según la [documentación oficial de Microsoft](https://learn.microsoft.com/en-us/azure/azure-functions/functions-deploy-container):
> "Deploying your function code to Azure Functions in a container requires **Premium plan** or **Dedicated (App Service) plan** hosting."

#### Errores de Deployment v1.0.37/v1.0.38

| Intento | Error |
|---------|-------|
| dilux93-rg | `runtime version '' for runtime name 'custom' is not supported` |
| dilux94-rg | `LinuxFxVersion for Flex Consumption sites is invalid` |

**Conclusión**: FC1 no permite `linuxFxVersion` ni containers Docker. Solo soporta runtimes nativos (Python, Node, .NET, Java).

---

### Opciones de Solución

| Opción | Plan | Docker | Costo Mensual | Database Tools |
|--------|------|--------|---------------|----------------|
| **A** | EP1 (Premium) | ✅ GHCR | ~$150 | ✅ mysqldump, pg_dump, sqlcmd |
| **B** | FC1 + Container Apps | Híbrido | ~$20-40 | ✅ Processor en Container Apps |
| **C** | FC1 Nativo + Tools | ❌ | ~$5-20 | ✅ Binarios en ZIP |

#### Opción C Recomendada: FC1 Nativo con Tools en Build

Volver a Python nativo en FC1 e incluir las herramientas de backup como **binarios estáticos** en el ZIP de deployment.

**Cómo funcionaría:**
```
GitHub Action (build-release.yml)
       │
       ├── Descargar binarios estáticos:
       │   ├── mysqldump (desde mysql-client package)
       │   ├── pg_dump (desde postgresql-client package)
       │   └── sqlcmd (desde mssql-tools18 o alternativa Python)
       │
       ├── Empaquetar en ZIP junto con código Python
       │
       └── Deploy como antes (WEBSITE_RUN_FROM_PACKAGE)
```

### Performance: Docker vs Nativo + Tools

| Aspecto | Docker (EP1 only) | FC1 Nativo + Tools |
|---------|-------------------|-------------------|
| **Cold start** | ~3-10 segundos | ~500ms-2s ✅ **Mejor** |
| **Tamaño deployment** | ~500MB imagen | ~50-100MB ZIP |
| **Costo mensual** | ~$150 (EP1) | ~$5-20 (FC1) ✅ **Mejor** |
| **Tiempo backup** | Igual | Igual |
| **Memoria runtime** | Overhead container | Sin overhead ✅ |
| **VNet support** | ✅ | ✅ |

### Warnings de Opción C

| Warning | Descripción | Mitigación |
|---------|-------------|------------|
| **Binarios Linux** | Necesitan ser compatibles con Azure Functions Linux (x64, glibc) | Extraer de packages Debian/Ubuntu oficiales |
| **sqlcmd complejo** | Microsoft no distribuye binario estático fácil | Usar `mssql-scripter` (Python) o extraer de RPM |
| **Actualizaciones** | CVEs en tools requieren rebuild manual | Dependabot + GitHub Actions |
| **Límite ZIP** | Max 1GB en Azure Functions | ~100MB estimado, OK |
| **PATH execution** | Binarios deben ser ejecutables desde Python | Incluir en PATH o usar ruta absoluta |

### Implementación Propuesta

#### Paso 1: Modificar GitHub Action

```yaml
# .github/workflows/build-release.yml
- name: Download database tools
  run: |
    # MySQL client
    apt-get download mysql-client
    dpkg -x mysql-client*.deb ./tools/

    # PostgreSQL client
    apt-get download postgresql-client
    dpkg -x postgresql-client*.deb ./tools/

    # SQL Server (mssql-scripter como alternativa Python)
    pip install mssql-scripter -t ./tools/python/
```

#### Paso 2: Modificar Bicep

```bicep
// Volver a Python runtime nativo
resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  properties: {
    functionAppConfig: {
      runtime: {
        name: 'python'
        version: '3.11'
      }
    }
  }
}
```

#### Paso 3: Modificar código Python

```python
# src/shared/config/settings.py
import os
TOOLS_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'tools', 'bin')

# src/shared/services/connection_tester.py
mysqldump_path = os.path.join(TOOLS_PATH, 'mysqldump')
subprocess.run([mysqldump_path, ...])
```

---

## ESTADO ANTERIOR: v1.0.37 - DOCKER CONTAINERS (FALLIDO EN FC1)

La versión 1.0.37 introdujo contenedores Docker, pero **solo funciona en EP1/EP2/EP3**, no en FC1.

### Cambio Arquitectural v1.0.37

| Antes (ZIP) | Ahora (Docker) |
|-------------|----------------|
| ZIPs sin herramientas de backup | Imágenes Docker con mysql-client, pg-client, mssql-tools |
| Planes: Y1, FC1, EP1/EP2/EP3 | Planes: FC1, EP1/EP2/EP3 (Y1 eliminado) |
| `WEBSITE_RUN_FROM_PACKAGE` | `linuxFxVersion: DOCKER\|ghcr.io/...` |
| Connection test fallaba en prod | Connection test y backups funcionan |

### Planes Soportados (v1.0.37+)

| SKU | Nombre | Docker | VNet | Costo | Estado |
|-----|--------|--------|------|-------|--------|
| **FC1** | Flex Consumption | ✅ | ✅ | ~$0-10/mes | ✅ **Recomendado** |
| EP1 | Premium | ✅ | ✅ | ~$150/mes | ✅ Funciona |
| EP2 | Premium | ✅ | ✅ | ~$300/mes | ✅ Funciona |
| EP3 | Premium | ✅ | ✅ | ~$600/mes | ✅ Funciona |
| ~~Y1~~ | ~~Consumption~~ | ❌ | ❌ | - | **Eliminado** (no soporta Docker) |

---

## Releases Recientes

| Versión | Fecha | Cambios | Estado |
|---------|-------|---------|--------|
| **v1.0.38** | 2026-02-02 | fix: runtime version 1.0 para FC1 custom | ❌ FC1 no soporta Docker |
| v1.0.37 | 2026-02-01 | feat: Docker containers con database tools | ⚠️ Solo EP1/EP2/EP3 |
| v1.0.36 | 2026-02-01 | fix: corrección query addressPrefixes | ✅ |
| v1.0.35 | 2026-02-01 | feat: Key Vault para passwords | ✅ |
| v1.0.34 | 2026-01-31 | feat: algoritmo mejorado subnets | ✅ |
| v1.0.32 | 2026-01-31 | feat: VNet Status endpoint | ✅ |

---

## v1.0.37 - Docker Containers (2026-02-01)

### Problema Resuelto

En producción, los Function Apps no tenían las herramientas CLI (`mysql`, `mysqldump`, `pg_dump`, `sqlcmd`) necesarias para:
- Test de conexión a engines/databases
- Discovery de databases
- Ejecución de backups

**Error típico:** `"mysql not found. MySQL client tools are not installed."`

### Solución Implementada

Migrar de deployment ZIP a **contenedores Docker personalizados** que incluyen todas las herramientas.

#### Imágenes Docker

```
ghcr.io/pablodiloreto/dilux-backup-api:v1.0.37
ghcr.io/pablodiloreto/dilux-backup-scheduler:v1.0.37
ghcr.io/pablodiloreto/dilux-backup-processor:v1.0.37
```

Cada imagen incluye:
- Python 3.11 + Azure Functions runtime
- `mysql-client` (mysql, mysqldump)
- `postgresql-client` (psql, pg_dump)
- `mssql-tools18` (sqlcmd)

#### Archivos Creados/Modificados

| Archivo | Cambio |
|---------|--------|
| `infra/docker/api.Dockerfile` | **NUEVO** - Dockerfile para API |
| `infra/docker/scheduler.Dockerfile` | **NUEVO** - Dockerfile para Scheduler |
| `infra/docker/processor.Dockerfile` | **NUEVO** - Dockerfile para Processor |
| `.github/workflows/build-release.yml` | Build Docker + push a ghcr.io |
| `infra/main.bicep` | Nuevo param `dockerImagePrefix`, variables para URLs |
| `infra/modules/functionapp.bicep` | `linuxFxVersion: DOCKER\|...`, eliminado Y1 |
| `scripts/deploy.sh` | Eliminada opción Y1, simplificado menú |

#### Flujo de Build/Deploy

```
git push tag v1.0.37
       │
       ▼
GitHub Actions
       │
       ├──► Build frontend.zip (para Static Web App)
       │
       └──► Build Docker images
            ├── ghcr.io/pablodiloreto/dilux-backup-api:v1.0.37
            ├── ghcr.io/pablodiloreto/dilux-backup-scheduler:v1.0.37
            └── ghcr.io/pablodiloreto/dilux-backup-processor:v1.0.37
            │
            └── También tagueadas como :latest
                     │
                     ▼
            Azure Functions pull imágenes
                     │
                     ▼
            ✅ mysqldump, pg_dump, sqlcmd disponibles
```

---

## v1.0.35 - Key Vault para Passwords (2026-02-01)

### Problema Resuelto

Los passwords de engines y databases se perdían en producción porque:
- En desarrollo: se guardaban en Table Storage
- En producción: `include_password=False` y no había código de Key Vault

### Solución Implementada

| Ambiente | Almacenamiento de Passwords |
|----------|---------------------------|
| Desarrollo | Table Storage (fallback) |
| Producción | Azure Key Vault con Managed Identity |

#### Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/shared/config/settings.py` | `key_vault_name`, `use_key_vault` property |
| `src/shared/config/azure_clients.py` | `SecretClient`, `get_secret()`, `set_secret()`, `delete_secret()` |
| `src/shared/services/engine_service.py` | CRUD guarda/lee passwords de Key Vault |
| `src/shared/services/database_config_service.py` | CRUD guarda/lee passwords de Key Vault |
| `src/functions/processor/function_app.py` | Obtiene password de engine si `use_engine_credentials=True` |
| `infra/modules/rbac-native.bicep` | Cambió de `Secrets User` a `Secrets Officer` |

#### Naming de Secrets

```
engine-{id}    → Password del engine
database-{id}  → Password de database (si no usa engine credentials)
```

---

## v1.0.36 - Fix Cálculo de Subnets (2026-02-01)

### Problema

El script `deploy.sh` mostraba "29 subnets existentes" pero "0 IPs usadas", causando que sugiriera direcciones que ya estaban en uso.

### Causa

Query incorrecta en Azure CLI:
```bash
# Antes (MAL)
--query "[].{name:name, prefix:addressPrefix}"

# Después (BIEN)
--query "[].{name:name, prefix:addressPrefixes[0]}"
```

Azure devuelve `addressPrefixes` (array), no `addressPrefix` (singular).

---

## Funcionalidades Implementadas

### Backend (3 Azure Function Apps - Docker)

- **API** (puerto 7071): CRUD completo para databases, engines, policies, users, backups, audit
- **Scheduler** (puerto 7072): Timer cada 15 min, evalúa políticas por tier, cleanup automático
- **Processor** (puerto 7073): Queue trigger, ejecuta backups MySQL/PostgreSQL/SQL Server

### Frontend (React + Vite + MUI)

- **Dashboard**: Stats, backups recientes, health del sistema
- **Servers**: CRUD de servidores/engines con discovery de databases
- **Databases**: CRUD con herencia de credenciales del servidor
- **Backups**: Historial con filtros, descarga, eliminación bulk
- **Policies**: Configuración de políticas con tiers (hourly/daily/weekly/monthly/yearly)
- **Storage**: Estadísticas de almacenamiento
- **Users**: Gestión de usuarios y access requests
- **Audit**: Logs completos con filtros avanzados
- **Settings**: Configuración de la aplicación
- **Status**: Panel de salud del sistema con alertas, **VNet integration status en tiempo real**

### Infraestructura

- **Deploy to Azure Button**: Un click para desplegar todo
- **Script deploy.sh**: Wizard interactivo con selección de VNet ANTES del deployment
- **Script configure-auth.sh**: Wizard interactivo para configurar Azure AD post-deployment
- **Script configure-vnet.sh**: Integración de VNet para acceso a bases de datos privadas
- **Docker Images**: GitHub Action construye imágenes con database tools en cada release
- **RBAC Automático**: Managed Identity con roles configurados (incluyendo Key Vault Secrets Officer)
- **Nombres Únicos**: Sufijo hash para evitar colisiones globales
- **Re-deploy Idempotente**: Se puede re-desplegar sin errores
- **VNet Status API**: Endpoint `/api/vnet-status` para consultar integración en tiempo real

### Seguridad

- **Azure AD Authentication**: MSAL React + JWT validation
- **Key Vault**: Para passwords de engines/databases en producción
- **Audit Logging**: Registro completo de todas las acciones

---

## Decisiones de Arquitectura

| Tema | Decisión |
|------|----------|
| UI Library | Material UI (MUI) |
| Multi-tenant | No - Una instalación por cliente |
| Notificaciones | No para v1 |
| System Health | Sí - Panel de estado |
| Auto-update | Diferido para v2 |
| Autenticación | Azure AD en prod, mock en dev |
| Passwords | Key Vault en prod, Table Storage en dev |
| Database Tools | Docker containers con CLI tools preinstalados |
| Deployment | Docker images en ghcr.io (antes: ZIPs en GitHub Releases) |

---

## Comandos Útiles

### Deployment a Azure

```bash
# Opción 1: Script automático (recomendado)
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash

# Opción 2: Deploy manual via CLI
az deployment group create \
  --resource-group mi-rg \
  --template-uri https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/infra/azuredeploy.json \
  --parameters appName=miapp adminEmail=admin@email.com appVersion=v1.0.37

# Opciones de functionAppSku:
#   FC1 = Flex Consumption (default, recomendado)
#   EP1/EP2/EP3 = Premium
```

### Actualizar Instalación Existente

```bash
# Re-deploy con nueva versión
az deployment group create \
  --resource-group <tu-rg> \
  --template-uri https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/infra/azuredeploy.json \
  --parameters appName=<tu-app> adminEmail=<tu-email> appVersion=v1.0.37
```

### Verificar Imágenes Docker

```bash
# Ver imágenes disponibles
docker pull ghcr.io/pablodiloreto/dilux-backup-api:v1.0.37
docker pull ghcr.io/pablodiloreto/dilux-backup-api:latest

# Verificar que tienen las herramientas
docker run --rm ghcr.io/pablodiloreto/dilux-backup-api:v1.0.37 which mysqldump
docker run --rm ghcr.io/pablodiloreto/dilux-backup-api:v1.0.37 which pg_dump
docker run --rm ghcr.io/pablodiloreto/dilux-backup-api:v1.0.37 which sqlcmd
```

### Desarrollo Local

```bash
# Iniciar API
cd src/functions/api && func start --port 7071

# Iniciar Frontend
cd src/frontend && npm run dev

# Conectar a bases de datos de prueba
mysql -h mysql -u root -pDevPassword123! testdb
PGPASSWORD=DevPassword123! psql -h postgres -U postgres testdb
sqlcmd -S sqlserver,1433 -U sa -P 'YourStrong@Passw0rd' -d testdb -C
```

### Crear Nueva Release

```bash
# 1. Commit y push cambios
git add . && git commit -m "feat: cambios" && git push

# 2. Crear tag (dispara GitHub Action que construye Docker images)
git tag v1.0.x && git push origin v1.0.x

# 3. Verificar release y imágenes
gh release view v1.0.x
```

---

## Historial Completo de Releases

| Versión | Fecha | Cambios |
|---------|-------|---------|
| **v1.0.38** | 2026-02-02 | **fix: runtime version 1.0 para FC1 - DESCUBIERTO: FC1 no soporta Docker** |
| v1.0.37 | 2026-02-01 | feat: Docker containers con database tools (solo EP1/EP2/EP3) |
| v1.0.36 | 2026-02-01 | fix: query addressPrefixes para cálculo de subnets |
| v1.0.35 | 2026-02-01 | feat: Key Vault para passwords en producción |
| v1.0.34 | 2026-01-31 | feat: algoritmo mejorado para cálculo de subnets |
| v1.0.32 | 2026-01-31 | feat: VNet Status endpoint /api/vnet-status |
| v1.0.31 | 2026-01-31 | fix: FC1 OneDeploy from GitHub releases |
| v1.0.30 | 2026-01-31 | fix: deploy.sh wizard VNet primero |
| v1.0.28 | 2026-01-31 | fix: esperar SCM endpoint antes de deploy FC1 |
| v1.0.24 | 2026-01-31 | fix: FC1 deployment usando config-zip --build-remote |
| v1.0.20 | 2026-01-29 | fix: 3 App Service Plans separados para FC1 |
| v1.0.18 | 2026-01-29 | feat: configure-auth.sh wizard |
| v1.0.16 | 2026-01-17 | Versión estable verificada en producción |
| v1.0.0 | 2025-12-20 | Release inicial |

---

## Features para v2 (Opcional)

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Auto-Update | Notificación de nueva versión disponible | Baja |
| Webhooks | Trigger cuando hay nueva imagen Docker | Media |
| Notificaciones | Email/webhook en fallos de backup | Media |
| Multi-tenant | Soporte para múltiples organizaciones | Baja |

---

## Archivos Clave

### Docker

| Archivo | Descripción |
|---------|-------------|
| `infra/docker/api.Dockerfile` | Dockerfile para API Function App |
| `infra/docker/scheduler.Dockerfile` | Dockerfile para Scheduler Function App |
| `infra/docker/processor.Dockerfile` | Dockerfile para Processor Function App |

### Infraestructura

| Archivo | Descripción |
|---------|-------------|
| `infra/main.bicep` | Orquestador principal, define dockerImagePrefix |
| `infra/modules/functionapp.bicep` | Function App con Docker support |
| `infra/modules/rbac-native.bicep` | RBAC incluyendo Key Vault Secrets Officer |
| `.github/workflows/build-release.yml` | Build Docker + push a ghcr.io |

### Backend

| Archivo | Descripción |
|---------|-------------|
| `src/shared/config/azure_clients.py` | SecretClient para Key Vault |
| `src/shared/services/engine_service.py` | CRUD engines con Key Vault |
| `src/shared/services/database_config_service.py` | CRUD databases con Key Vault |
| `src/shared/services/connection_tester.py` | Test conexión usando CLI tools |

### Scripts

| Archivo | Descripción |
|---------|-------------|
| `scripts/deploy.sh` | Wizard de instalación (solo FC1/EP*) |
| `scripts/configure-auth.sh` | Configurar Azure AD post-deployment |
| `scripts/configure-vnet.sh` | Integrar VNet post-deployment |

---

## Próximos Pasos - Roadmap de Fases

### Arquitectura de Backup - Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE BACKUP (Actual)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  mysqldump ──► stdout ──► RAM ──► gzip ──► RAM ──► Blob Storage     │
│                          (3GB)            (1GB)         ↓            │
│                                                   ARCHIVO FINAL      │
│                                          backups/mysql/{id}/xxx.sql.gz│
│                                                                      │
│  ⚠️ Problema: Todo pasa por memoria (RAM limitada en FC1)           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE BACKUP (Fase 2 - Streaming)              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  mysqldump ──► pipe ──► gzip stream ──► upload chunks ──► Blob      │
│                         (64KB buffer)    (4MB blocks)       ↓        │
│                                                       ARCHIVO FINAL  │
│                                          backups/mysql/{id}/xxx.sql.gz│
│                                                                      │
│  ✅ Sin límite de memoria, soporta cualquier tamaño                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Nota importante**: El blob storage contiene el **archivo final del backup** (no hay temporales). El .sql.gz en blob ES el backup listo para restaurar.

---

### FASE 1: FC1 Nativo con Database Tools en ZIP (ACTUAL)

**Objetivo**: Hacer funcionar FC1 (bajo costo) con herramientas de backup en el ZIP.

**Limitaciones aceptadas**:
- Bases de datos < 1GB (limitación de memoria FC1)
- Timeout máximo 10 minutos en FC1
- Sin cambios en lógica de backup

#### Tareas Fase 1

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 1 | **Revertir Bicep a Python nativo** | Eliminar Docker config, usar runtime python 3.11 | ✅ **Completado** |
| 2 | **Modificar GitHub Action** | Descargar/extraer binarios de database tools | ✅ **Completado** |
| 3 | **Empaquetar tools en ZIP** | Incluir mysqldump, pg_dump en /tools/bin/ | ✅ **Completado** (parte de tarea 2) |
| 4 | **Resolver sqlcmd** | Usar binario de mssql-tools18 | ✅ **Completado** |
| 5 | **Modificar código Python** | Usar rutas a binarios en /tools/bin/ | ✅ **Completado** |
| 6 | **Modificar deploy.sh** | Preguntar tamaño DBs, mostrar planes según respuesta | ✅ **Completado** |
| 7 | **Probar en FC1** | Deploy completo a dilux95-rg o similar | ⬜ Pendiente |
| 8 | **Probar connection test** | MySQL, PostgreSQL, SQL Server | ⬜ Pendiente |
| 9 | **Probar backup real** | Ejecutar backup de cada tipo | ⬜ Pendiente |
| 10 | **Limpiar código Docker** | Eliminar Dockerfiles si no se usan | ⬜ Pendiente |
| 11 | **Actualizar documentación** | PLAN.md, infra.md, README | ⬜ Pendiente |

#### Progreso Tarea 1 (Completada)

**Archivos modificados:**
- `infra/modules/functionapp.bicep` - Reescrito completo para Python 3.11 nativo
  - Eliminado parámetro `dockerImageUrl`
  - Cambiado `kind` de `functionapp,linux,container` a `functionapp,linux`
  - FC1: `runtime.name: 'python'`, `runtime.version: '3.11'`
  - EP1+: `linuxFxVersion: 'PYTHON|3.11'`
  - Eliminado settings de Docker (`DOCKER_REGISTRY_SERVER_URL`, etc.)
- `infra/main.bicep` - Limpiado referencias a Docker
  - Eliminado parámetro `dockerImagePrefix`
  - Eliminado variables `dockerImageTag`, `dockerImageApi/Scheduler/Processor`
  - Actualizado comentarios sobre planes
- `infra/azuredeploy.json` - Recompilado

#### Progreso Tarea 2-4 (Completadas)

**GitHub Action modificado** (`/.github/workflows/build-release.yml`):
- Descarga `mysql-client-core-8.0` → extrae `mysql`, `mysqldump`
- Descarga `postgresql-client-14` → extrae `pg_dump`, `psql`
- Instala `mssql-tools18` → copia `sqlcmd`, `bcp`
- Todos los binarios van a `tools/bin/` en cada ZIP
- Verifica que los tools funcionan antes de empaquetar

**Tools incluidos en cada ZIP:**
```
tools/bin/
├── mysql        # MySQL client
├── mysqldump    # MySQL backup
├── pg_dump      # PostgreSQL backup
├── psql         # PostgreSQL client
├── sqlcmd       # SQL Server client
└── bcp          # SQL Server bulk copy
```

#### Progreso Tarea 5 (Completada)

**Nuevo módulo creado** (`src/shared/utils/tool_paths.py`):
- `get_tool_path(tool_name)` - Retorna ruta absoluta al binario o nombre si usa PATH
- `get_tools_bin_path()` - Detecta `/home/site/wwwroot/tools/bin/` en Azure
- `is_using_bundled_tools()` - Verifica si está usando tools del ZIP
- En desarrollo usa el PATH del sistema
- En producción usa los binarios del ZIP

**Archivos modificados para usar tool_paths:**
- `src/shared/utils/__init__.py` - Exporta funciones de tool_paths
- `src/shared/services/connection_tester.py`:
  - `_test_mysql()` → usa `get_tool_path("mysql")`
  - `_test_postgresql()` → usa `get_tool_path("psql")` (no pg_isready)
  - `_test_sqlserver()` → usa `get_tool_path("sqlcmd")`
- `src/functions/processor/backup_engines/mysql_engine.py`:
  - `_execute_backup_command()` → usa `get_tool_path("mysqldump")`
  - `test_connection()` → usa `get_tool_path("mysql")`
- `src/functions/processor/backup_engines/postgres_engine.py`:
  - `_execute_locally()` → usa `get_tool_path("pg_dump")`
  - `test_connection()` → usa `get_tool_path("psql")`
- `src/functions/processor/backup_engines/sqlserver_engine.py`:
  - `_execute_backup_command()` → usa `get_tool_path("sqlcmd")`
  - `execute_native_backup()` → usa `get_tool_path("sqlcmd")`
  - `test_connection()` → usa `get_tool_path("sqlcmd")`

**Nota:** Se usa `psql` en lugar de `pg_isready` porque `pg_isready` no está incluido en el ZIP.

#### Progreso Tarea 6 (Completada)

**Archivo modificado** (`scripts/deploy.sh`):

Se agregó una pregunta de tamaño de base de datos ANTES de la selección de plan:

```
═══════════════════════════════════════════════════════════════
¿Cuál es el tamaño de tu base de datos más grande?
═══════════════════════════════════════════════════════════════

  1) Pequeña (< 1 GB)
     Todas las opciones de plan disponibles

  2) Mediana (1-3 GB)
     Requiere plan Premium (EP1+) por timeout de 60 min

  3) Grande (> 3 GB)
     Requiere plan Premium EP2+ por memoria y tiempo

Selecciona [1-3]:
```

**Lógica implementada:**
- Si elige **1 (< 1GB)**: Muestra FC1, EP1, EP2, EP3 (FC1 recomendado)
- Si elige **2 (1-3GB)**: Muestra solo EP1, EP2, EP3 (EP1 recomendado)
- Si elige **3 (> 3GB)**: Muestra solo EP2, EP3 (EP2 recomendado)

**Mensajes informativos añadidos:**
- Cada plan muestra timeout y memoria
- FC1 indica "⚠️ Timeout: 10 minutos | Memoria: 2-4 GB"
- EP1+ indica "⏱️ Timeout: 60 minutos | Memoria: X GB"

**Eliminadas referencias a Docker** (ya no se usan containers).

#### Tarea 6: Cambios en deploy.sh (Documentación original)

El wizard de instalación debe preguntar sobre el tamaño de las bases de datos:

```
═══════════════════════════════════════════════════════════════
   [2/8] Tamaño de Bases de Datos
═══════════════════════════════════════════════════════════════

¿Cuál es el tamaño aproximado de tu base de datos más grande?

  1) Pequeña (< 1 GB)      → FC1 disponible (~$5-20/mes)
  2) Mediana (1-3 GB)      → EP1 recomendado (~$150/mes)
  3) Grande (> 3 GB)       → EP2+ recomendado (~$300/mes)

Seleccione [1-3]:
```

**Lógica:**
- Si elige **1 (< 1GB)**: Mostrar FC1 y EP1/EP2/EP3
- Si elige **2 (1-3GB)**: Mostrar solo EP1/EP2/EP3, ocultar FC1
- Si elige **3 (> 3GB)**: Mostrar solo EP2/EP3, ocultar FC1 y EP1

**Razón:** FC1 tiene timeout de 10 minutos y memoria limitada. DBs grandes no caben.

#### Decisiones Técnicas Fase 1

| Decisión | Opciones | Recomendación |
|----------|----------|---------------|
| **SQL Server backup** | A) mssql-scripter (Python), B) extraer sqlcmd de RPM | A - más simple |
| **Mantener Docker para EP1?** | A) Sí, dual-mode, B) No, solo ZIP | B - simplificar |
| **Versiones de tools** | A) Latest, B) Fijas | B - reproducibilidad |

---

### Límites por Plan de Azure Functions

| Recurso | FC1 | EP1 | EP2 | EP3 |
|---------|-----|-----|-----|-----|
| **Memoria** | 2GB / 4GB | 3.5GB | 7GB | 14GB |
| **Timeout máximo** | **10 min** | 60 min | 60 min | 60 min |
| **DB máxima segura** | < 1GB | 1-3GB | 3-6GB | 6-10GB |
| **Costo mensual** | ~$5-20 | ~$150 | ~$300 | ~$600 |
| **App Service Plans** | 3 separados | 1 compartido | 1 compartido | 1 compartido |
| **Cold start** | ~500ms-2s | ~1-3s | ~1-3s | ~1-3s |
| **VNet** | ✅ | ✅ | ✅ | ✅ |

**Nota crítica**: El timeout NO se puede extender en FC1. Si un backup toma más de 10 minutos, fallará.

---

### FASE 2: Streaming a Blob Storage (FUTURO)

**Objetivo**: Soportar bases de datos que no caben en memoria, pero **dentro del timeout del plan**.

**Qué resuelve**:
- ✅ Problema de MEMORIA (no carga todo en RAM)
- ❌ NO resuelve problema de TIMEOUT (sigue siendo 10 min en FC1)

**Beneficios**:
- DBs de 1-3GB en FC1 (si el dump toma < 10 min)
- DBs más grandes en EP1+ (timeout 60 min)
- Menor uso de memoria en todos los planes

#### Cambios Requeridos Fase 2

| Archivo | Cambio |
|---------|--------|
| `backup_engines/base_engine.py` | Implementar streaming con `subprocess.Popen` + pipe |
| `backup_engines/mysql_engine.py` | Retornar generador en lugar de bytes |
| `backup_engines/postgres_engine.py` | Retornar generador en lugar de bytes |
| `backup_engines/sqlserver_engine.py` | Retornar generador en lugar de bytes |
| `shared/services/storage_service.py` | Upload con `BlockBlobClient.upload_blob(stream)` |

#### Implementación Técnica Fase 2

```python
# Concepto de streaming
def _execute_backup_stream(self, ...):
    process = subprocess.Popen(
        ["mysqldump", ...],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    # Pipe a gzip en streaming
    with gzip.open(process.stdout, 'rb') as gz_stream:
        # Upload en chunks de 4MB
        blob_client.upload_blob(gz_stream, blob_type="BlockBlob")
```

---

### FASE 3: Backups Incrementales (FUTURO)

**Objetivo**: Reducir tiempo y storage con backups incrementales/diferenciales.

**Beneficios**:
- Backups más rápidos (solo cambios)
- Menor uso de storage
- Menor ventana de backup

#### Herramientas por Motor

| Motor | Full Backup (actual) | Incremental (Fase 3) |
|-------|---------------------|----------------------|
| **MySQL** | mysqldump | Percona XtraBackup o MySQL Enterprise Backup |
| **PostgreSQL** | pg_dump | pg_basebackup + WAL archiving (PITR) |
| **SQL Server** | sqlcmd/BCP | `BACKUP DATABASE ... WITH DIFFERENTIAL` |

#### Complejidad Fase 3

| Aspecto | Descripción |
|---------|-------------|
| **Cadena de backups** | Incremental depende del full anterior |
| **Restore** | Requiere full + todos los incrementales |
| **Retención** | Más compleja (no puedes borrar full si hay incrementales) |
| **Validación** | Verificar integridad de la cadena |
| **UI** | Mostrar relación full → incremental |

#### Prerequisitos Fase 3

- [ ] Fase 1 completada y estable
- [ ] Fase 2 completada (streaming necesario para XtraBackup)
- [ ] Modelo de datos para cadenas de backup
- [ ] UI para gestión de cadenas
- [ ] Lógica de retención actualizada

---

### Resumen de Fases

| Fase | Objetivo | Resuelve | No Resuelve | DBs en FC1 | DBs en EP1+ |
|------|----------|----------|-------------|------------|-------------|
| **1** | FC1 funcional | Deployment | Memoria, Timeout | < 1GB | < 3GB |
| **2** | Streaming | **Memoria** | Timeout | < 3GB (si < 10min) | < 10GB |
| **3** | Incrementales | **Tiempo** | - | Cualquier | Cualquier |

**Conclusión importante**:
- Para DBs < 1GB: FC1 con Fase 1 es suficiente
- Para DBs 1-10GB: Necesitas EP1+ (por timeout), Fase 2 ayuda con memoria
- Para DBs > 10GB: Necesitas EP2/EP3 + Fase 2 + posiblemente Fase 3

---

### Decisiones Arquitecturales Documentadas

| Fecha | Decisión | Razón |
|-------|----------|-------|
| 2026-02-02 | FC1 no soporta Docker | Limitación de Azure, documentado en Microsoft Learn |
| 2026-02-02 | Opción C (ZIP + tools) | Mantener bajo costo (~$5-20/mes) vs EP1 (~$150/mes) |
| 2026-02-02 | Fases incrementales | Entregar valor rápido, iterar después |
| 2026-02-02 | Blob = archivo final | No hay temporales, el .sql.gz en blob es el backup |
| 2026-02-02 | deploy.sh pregunta tamaño DBs | FC1 solo para DBs < 1GB por timeout 10 min |
| 2026-02-02 | EP1+ comparte App Service Plan | Código ya optimizado, 1 plan para 3 functions |

---

### App Service Plans - Verificación de Código

El código actual en `main.bicep` YA está optimizado:

```bicep
// FC1: 3 planes separados (requerido por Azure)
module appServicePlanApi ...
module appServicePlanScheduler = if (isFlexConsumption) ...
module appServicePlanProcessor = if (isFlexConsumption) ...

// EP1/EP2/EP3: 1 plan compartido
appServicePlanId: isFlexConsumption
  ? appServicePlanScheduler.outputs.planId   // FC1: plan propio
  : appServicePlanApi.outputs.planId          // EP1+: plan compartido ✅
```

| Plan | App Service Plans | Razón |
|------|-------------------|-------|
| FC1 | 3 separados | Limitación Azure: FC1 no permite compartir |
| EP1/EP2/EP3 | **1 compartido** ✅ | Código optimizado, ahorra costos |

#### Archivos a Modificar

```
infra/
├── main.bicep                    # Eliminar dockerImagePrefix, usar ZIP
├── modules/functionapp.bicep     # runtime: python 3.11, eliminar linuxFxVersion
└── modules/code-deployment.bicep # Volver a WEBSITE_RUN_FROM_PACKAGE

.github/workflows/
└── build-release.yml             # Agregar paso de descarga de tools

src/shared/
├── config/settings.py            # TOOLS_PATH variable
└── services/
    ├── connection_tester.py      # Usar rutas a binarios
    └── backup_engines/           # Usar rutas a binarios
```

### Resource Groups de Prueba

| RG | Versión | Estado | Notas |
|----|---------|--------|-------|
| dilux92-rg | v1.0.36? | ❓ | Pre-Docker |
| dilux93-rg | v1.0.37 | ❌ Failed | Docker + FC1 = error runtime version |
| dilux94-rg | v1.0.38 | ❌ Failed | Docker + FC1 = error linuxFxVersion |
| dilux95-rg | v1.0.39+ | ⬜ | Para probar Opción C |
