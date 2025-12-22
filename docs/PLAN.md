# Plan de Implementación - Dilux Database Backup

**Última actualización:** 2025-12-21

---

## Estado Actual

### Qué funciona
- **API Function App** (puerto 7071): Health, CRUD databases, CRUD backup policies, trigger backup manual
- **Processor Function App** (puerto 7073): Queue trigger con tier info, backup MySQL/PostgreSQL/SQL Server
- **Scheduler Function App** (puerto 7072): Timer 15min evalúa tiers por policy, cleanup por tier
- **Frontend** (puerto 3000): Dashboard, DBs, Backups, Policies, Users, Settings, Status, Audit
- **Servicios Docker**: Azurite, MySQL 8.0, PostgreSQL 15, SQL Server 2022
- **Arranque automático**: Configurado en `post-start.sh` con `setsid`
- **Autenticación**: Azure AD con MSAL React (frontend) + JWT validation (backend)
- **Sistema de Audit**: Logs completos con filtros, login/logout events desde frontend

---

## Decisiones de Arquitectura

| Tema | Decisión |
|------|----------|
| UI Library | Material UI (MUI) |
| Multi-tenant | No - Una instalación por cliente |
| Notificaciones | No para v1 |
| System Health | Sí - Panel de estado |
| Auto-update | v2 |
| Autenticación | Azure AD en prod, bypass en dev |
| Passwords | Key Vault en prod, Table Storage en dev |
| Audit Login/Logout | Frontend llama `/api/auth/events` solo en login/logout real |

---

## Tareas Pendientes

### Testing Completado

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| T.8 | Manual Backup | Trigger backup desde UI | ✅ Completado |
| T.9 | Download Backup | Descargar un backup existente | ✅ Completado |
| T.10 | Mobile View | Responsive en todas las páginas | ✅ Completado |

### Gestión de Credenciales (Pendiente)

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| C.3 | Key Vault | Guardar credenciales en Key Vault en producción | ⏳ Pendiente |

### Sprint 4: Deploy ✅ COMPLETADO

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 6.1 | ARM/Bicep | Templates para todos los recursos | ✅ Completado |
| 6.2 | Managed Identity | MI + RBAC automáticos | ✅ Completado |
| 6.3 | Deploy Button | Botón en README.md | ✅ Completado |
| 6.4 | Installation ID | ID único por instalación | ✅ Completado |
| 6.5 | Version Endpoint | `/api/version` | ✅ Completado |

**Archivos creados:**
- `infra/main.bicep` - Orquestador principal
- `infra/modules/storage.bicep` - Storage Account (blobs, queues, tables)
- `infra/modules/keyvault.bicep` - Key Vault para secrets
- `infra/modules/appinsights.bicep` - Application Insights
- `infra/modules/appserviceplan.bicep` - App Service Plan
- `infra/modules/functionapp.bicep` - Template reutilizable para Function Apps
- `infra/modules/staticwebapp.bicep` - Static Web App (frontend)
- `infra/modules/rbac-keyvault.bicep` - RBAC para acceso a Key Vault
- `infra/azuredeploy.json` - ARM compilado (para Deploy button)

### Sprint 5: Deployment Improvements ✅ COMPLETADO

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 7.1 | Pre-built Assets | GitHub Action que construye ZIPs en cada release | ✅ Completado |
| 7.2 | Faster Deploy | Deploy descarga ZIPs pre-construidos (~10 min vs 30+ min) | ✅ Completado |
| 7.3 | Latest Version | Parámetro `appVersion=latest` resuelve automáticamente | ✅ Completado |
| 7.4 | Resilient RBAC | Role assignments no fallan en re-deploys | ✅ Completado |
| 7.5 | Unique Names | Nombres globalmente únicos con sufijo hash | ✅ Completado |

**Archivos creados/modificados:**
- `.github/workflows/build-release.yml` - Construye assets en cada tag
- `infra/modules/rbac-resilient.bicep` - RBAC con error handling
- `infra/modules/code-deployment.bicep` - Descarga y despliega assets

**Releases:**
| Versión | Fecha | Cambios |
|---------|-------|---------|
| v1.0.0 | 2025-12-20 | Release inicial con pre-built assets |
| v1.0.1 | 2025-12-20 | Fix: RBAC resiliente (no falla en re-deploy) |
| v1.0.2 | 2025-12-20 | Fix: Nombres únicos para Function Apps y Static Web App |
| v1.0.3 | 2025-12-20 | Fix: Instalar jq en script de RBAC |
| v1.0.4 | 2025-12-21 | Fix: Compatibilidad CBL-Mariner (remover apk) |
| v1.0.5 | 2025-12-21 | Fix: Espera y retry para propagación de RBAC |
| v1.0.6 | 2025-12-22 | Fix: RBAC Contributor via Bicep nativo (no script) |
| v1.0.7 | 2025-12-22 | Feat: Deployment automático del frontend (SWA CLI) |

