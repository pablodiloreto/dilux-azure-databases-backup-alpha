# Plan de Implementación - Dilux Database Backup

**Última actualización:** 2025-12-08

---

## Estado Actual

### Qué funciona
- **API Function App** (puerto 7071): Health, CRUD databases, CRUD backup policies, trigger backup manual
- **Processor Function App** (puerto 7073): Queue trigger con tier info, backup MySQL/PostgreSQL/SQL Server
- **Scheduler Function App** (puerto 7072): Timer 15min evalúa tiers por policy, cleanup por tier
- **Frontend** (puerto 3000): Dashboard, DBs, Backups, Policies, Users, Settings, Status
- **Servicios Docker**: Azurite, MySQL 8.0, PostgreSQL 15, SQL Server 2022
- **Arranque automático**: Configurado en `post-start.sh` con `setsid`

### Fixes aplicados
| Fecha | Fix |
|-------|-----|
| 2025-12-08 | Storage Stats: Fix parsing blob path (`{db_id}/{YYYY}/...` en lugar de `{db_type}/{db_id}/...`) |
| 2025-12-08 | Backup History Filter: Fix `db_config_service.list()` → `db_config_service.get_all()` |
| 2025-12-08 | SQL Server: Container inestable por recursos (requiere 2GB RAM mínimo en Codespace) |
| 2025-12-08 | Policy Assignment: Engine.policy_id + Database.use_engine_policy para herencia de policies |
| 2025-12-08 | ServerFormDialog: Selector de Backup Policy, checkbox "Apply policy to all databases" |
| 2025-12-08 | DatabaseFormDialog: Opción "Use Server Policy" cuando engine tiene policy definida |
| 2025-12-08 | DatabasesPage: Indicador "Inherited" en columna Policy cuando usa policy del server |
| 2025-12-08 | Scheduler: Resuelve policy desde engine cuando database.use_engine_policy=True |
| 2025-12-08 | DatabaseFormDialog: Selector de Server + Toggle "Use server credentials" |
| 2025-12-08 | DatabasesPage: Columna Server, devuelve `engine_name` desde API |
| 2025-12-08 | Backend: `use_engine_credentials` en create/update/test-connection |
| 2025-12-08 | ServersPage: Mensaje mejorado al aplicar credenciales a databases |
| 2025-12-08 | Audit Details: Todos los audit logs ahora incluyen campos completos para filtrado y trazabilidad |
| 2025-12-08 | Audit API: Nuevos filtros `database_type`, `engine_id`, `resource_name` para búsqueda avanzada |
| 2025-12-08 | Audit filters: Autocomplete para Server (engines), Type filter, Alias (databases) |
| 2025-12-08 | Layout stability: disableScrollLock global + CSS overrides para prevenir layout shift |
| 2025-12-08 | Skeleton loading: TableSkeleton, CardListSkeleton, LoadingOverlay con LinearProgress |
| 2025-12-08 | BackupsPage: Columna Server agregada, orden columnas Server→Database→Details→Trigger→Date→Status→Actions |
| 2025-12-08 | BackupsPage: Info Dialog con detalles completos del backup (error details para failed, download para completed) |
| 2025-12-08 | ResponsiveTable: Breakpoint cambiado de `md` a `lg` para cambiar a cards antes del scroll horizontal |
| 2025-12-08 | ResponsiveTable: Actions column centrada (align="center") |
| 2025-12-08 | Backend: GET /api/backups ahora incluye `engine_id`, `engine_name`, `tier` en response |
| 2025-12-07 | Mobile responsiveness: ResponsiveTable, SettingRow, stats cards grid, todas las páginas |
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
- ✅ Rename: "Dilux Backup" → "Dilux DB Backups" en sidebar
- ✅ Backup Alerts: Sistema de alertas para DBs con fallos consecutivos (2+)
- ✅ Dashboard System Health: Fila "Backups" integrada, clickeable cuando hay alertas
- ✅ Status Page: Tabla de alertas con link a config de cada DB
- ✅ Deep linking: `/databases?edit={id}` abre dialog de edición automáticamente
- ✅ Utils centralizados: `formatFileSize()` en `src/utils/format.ts`
- ✅ Backups Page: Botón "Search" para filtros, mejor UX
- ✅ Settings: Opción access_requests_enabled para gestión de usuarios
- ✅ Users Page: Paginación, gestión de solicitudes de acceso
- ✅ ResponsiveTable: Componente reutilizable tabla/cards para mobile
- ✅ Mobile: DatabasesPage, BackupsPage, PoliciesPage con ResponsiveTable
- ✅ Mobile: StatusPage Backup Alerts con ResponsiveTable
- ✅ Mobile: UsersPage Pending Access Requests con ResponsiveTable
- ✅ Mobile: SettingsPage con SettingRow component (evita overlapping)
- ✅ Mobile: BackupsPage stats cards grid 2x2 alineados
- ✅ Mobile: StoragePage nueva página con lista de backups
- ✅ Audit: Sistema completo de logs de auditoría con filtros y paginación
- ✅ Audit Page: Nueva página /audit para ver historial de acciones (solo Admin)
- ✅ Audit API: GET /api/audit con filtros, GET /api/audit/actions, GET /api/audit/resource-types
- ✅ Audit logging integrado en endpoints de databases, backups, policies, users
- ✅ BackupsPage: Delete individual y bulk con checkboxes (movido desde StoragePage)
- ✅ StoragePage: Simplificada a solo estadísticas (sin lista de archivos)
- ✅ Loading Skeletons: TableSkeleton, CardListSkeleton, LoadingOverlay components (MUI theme-aware)
- ✅ Layout Stability: disableScrollLock global en theme + CSS overrides (previene layout shift)
- ✅ Audit Filters: Autocomplete para Alias (databases), Server (engines), Type (mysql/postgresql/sqlserver)
- ✅ Audit: Columna "Target" renombrada a "Alias"
- ✅ Audit Details: Todos los audit logs incluyen campos completos (`database_type`, `engine_id`, `host`, `port`, etc.)
- ✅ Audit API: Nuevos filtros `database_type`, `engine_id`, `resource_name` en GET /api/audit
- ✅ BackupsPage: Columna Server, columna Trigger, Info Dialog con detalles completos
- ✅ BackupsPage: Orden columnas Server→Database→Details→Trigger→Date→Status→Actions
- ✅ ResponsiveTable: Breakpoint `lg` para cambiar a cards antes de scroll horizontal (todas las tablas)
- ✅ ResponsiveTable: Actions column centrada

