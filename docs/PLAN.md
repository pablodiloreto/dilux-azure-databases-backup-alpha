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

### 🔴 PRÓXIMO PASO INMEDIATO: Seed Data + Policy Assignment

#### Seed Data para Testing
| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| SD.1 | Seed Script | Script que crea datos de prueba automáticamente | ⏳ Pendiente |
| SD.2 | Servidores | Crear engines para MySQL, PostgreSQL, SQL Server | ⏳ Pendiente |
| SD.3 | Databases | Múltiples DBs por motor (que existan y funcionen) | ⏳ Pendiente |
| SD.4 | Policies | Asignar policies variadas a las databases | ⏳ Pendiente |
| SD.5 | Backup History | Crear registros de backups históricos ficticios (sin archivo real) | ⏳ Pendiente |

**Objetivo:** Poder probar el sistema con datos realistas sin configuración manual.

#### Policy Assignment (PENDIENTE CRÍTICO)
| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| PA.1 | Policy a Server | Opción de asignar policy a nivel de Engine | ⏳ Pendiente |
| PA.2 | Herencia | DBs pueden heredar policy del server o usar propia | ⏳ Pendiente |
| PA.3 | UI Engine | Selector de policy en ServerFormDialog | ⏳ Pendiente |
| PA.4 | UI Database | Mostrar si policy es heredada o propia | ⏳ Pendiente |
| PA.5 | Scheduler | Respetar policy de engine cuando DB no tiene propia | ⏳ Pendiente |

**Problema actual:** Las policies solo se aplican a nivel de database. No hay forma de aplicar una policy a un server y que sus databases la hereden.

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
