# Dilux Database Backup - Estado del Proyecto

**Última actualización:** 2026-01-29

---

## ESTADO: v1 COMPLETA - SIN PENDIENTES

La versión 1.0 está **100% funcional** y lista para producción. No hay tareas pendientes bloqueantes.

### Deployment Verificado (2026-01-17)

| Componente | Estado | URL/Detalle |
|------------|--------|-------------|
| Infrastructure | ✅ Deployed | Resource Group: `dilux61-rg` |
| API Function App | ✅ 50 funciones registradas | `dilux61-ivhqtp-api.azurewebsites.net` |
| Scheduler Function App | ✅ Funcionando | `dilux61-ivhqtp-scheduler.azurewebsites.net` |
| Processor Function App | ✅ Funcionando | `dilux61-ivhqtp-processor.azurewebsites.net` |
| Frontend (Static Website) | ✅ Accesible | `dilux61stivhqtpmkv4p4q.z15.web.core.windows.net` |
| Health Check | ✅ Healthy | `/api/health` responde correctamente |
| Azure AD Auth | ✅ Configurado | App Registration creado automáticamente |

**Versión desplegada:** v1.0.16

---

## Funcionalidades Implementadas

### Backend (3 Azure Function Apps)

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
- **Status**: Panel de salud del sistema con alertas

### Infraestructura

- **Deploy to Azure Button**: Un click para desplegar todo
- **Script configure-auth.sh**: Wizard interactivo para configurar Azure AD post-deployment
- **Pre-built Assets**: GitHub Action construye ZIPs en cada release
- **RBAC Automático**: Managed Identity con roles configurados
- **Nombres Únicos**: Sufijo hash para evitar colisiones globales
- **Re-deploy Idempotente**: Se puede re-desplegar sin errores

### Seguridad

- **Azure AD Authentication**: MSAL React + JWT validation
- **Key Vault**: Para secrets en producción
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
| Audit Login/Logout | Frontend llama `/api/auth/events` solo en login/logout real |

---

## Historial de Releases

| Versión | Fecha | Cambios |
|---------|-------|---------|
| v1.0.0 | 2025-12-20 | Release inicial con pre-built assets |
| v1.0.1 | 2025-12-20 | Fix: RBAC resiliente (no falla en re-deploy) |
| v1.0.2 | 2025-12-20 | Fix: Nombres únicos para Function Apps |
| v1.0.3 | 2025-12-20 | Fix: Instalar jq en script de RBAC |
| v1.0.4 | 2025-12-21 | Fix: Compatibilidad CBL-Mariner |
| v1.0.5 | 2025-12-21 | Fix: Espera y retry para propagación de RBAC |
| v1.0.6 | 2025-12-22 | Fix: RBAC Contributor via Bicep nativo |
| v1.0.7+ | 2025-12-22 | Deployment automático completo (frontend + functions) |
| v1.0.16 | 2026-01-17 | **Versión estable verificada en producción** |

### Problemas Resueltos

Todos los problemas de deployment fueron resueltos:

1. **RBAC no propagaba a tiempo** → Solucionado con Bicep nativo
2. **Functions no se registraban (404)** → Solucionado en versiones recientes
3. **Frontend no se desplegaba** → Deployment automático a Blob Storage Static Website
4. **Nombres duplicados globalmente** → Sufijo hash único por RG + appName

---

## ✅ Completado: Soporte Flex Consumption (2026-01-17)

### Contexto

Microsoft anunció que el plan **Y1 (Linux Consumption)** llegará a **EOL el 30 de septiembre de 2028**.
Se recomienda migrar a **Flex Consumption (FC1)**, que además ofrece VNet Integration.

### Cambios Realizados

| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `infra/modules/appserviceplan.bicep` | ✅ Completado | Agregado SKU FC1 (FlexConsumption) |
| `infra/modules/functionapp.bicep` | ✅ Completado | Soporte condicional FC1 vs Y1/Premium, `scaleAndConcurrency` |
| `infra/main.bicep` | ✅ Completado | Parámetro `functionAppSku` con FC1 como default, descripción detallada |
| `scripts/deploy.sh` | ✅ Completado | Selector interactivo de plan con explicaciones de VNet |
| `infra/azuredeploy.json` | ✅ Completado | ARM template recompilado |
| `docs/PLAN.md` | ✅ Completado | Documentación actualizada |
| `docs/infra.md` | ✅ Completado | Actualizar sección de planes |

### Planes de Function Apps Soportados

| SKU | Nombre | VNet | Costo | Notas |
|-----|--------|------|-------|-------|
| **FC1** | Flex Consumption | ✅ Sí | ~$0-10/mes | **RECOMENDADO** - Default nuevo |
| Y1 | Consumption (Legacy) | ❌ No | ~$0-5/mes | EOL Sept 2028 |
| EP1 | Premium | ✅ Sí | ~$150/mes | Sin cold starts |
| EP2 | Premium | ✅ Sí | ~$300/mes | Alto rendimiento |
| EP3 | Premium | ✅ Sí | ~$600/mes | Máximo rendimiento |

---

## Features para v2 (Opcional - No Bloqueante)

Estas son mejoras opcionales para futuras versiones:

| Feature | Descripción | Prioridad |
|---------|-------------|-----------|
| Auto-Update | Notificación de nueva versión disponible | Baja |
| Telemetría | Tracking anónimo de instalaciones | Baja |
| Notificaciones | Email/webhook en fallos de backup | Media |
| Multi-tenant | Soporte para múltiples organizaciones | Baja |

---

## Comandos Útiles

### Deployment a Azure

```bash
# Opción 1: Script automático (recomendado) - incluye selector de plan interactivo
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash

# Opción 2: Deploy manual via CLI
az group create --name mi-rg --location eastus
az deployment group create \
  --resource-group mi-rg \
  --template-file infra/main.bicep \
  --parameters appName=miapp adminEmail=admin@email.com functionAppSku=FC1

# Opciones de functionAppSku:
#   FC1 = Flex Consumption (default, recomendado, VNet support)
#   Y1  = Consumption legacy (sin VNet, EOL 2028)
#   EP1/EP2/EP3 = Premium (VNet support, sin cold starts)
```

### Configurar Autenticación Post-Deployment

Si el App Registration no se creó automáticamente durante el deployment (porque el Managed Identity no tiene permisos de Microsoft Graph), la app quedará en modo `mock` sin autenticación real.

Para configurar Azure AD authentication, ejecuta el wizard interactivo:

```bash
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-auth.sh | bash
```

El script te guiará para:
1. Seleccionar la instalación de Dilux (Resource Group)
2. Crear o usar un App Registration existente
3. Configurar las Function Apps con el Client ID
4. Actualizar el frontend con la configuración de Azure AD

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

# 2. Crear tag (dispara GitHub Action)
git tag v1.0.x && git push origin v1.0.x

# 3. Verificar release
gh release view v1.0.x
```

### Verificar Deployment

```bash
# Health check
curl https://<app>-api.azurewebsites.net/api/health

# Listar funciones registradas
az functionapp function list --name <app>-api --resource-group <rg> --output table

# Ver logs del deployment
az deployment-scripts show-log --resource-group <rg> --name deploy-application-code
```

---

## Convención de Nombres Azure

| Recurso | Patrón | Ejemplo |
|---------|--------|---------|
| Function Apps | `{appName}-{6chars}-{type}` | `dilux61-ivhqtp-api` |
| Storage Account | `{appName}st{13chars}` | `dilux61stivhqtpmkv4p4q` |
| Static Website | `{storage}.z*.web.core.windows.net` | `dilux61stivhqtpmkv4p4q.z15.web.core.windows.net` |
| Key Vault | `{appName}-kv-{8chars}` | `dilux61-kv-ivhqtpmk` |

El sufijo único es determinístico (basado en RG + appName), permitiendo re-deploys idempotentes.
