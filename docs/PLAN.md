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

**Convención de nombres (v1.0.2+):**
```
appName = "dilux"  →  dilux-abc123-api, dilux-abc123-scheduler, etc.
                          └──────┘
                          sufijo único basado en RG + appName
```

### Pendiente: Validar Deploy v1.0.5

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 9.1 | Deploy v1.0.5 | Probar deploy completo a Azure | ⏳ En prueba |
| 9.2 | Verificar API | Probar /api/health | ⏳ Pendiente |
| 9.3 | Verificar Auth | Login con Azure AD | ⏳ Pendiente |
| 9.4 | Deploy Frontend | Desplegar frontend manualmente | ⏳ Pendiente |
| 9.5 | Test Backup | Crear DB y ejecutar backup | ⏳ Pendiente |

**Historial de errores:**
- v1.0.2: Faltaba `jq` en container Azure CLI → Corregido en v1.0.3
- v1.0.3: `apk add` no existe en CBL-Mariner (Azure CLI no usa Alpine) → Corregido en v1.0.4
- v1.0.4: RBAC role assignments no propagados a tiempo → Corregido en v1.0.5

**Nota v1.0.4+:** El deployment script solo despliega las Function Apps. El frontend (Static Web App) debe desplegarse por separado usando SWA CLI o GitHub Actions.

**Nota v1.0.5:** El script ahora espera 60s después de crear role assignments y reintenta hasta 5 veces con delays incrementales para manejar la propagación de Azure AD RBAC.

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