**Convención de nombres (v1.0.2+):**
```
appName = "dilux"  →  dilux-abc123-api, dilux-abc123-scheduler, etc.
                          └──────┘
                          sufijo único basado en RG + appName
```

### Pendiente: Validar Deploy v1.0.6

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 9.1 | Deploy v1.0.6 | Probar deploy completo a Azure | ✅ Infraestructura OK |
| 9.2 | Verificar API | Probar /api/health | ❌ 404 - Functions no registradas |
| 9.3 | Verificar Auth | Login con Azure AD | ⏳ Pendiente |
| 9.4 | Deploy Frontend | Desplegar frontend manualmente | ⏳ Pendiente |
| 9.5 | Test Backup | Crear DB y ejecutar backup | ⏳ Pendiente |

**Historial de errores:**
- v1.0.2: Faltaba `jq` en container Azure CLI → Corregido en v1.0.3
- v1.0.3: `apk add` no existe en CBL-Mariner (Azure CLI no usa Alpine) → Corregido en v1.0.4
- v1.0.4: RBAC role assignments no propagados a tiempo → Corregido en v1.0.5
- v1.0.5: AuthorizationFailed - Managed Identity sin Contributor role → **Corregido en v1.0.6**
- v1.0.6: Infraestructura OK, pero Functions no se registran → **PENDIENTE INVESTIGAR**
- v1.0.7: Añadido deployment automático de frontend → **PENDIENTE PROBAR**

### Sesión 2025-12-22: Fix v1.0.6 y nuevo problema

#### ✅ Resuelto: Error de deployment v1.0.5

**Error original:** `DeploymentScriptError: The provided script failed without returning any errors`

**Logs obtenidos (v1.0.5):**
```
ERROR: (AuthorizationFailed) The client '...' does not have authorization
to perform action 'Microsoft.Web/sites/read' over scope '...diluxbk1-fwwxk4-api'
...
ERROR: Failed after 5 attempts
```

**Causa raíz:** Problema circular (chicken-and-egg):
1. `rbac-resilient.bicep` intentaba asignar rol Contributor a la Managed Identity
2. Pero el script **usaba** esa misma identity que aún no tenía permisos
3. El rol Contributor se asignaba via script, pero el script necesitaba ese rol para ejecutarse

**Solución implementada (v1.0.6):**
1. Creado nuevo módulo `infra/modules/rbac-contributor.bicep`
2. Asigna rol Contributor usando **Bicep nativo** (no un deployment script)
3. Se ejecuta inmediatamente después de crear la identity
4. Actualizado `main.bicep` para que todos los scripts dependan de este módulo

**Archivos modificados:**
- `infra/modules/rbac-contributor.bicep` (nuevo)
- `infra/main.bicep` (añadido módulo y dependencias)
- `infra/azuredeploy.json` (recompilado)

**Resultado del deployment v1.0.6:**
```
rbac-deployment-contributor  Succeeded  2025-12-22T04:13:30
code-deployment              Succeeded  2025-12-22T04:17:17
main                         Succeeded  2025-12-22T04:17:18
```

Los 3 Function Apps se desplegaron al **primer intento** (sin retries).

---

#### ❓ Pendiente: Functions no se registran

**Síntoma:**
- Deployment completa exitosamente
- API devuelve HTTP 404
- `az functionapp function list` devuelve lista vacía

**Verificaciones realizadas:**
1. ✅ Estructura del ZIP correcta:
   - `function_app.py` (126KB) en raíz
   - `host.json` en raíz
   - `requirements.txt` en raíz
   - `.python_packages/` con dependencias

2. ✅ Configuración de Function App correcta:
   - `FUNCTIONS_EXTENSION_VERSION`: ~4
   - `FUNCTIONS_WORKER_RUNTIME`: python
   - `linuxFxVersion`: PYTHON|3.10
   - `WEBSITE_RUN_FROM_PACKAGE`: URL del blob con ZIP

3. ❓ Pendiente revisar:
   - Logs de inicialización del runtime Python
   - Errores en Application Insights
   - Si hay problema con imports o dependencias

**Resource Group de prueba:** dilux-backup-rg1

**URLs desplegadas:**
- API: https://diluxbk1-fwwxk4-api.azurewebsites.net (404)
- Scheduler: https://diluxbk1-fwwxk4-scheduler.azurewebsites.net
- Processor: https://diluxbk1-fwwxk4-processor.azurewebsites.net
- Frontend: https://happy-dune-0ee8df80f.4.azurestaticapps.net