### Sprint 2.5: Backup Policies ✅ COMPLETADO

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| P.1 | BackupPolicy Model | Modelo con 5 tiers (hourly/daily/weekly/monthly/yearly) | ✅ Completado |
| P.2 | TierConfig | Cada tier: enabled, keep_count, schedule config | ✅ Completado |
| P.3 | Policies API | CRUD endpoints `/api/backup-policies` | ✅ Completado |
| P.4 | Policies Page | Nueva sección "Policies" en sidebar | ✅ Completado |
| P.5 | Policies UI | Tabla con crear/editar/eliminar policies | ✅ Completado |
| P.6 | Database Form | Dropdown dinámico que carga policies desde API | ✅ Completado |
| P.7 | Seed Defaults | 3 políticas predefinidas (Production Critical, Standard, Development) | ✅ Completado |
| P.8 | Scheduler Refactor | Evaluación por tier con should_run_tier() | ✅ Completado |
| P.9 | Cleanup Refactor | Retención por tier según keep_count | ✅ Completado |
| P.10 | BackupResult.tier | Campo tier para identificar backups por nivel | ✅ Completado |

**Políticas predefinidas:**
- **Production Critical:** 24h/15d/8w/4m/2y
- **Production Standard:** 12h/7d/4w/2m/1y
- **Development:** 0h/7d/2w/0m/0y

**Objetivo:** Sistema completo de políticas de backup con retención granular por tier, reemplazando el campo schedule/retention_days anterior.

### Sprint 3: Engines + Credential Management ✅ COMPLETADO

> **Documento de diseño:** `docs/ENGINES_DESIGN.md`

