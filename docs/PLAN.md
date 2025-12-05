# Plan de Implementación - Dilux Database Backup

**Fecha:** 2025-12-05
**Estado:** ✅ APROBADO
**Última actualización:** 2025-12-05

---

## Decisiones Confirmadas

| Tema | Decisión |
|------|----------|
| **UI Library** | Material UI (MUI) - ya implementado |
| **Multi-tenant** | ❌ No - Una instalación por cliente |
| **Notificaciones email/Teams** | ❌ No para v1 |
| **System Health** | ✅ Sí - Panel de estado de servicios |
| **Auto-update** | ⏸️ v2 - Diseñar v1 preparado para soportarlo |
| **Autenticación** | Azure AD en prod, bypass en dev |
| **Passwords** | Key Vault en prod, Table Storage en dev |

---

## Arquitectura Final

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + MUI)                     │
│  - Dashboard con stats y System Health                       │
│  - CRUD de configuraciones de backup                         │
│  - Historial de backups con descarga                         │
│  - Gestión de passwords                                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Function App                          │
│  - GET/POST/PUT/DELETE /api/databases                        │
│  - POST /api/databases/{id}/backup (trigger manual)          │
│  - POST /api/databases/test-connection                       │
│  - PUT /api/databases/{id}/password                          │
│  - GET /api/backups, /api/backups/files, /api/backups/download│
│  - GET /api/health, /api/system-status                       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Scheduler App   │ │ Processor App   │ │ Storage Account │
│                 │ │                 │ │                 │
│ - Timer 15min   │ │ - Queue trigger │ │ - Blobs (backups)│
│ - Evalúa DBs    │ │ - MySQL backup  │ │ - Queues (jobs) │
│ - Encola jobs   │ │ - PostgreSQL    │ │ - Tables (config)│
│                 │ │ - SQL Server    │ │                 │
│ - Cleanup timer │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## Fase 1: MVP Funcional

### 1.1 Frontend - CRUD de Databases

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 1.1.1 | Form Crear Database | Dialog: name, type (MySQL/PostgreSQL/SQL Server), host, port, database, username, password, schedule (15m/1h/6h/1d/1w), retention_days, compression | ✅ |
| 1.1.2 | Form Editar Database | Mismo form pre-poblado, password oculto (placeholder "••••••") | ✅ |
| 1.1.3 | Validaciones | Campos requeridos, formato host, puerto numérico | ✅ |
| 1.1.4 | Test Connection | Botón que prueba conectividad antes de guardar | ⬜ |

### 1.2 Backend - Endpoints faltantes

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 1.2.1 | Test Connection | `POST /api/databases/test-connection` - Prueba sin guardar | ⬜ |
| 1.2.2 | Update Password | `PUT /api/databases/{id}/password` | ⬜ |
| 1.2.3 | System Status | `GET /api/system-status` - Estado de servicios | ⬜ |

### 1.3 Backup Engines

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 1.3.1 | Fix PostgreSQL | Usar docker exec en dev (pg_dump v15 vs v12) | ✅ |
| 1.3.2 | Test SQL Server | Verificar sqlcmd con contenedor | ✅ |

### 1.4 Timer Triggers

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 1.4.1 | Fix AzureWebJobsStorage | Resolver 127.0.0.1 vs azurite | ✅ |
| 1.4.2 | Scheduler | Timer 15min que evalúa DBs y encola backups | ⬜ |
| 1.4.3 | Cleanup | Timer diario que borra backups viejos según retention_days | ⬜ |

---

## Fase 2: Dashboard Completo

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 2.1 | Storage Used | Stat card con tamaño total de blobs | ⬜ |
| 2.2 | Success Rate % | Ratio completed/(completed+failed) 24h | ⬜ |
| 2.3 | Backups Today | Contador de backups del día | ⬜ |
| 2.4 | System Health | Panel: API ✅, Processor ✅, Storage ✅, Scheduler ⚠️ | ⬜ |

---

## Fase 3: Gestión de Passwords

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 3.1 | Password Dialog | UI para cambiar password de una DB | ⬜ |
| 3.2 | Test antes de guardar | Probar conexión con nueva password | ⬜ |
| 3.3 | Key Vault (prod) | Guardar en Key Vault cuando `ENVIRONMENT=production` | ⬜ |
| 3.4 | Audit log | Registrar cambios de password | ⬜ |

---

## Fase 4: Retención y Cleanup

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 4.1 | CleanupOldBackups | Timer diario, borra según `retention_days` de cada DB | ⬜ |
| 4.2 | UI archivos | Lista de archivos blob con opción eliminar manual | ⬜ |

---

## Fase 5: Autenticación Azure AD

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 5.1 | MSAL React | Login/logout en frontend | ⬜ |
| 5.2 | JWT Backend | Validar tokens en Function Apps | ⬜ |
| 5.3 | Bypass dev | `ENVIRONMENT=development` → sin auth | ⬜ |

---

## Fase 6: Deploy One-Click

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 6.1 | ARM/Bicep | Templates para todos los recursos | ⬜ |
| 6.2 | Managed Identity | MI + RBAC assignments automáticos | ⬜ |
| 6.3 | Deploy Button | Botón en README.md | ⬜ |
| 6.4 | Installation ID | Generar ID único por instalación (prep para auto-update) | ⬜ |
| 6.5 | Version endpoint | `/api/version` retorna versión instalada | ⬜ |

---

## Fase 7: Auto-Update (v2)

> **Nota:** Diseñamos v1 preparado para esto, pero se implementa en v2.

| # | Tarea | Descripción | Estado |
|---|-------|-------------|--------|
| 7.1 | Registry Central | Function App que registra instalaciones | ⬜ v2 |
| 7.2 | Check version | Frontend consulta si hay nueva versión | ⬜ v2 |
| 7.3 | Campanita | UI notifica "Nueva versión disponible" | ⬜ v2 |
| 7.4 | Update ARM | Template que actualiza sin borrar datos | ⬜ v2 |

### Cómo funcionará:
1. Usuario instala con "Deploy to Azure" → se registra en Registry Central
2. Frontend consulta periódicamente `/api/latest-version` del Registry
3. Si hay nueva versión → muestra campanita 🔔
4. Usuario hace click → ejecuta ARM de update (solo código, no datos)
5. Registry actualiza la versión registrada

---

## Orden de Ejecución

### Sprint 1: MVP
- [x] Fix acceso frontend (401)
- [x] 1.3.1 - Fix PostgreSQL backup (docker exec)
- [x] 1.3.2 - Test SQL Server backup
- [x] 1.1.1 + 1.1.2 - Forms crear/editar database
- [x] 1.4.1 - Fix timer triggers (AzureWebJobsStorage)

### Sprint 2: Dashboard y UX
- [ ] 2.* - Stats completos + System Health
- [ ] 1.1.4 + 1.2.1 - Test connection
- [ ] 3.* - Gestión passwords

### Sprint 3: Production Ready
- [ ] 4.* - Retención y cleanup
- [ ] 5.* - Azure AD auth
- [ ] 6.* - Deploy one-click

### Sprint 4: v2
- [ ] 7.* - Auto-update system

---

## Checklist Pre-Release v1

- [ ] Todos los backups funcionan (MySQL, PostgreSQL, SQL Server)
- [ ] CRUD completo de databases desde UI
- [ ] Scheduler automático funcionando
- [ ] Cleanup de backups viejos
- [ ] Azure AD auth en producción
- [ ] Deploy to Azure button funcional
- [ ] Documentación de usuario