**Comandos útiles para mañana:**
```bash
# Ver logs de la Function App
az webapp log tail --name diluxbk1-fwwxk4-api --resource-group dilux-backup-rg1

# Listar funciones registradas
az functionapp function list --name diluxbk1-fwwxk4-api --resource-group dilux-backup-rg1

# Reiniciar Function App
az functionapp restart --name diluxbk1-fwwxk4-api --resource-group dilux-backup-rg1

# Ver configuración completa
az functionapp config appsettings list --name diluxbk1-fwwxk4-api --resource-group dilux-backup-rg1

# Query Application Insights
az monitor app-insights query --app diluxbk1-insights --resource-group dilux-backup-rg1 \
  --analytics-query "exceptions | where timestamp > ago(1h) | order by timestamp desc"
```

---

#### v1.0.7: Deployment automático completo

**Cambio:** El script de deployment ahora despliega TODO automáticamente:
1. Descarga los 4 ZIPs (frontend, api, scheduler, processor)
2. Instala Node.js y SWA CLI en el container
3. Obtiene el deployment token del Static Web App
4. Despliega el frontend con `swa deploy`
5. Despliega las 3 Function Apps

**Archivos modificados:**
- `infra/modules/code-deployment.bicep` - Script completo con frontend
- `infra/azuredeploy.json` - Recompilado

**Pendiente probar mañana:**
1. Hacer nuevo deployment con v1.0.7
2. Verificar que el frontend se despliega (no placeholder)
3. Verificar que las Functions responden (/api/health)
4. Si Functions siguen en 404, investigar logs de Python

**Para probar:**
```bash
# Opción 1: Desde Azure Portal
# Ir a: https://portal.azure.com/#create/Microsoft.Template/uri/...
# Usar appVersion=v1.0.7

# Opción 2: Desde CLI (resource group nuevo)
az group create --name dilux-backup-rg2 --location eastus
az deployment group create \
  --resource-group dilux-backup-rg2 \
  --template-file infra/main.bicep \
  --parameters appName=diluxtest adminEmail=tu@email.com appVersion=v1.0.7
```

---

### v2: Auto-Update (diferido para después de v1)

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 8.1 | GitHub Releases | Usar GitHub API para check de versión | ✅ Implementado (Sprint 5) |
| 8.2 | Check Version | Frontend consulta nueva versión disponible | ⏳ Pendiente |
| 8.3 | Notificación | Campanita "Nueva versión disponible" | ⏳ Pendiente |
| 8.4 | Update ARM | Re-deploy idempotente sin borrar datos | ✅ Implementado (Sprint 5) |
| 8.5 | Telemetría (opcional) | Endpoint para tracking de instalaciones | ⏳ Pendiente |

**Nota:** El re-deploy idempotente ya funciona gracias al módulo RBAC resiliente y los nombres únicos.

---

## Checklist Pre-Release v1

- [x] Backups funcionan (MySQL, PostgreSQL, SQL Server)
- [x] CRUD databases desde UI
- [x] Scheduler automático funcionando
- [x] Cleanup de backups viejos (timer diario 2AM)
- [x] Azure AD auth en producción
- [x] Sistema de auditoría completo
- [x] Login/logout logging correcto (solo eventos reales)
- [x] Deploy to Azure button
- [x] Pre-built release assets (GitHub Action)
- [x] Deployment resiliente (RBAC no falla en re-deploy)
- [x] Nombres globalmente únicos
- [x] Resolución automática de versión "latest"
- [ ] Documentación de usuario

---

## Comandos Útiles

### Desarrollo Local

```bash
# Iniciar servicios (automático en post-start.sh)
cd src/functions/api && func start --port 7071
cd src/functions/processor && func start --port 7073
cd src/frontend && npm run dev

# Detener servicios
pkill -f 'func start' && pkill -f 'vite'

# Test backup manual
curl -X POST http://localhost:7071/api/databases/{id}/backup

# Ver logs
ls .devcontainer/logs/
```

### Crear Nueva Release

```bash
# 1. Commit cambios
git add . && git commit -m "feat: descripción del cambio"
git push origin main

# 2. Crear tag y push (dispara GitHub Action)
git tag v1.0.3
git push origin v1.0.3

# 3. Verificar que el workflow completó
gh run list --workflow=build-release.yml --limit 1

# 4. Ver el release creado
gh release view v1.0.3
```

### Deployment a Azure

```bash
# Deploy con CLI (usa versión "latest" por defecto)
az deployment group create \
  --resource-group mi-rg \
  --template-file infra/main.bicep \
  --parameters appName=miapp adminEmail=admin@email.com

# Deploy con versión específica
az deployment group create \
  --resource-group mi-rg \
  --template-file infra/main.bicep \
  --parameters appName=miapp adminEmail=admin@email.com appVersion=v1.0.2

# Recompilar ARM template después de cambios en Bicep
cd infra && az bicep build --file main.bicep --outfile azuredeploy.json
```

### Verificar Deployment

```bash
# Ver estado del resource group
az resource list --resource-group mi-rg --output table

# Ver logs del deployment script
az deployment-scripts show-log \
  --resource-group mi-rg \
  --name deploy-application-code
```