#### Engines (Servidores)
| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| E.1 | Engine Model | Modelo Engine en `shared/models/engine.py` | ✅ Completado |
| E.2 | Engine Storage | CRUD en Table Storage para Engines | ✅ Completado |
| E.3 | Engine API | Endpoints CRUD + test + discover | ✅ Completado |
| E.4 | Discovery | Listar databases en un servidor | ✅ Completado |
| E.5 | Migration Script | Migrar DBs existentes a Engines | ✅ Completado |
| E.6 | ServersPage | Nueva página UI `/servers` para gestionar engines | ✅ Completado |
| E.7 | DatabasesPage Update | Selector de engine, columna Server, toggle credenciales | ✅ Completado |

#### Gestión de Credenciales
| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| C.1 | Credential Inheritance | DBs heredan de Engine (`use_engine_credentials`) | ✅ Completado |
| C.2 | Apply to All | Checkbox en edit engine "Apply to X databases" | ✅ Completado |
| C.3 | Key Vault | Guardar en Key Vault en producción | ⏳ Pendiente |

#### Autenticación Azure AD
| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 5.1 | MSAL React | Login/logout en frontend con @azure/msal-react | ⏳ Pendiente |
| 5.2 | JWT Backend | Validar tokens en Function Apps | ⏳ Pendiente |
| 5.3 | Bypass Dev | Sin auth cuando ENVIRONMENT=development | ✅ Completado |

### Sprint 3.5: Policy Assignment ✅ COMPLETADO

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| PA.1 | Policy a Server | Opción de asignar policy a nivel de Engine | ✅ Completado |
| PA.2 | Herencia | DBs pueden heredar policy del server o usar propia | ✅ Completado |
| PA.3 | UI Engine | Selector de policy en ServerFormDialog | ✅ Completado |
| PA.4 | UI Database | Mostrar si policy es heredada o propia | ✅ Completado |
| PA.5 | Scheduler | Respetar policy de engine cuando DB no tiene propia | ✅ Completado |

**Implementación técnica:**
- Engine model: Nuevo campo `policy_id` para definir policy por defecto del servidor
- Database model: Nuevo campo `use_engine_policy` (boolean) para heredar policy del engine
- API: Endpoints de Engine actualizados para manejar `policy_id` y `apply_policy_to_all_databases`
- Scheduler: Resuelve policy desde engine cuando `use_engine_policy=True`
- Frontend: Selector de policy en ServerFormDialog, opción "Use Server Policy" en DatabaseFormDialog
- UI: Indicador "Inherited" en columna Policy de DatabasesPage

**Comportamiento de la herencia:**

| Escenario | Comportamiento |
|-----------|----------------|
| Server existente + agregar policy | Databases existentes **NO cambian** (independencia) |
| Crear database nueva en server con policy | Se **pre-selecciona** herencia (pero se puede cambiar) |
| Cambiar policy del server | Solo afecta databases con **herencia activa** |
| Checkbox "Apply policy to all" | Fuerza herencia en **todas** las databases del server |

**Notas de UX:**
- La opción "Use Server Policy" en DatabaseFormDialog solo aparece si el server tiene policy definida
- El chip "Inherited" en la tabla de databases indica visualmente cuáles usan herencia
- La independencia de cada database siempre es opcional, nunca se fuerza automáticamente

### Sprint 3.6: Seed Data ✅ COMPLETADO

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| SD.1 | Reset Script | Script para borrar toda la data de Azure Storage | ✅ Completado |
| SD.2 | Seed Servidores | 3 engines (MySQL, PostgreSQL, SQL Server) | ✅ Completado |
| SD.3 | Seed Databases | 9 DBs (3 por motor) con distintas configs | ✅ Completado |
| SD.4 | Seed Policies | 3 policies (critical, standard, development) | ✅ Completado |
| SD.5 | Seed Users | 3 usuarios (admin, operator, viewer) | ✅ Completado |
| SD.6 | Backup History | 60 días de historial con ~600 registros | ✅ Completado |
| SD.7 | Audit Logs | ~500 registros de auditoría | ✅ Completado |
| SD.8 | Docker DBs | Opción para crear DBs con 50-200MB de datos | ✅ Completado |

**Script:** `scripts/reset-and-seed.py`

