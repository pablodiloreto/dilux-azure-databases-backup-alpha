# Plan de Implementación - Dilux Database Backup

**Última actualización:** 2025-12-07

---

## Estado Actual

### Qué funciona
- **API Function App** (puerto 7071): Health, CRUD databases, trigger backup manual
- **Processor Function App** (puerto 7073): Queue trigger, backup MySQL/PostgreSQL/SQL Server
- **Frontend** (puerto 3000): Dashboard, lista DBs, forms crear/editar, historial backups
- **Servicios Docker**: Azurite, MySQL 8.0, PostgreSQL 15, SQL Server 2022
- **Arranque automático**: Configurado en `post-start.sh`

### Fixes aplicados
| Fecha | Fix |
|-------|-----|
| 2025-12-07 | Backup history: Orden correcto descendente por fecha (offset pagination en backend) |
| 2025-12-07 | Dashboard: Backups y Success Rate con selectores de período sincronizados |
| 2025-12-07 | Success Rate: Muestra "N/A" cuando no hay backups en el período |
| 2025-12-07 | Dashboard: Cards con etiquetas "(current)", links de navegación |
| 2025-12-07 | Nueva página /status con información detallada del sistema |
| 2025-12-07 | Sidebar: Menú Status agregado, botón collapse solo con ícono |
| 2025-12-06 | Dashboard: Success Rate con selector de período (1d/7d/30d/all) aislado en su propio componente |
| 2025-12-06 | Dashboard: Reorden de cards (Databases, Storage, Backups Today, Success Rate) con altura consistente |
| 2025-12-06 | Test Connection: API endpoint + botón en formulario de DB para probar conectividad antes de guardar |
| 2025-12-06 | Cleanup Timer: Timer diario a las 2AM que elimina backups según retention_days de cada DB |
| 2025-12-05 | Filtro de databases con búsqueda server-side: híbrido (primeras 50 + search API) para escalar a cientos de DBs |
| 2025-12-05 | Autocomplete Database: Searchable con debounce 300ms, muestra tipo y host en opciones |
| 2025-12-05 | Backup history ordenado por fecha descendente: inverted timestamp en RowKey (backup.py, migrate_backup_rowkeys.py) |
| 2025-12-05 | Settings en Table Storage: dark mode, retention, compression persisten en backend (settings.py, function_app.py, SettingsContext.tsx) |
| 2025-12-05 | Server-side pagination con continuation tokens: eficiencia en Azure Functions (storage_service.py, function_app.py, BackupsPage.tsx) |
| 2025-12-05 | Division by zero en backup vacío: validar datos antes de comprimir (base_engine.py) |
| 2025-12-05 | Backup history no mostraba datos: quitar `select=["*"]` en query_entities (storage_service.py) |
| 2025-12-05 | JSON serialize datetime: usar `model_dump(mode="json")` en API (function_app.py) |
| 2025-12-05 | HMR en Codespaces (vite.config.ts: clientPort 443) |
| 2025-12-05 | PostgreSQL backup via docker exec (version mismatch) |
| 2025-12-05 | Timer triggers AzureWebJobsStorage → hostname azurite |
| 2025-12-05 | Arranque automático de servicios en post-start.sh |
| 2025-12-01 | Password en Table Storage (dev mode) |
| 2025-12-01 | ContentSettings en Blob Upload |
| 2025-12-01 | Queue Message Encoding (host.json) |

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

---

## Tareas Pendientes

### Sprint 2: Dashboard y UX ✅ COMPLETADO

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 1.1.4 | Test Connection UI | Botón que prueba conectividad antes de guardar | ✅ Completado |
| 1.2.1 | Test Connection API | `POST /api/databases/test-connection` | ✅ Completado |
| 1.2.3 | System Status API | `GET /api/system-status` | ✅ Completado |
| 1.4.2 | Scheduler | Timer 15min que evalúa DBs y encola backups | ✅ Ya existía |
| 1.4.3 | Cleanup Timer | Timer diario 2AM que borra backups viejos | ✅ Completado |
| 2.1 | Storage Used | Stat card con tamaño total de blobs | ✅ Completado |
| 2.2 | Success Rate | Ratio completed/(completed+failed) 24h | ✅ Completado |
| 2.3 | Backups Today | Contador de backups del día | ✅ Completado |
| 2.4 | System Health UI | Panel: API, Storage, Databases | ✅ Completado |

**Mejoras adicionales (no planificadas):**
- ✅ Dark mode sin flash (localStorage)
- ✅ Sidebar colapsable con estado persistente
- ✅ Breadcrumbs navigation
- ✅ Favicon (cloud backup icon)
- ✅ Dark mode toggle en navbar
- ✅ Success Rate con selector de período (1d/7d/30d/all)
- ✅ Dashboard cards con altura consistente y orden optimizado
- ✅ Backups card con selector de período sincronizado con Success Rate
- ✅ Success Rate muestra "N/A" cuando no hay backups (en lugar de 100%)
- ✅ Cards con etiquetas "(current)" para Databases y Storage
- ✅ Links de navegación: "Manage" en Databases, "View all" en Recent Backups
- ✅ Página /status con información detallada del sistema
- ✅ Menú "Status" en sidebar debajo de Settings
- ✅ Botón collapse del sidebar solo con ícono (sin texto)

### Sprint 3: Production Ready

| # | Tarea | Descripción |
|---|-------|-------------|
| 1.2.2 | Update Password API | `PUT /api/databases/{id}/password` |
| 3.1 | Password Dialog | UI para cambiar password |
| 3.2 | Test + Save | Probar conexión antes de guardar password |
| 3.3 | Key Vault | Guardar en Key Vault en producción |
| 4.1 | Cleanup Job | Timer diario según retention_days |
| 4.2 | UI Archivos | Lista de blobs con opción eliminar |
| 5.1 | MSAL React | Login/logout en frontend |
| 5.2 | JWT Backend | Validar tokens en Function Apps |
| 5.3 | Bypass Dev | Sin auth cuando ENVIRONMENT=development |

### Sprint 4: Deploy

| # | Tarea | Descripción |
|---|-------|-------------|
| 6.1 | ARM/Bicep | Templates para todos los recursos |
| 6.2 | Managed Identity | MI + RBAC automáticos |
| 6.3 | Deploy Button | Botón en README.md |
| 6.4 | Installation ID | ID único por instalación |
| 6.5 | Version Endpoint | `/api/version` |

### v2: Auto-Update (diferido)

| # | Tarea | Descripción |
|---|-------|-------------|
| 7.1 | Registry Central | Function App que registra instalaciones |
| 7.2 | Check Version | Frontend consulta nueva versión |
| 7.3 | Notificación | Campanita "Nueva versión disponible" |
| 7.4 | Update ARM | Template que actualiza sin borrar datos |

---

## Checklist Pre-Release v1

- [x] Backups funcionan (MySQL, PostgreSQL, SQL Server)
- [x] CRUD databases desde UI
- [x] Scheduler automático funcionando
- [x] Cleanup de backups viejos (timer diario 2AM)
- [ ] Azure AD auth en producción
- [ ] Deploy to Azure button
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
