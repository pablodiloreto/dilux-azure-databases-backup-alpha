# Plan de Implementación - Dilux Database Backup

**Última actualización:** 2025-12-17

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

### v2: Auto-Update (diferido para después de v1)

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 7.1 | GitHub Releases | Usar GitHub API para check de versión | ⏳ Pendiente |
| 7.2 | Check Version | Frontend consulta nueva versión | ⏳ Pendiente |
| 7.3 | Notificación | Campanita "Nueva versión disponible" | ⏳ Pendiente |
| 7.4 | Update ARM | Re-deploy idempotente sin borrar datos | ⏳ Pendiente |
| 7.5 | Telemetría (opcional) | Endpoint para tracking de instalaciones | ⏳ Pendiente |

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
- [ ] Documentación de usuario

---

## Comandos Útiles

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