**Uso:**
```bash
# Full reset + seed (con setup de Docker DBs)
python scripts/reset-and-seed.py

# Quick mode - sin setup de DBs ni archivos de backup
python scripts/reset-and-seed.py --skip-db-setup --skip-backups

# Solo reset (borrar toda la data)
python scripts/reset-and-seed.py --reset-only

# Solo seed (no borrar)
python scripts/reset-and-seed.py --seed-only
```

**Datos sembrados:**
- **3 Servers:** MySQL Production, PostgreSQL Production, SQL Server Production
- **9 Databases:**
  - MySQL: ecommerce_db (150MB), analytics_db (100MB), staging_db (50MB)
  - PostgreSQL: users_db (120MB), inventory_db (80MB), logs_db (200MB)
  - SQL Server: finance_db (180MB), reports_db (100MB), dev_db (40MB)
- **3 Users:** admin@dilux.com, operator@dilux.com, viewer@dilux.com
- **3 Policies:** production-critical, production-standard, development
- **~600 Backups:** 60 días de historial con 95% success rate
- **500 Audit Logs:** Variados (backup_completed, user_login, etc.)

### 🔴 PRÓXIMO PASO INMEDIATO: Testing Integral

#### Plan de Testing con Seed Data
| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| T.1 | Reset y Seed | Ejecutar full reset-and-seed | ✅ Completado |
| T.2 | Dashboard | Verificar stats y gráficos con 60 días de datos | ✅ Completado |
| T.3 | Backups Page | Paginación, filtros, Info Dialog | ✅ Completado |
| T.4 | Servers Page | 3 servers con sus 3 DBs cada uno | ✅ Completado |
| T.5 | Databases Page | Policy inheritance, "Inherited" chips | ✅ Completado |
| T.6 | Audit Page | 500 logs con filtros funcionando | ✅ Completado (501 logs generados) |
| T.7 | Test Connection | Probar conexión a cada DB | ✅ Completado (MySQL/PostgreSQL OK, SQL Server requiere más RAM) |
| T.8 | Manual Backup | Trigger backup desde UI | ⏳ Pendiente |
| T.9 | Download Backup | Descargar un backup existente | ⏳ Pendiente |
| T.10 | Mobile View | Responsive en todas las páginas | ⏳ Pendiente |

#### Bugs Encontrados y Corregidos
| # | Bug | Fix | Estado |
|---|-----|-----|--------|
| B.1 | Filtro por server en backup history fallaba | `db_config_service.list()` → `get_all()` | ✅ Corregido |
| B.2 | SQL Server container inestable | Limitación de recursos Codespace (requiere 2GB RAM) | ⚠️ Documentado |
| B.3 | "Databases without server" en Storage page | Fix parsing blob path en storage-stats | ✅ Corregido |
| B.4 | Solo 1 audit log en seed | Script standalone `scripts/generate_audit_logs.py` | ✅ Corregido |

#### Mejoras UX Completadas
| # | Mejora | Descripción | Estado |
|---|--------|-------------|--------|
| UX.1 | Discovery popup paginado | Search + "Load more" para servers con muchas DBs | ✅ Completado |

**Qué debería pasar:**

1. **Dashboard:**
   - Storage Used: ~13GB de datos de backups (fake sizes)
   - Backups Today: Según periodo seleccionado
   - Success Rate: ~95% (con algunos failed)
   - System Health: Todos green excepto posibles alertas de backups fallidos

2. **Servers Page:**
   - 3 servers listados con sus DBs count
   - Click en cada uno muestra 3 DBs
   - Policy assigned a cada server

3. **Databases Page:**
   - 9 databases (3 por engine)
   - Columna "Server" muestra engine name
   - Columna "Policy" con chips "Inherited" donde corresponde
   - Filtro por server funciona

4. **Backups Page:**
   - ~600 backups paginados
   - Filtro por Server, Database, Status funciona
   - Info dialog muestra detalles (tier, file size, etc.)
   - Algunos con status "failed" y error_message

5. **Audit Page:**
   - ~500 logs
   - Filtros por Action, Server, Type funcionan
   - Variety de acciones: backup_completed, backup_failed, user_login, etc.

6. **Policies Page:**
   - 3 policies (system policies)
   - Pueden verse pero no editarse (is_system=True)

7. **Users Page:**
   - 3 users: admin, operator, viewer
   - Tabla con roles

---

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
