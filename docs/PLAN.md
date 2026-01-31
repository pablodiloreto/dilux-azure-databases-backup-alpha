# Dilux Database Backup - Estado del Proyecto

**Última actualización:** 2026-01-31

---

## ESTADO: v1 COMPLETA (Y1/EP*) - FC1 EN PROGRESO

La versión 1.0 está **100% funcional** para planes Y1 y EP1/EP2/EP3.

⚠️ **Flex Consumption (FC1):** Deployment manual funciona, deployment automatizado tiene problemas. Ver sección "EN PROGRESO: Soporte Flex Consumption".

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

## ⚠️ EN PROGRESO: Soporte Flex Consumption (2026-01-31)

**Estado actual:** Deployment MANUAL funciona. Deployment AUTOMATIZADO (deploy.sh / Deploy to Azure) NO funciona.

### Contexto

Microsoft anunció que el plan **Y1 (Linux Consumption)** llegará a **EOL el 30 de septiembre de 2028**.
Se recomienda migrar a **Flex Consumption (FC1)**, que además ofrece VNet Integration.

### Problemas Encontrados con FC1 (TODOS RESUELTOS)

Flex Consumption tiene diferencias importantes vs Y1/Premium:

| Problema | Descripción | Estado |
|----------|-------------|--------|
| `FUNCTIONS_WORKER_RUNTIME` | FC1 configura runtime en `functionAppConfig.runtime`, NO en appSettings | ✅ Fix en v1.0.19 |
| 1 App por Plan | FC1 solo permite 1 Function App por App Service Plan | ✅ Fix en v1.0.20 (3 planes) |
| Deployment Method | FC1 necesita `config-zip --build-remote true` (NO `deploy --src-path`) | ✅ Fix en v1.0.24 |
| Shared Deploy Container | FC1 usa blob container para deploy; compartido sobrescribe ZIPs | ✅ Fix en v1.0.25 |
| SCM_DO_BUILD_DURING_DEPLOYMENT | `--build-remote` setea setting que FC1 no soporta; restart antes de deploy | ✅ Fix en v1.0.26 |

### Solución Final (v1.0.24)

El método correcto para **FC1 + Python** es:

```bash
az functionapp deployment source config-zip \
  --resource-group $RG \
  --name $APP \
  --src $ZIP \
  --build-remote true \
  --timeout 600
```

**Clave:** `--build-remote true` indica a Azure que ejecute `pip install -r requirements.txt` durante el deployment.

**Métodos que NO funcionan:**
- `az functionapp deploy --src-path` → HTTP 415 (Unsupported Media Type)
- `WEBSITE_RUN_FROM_PACKAGE` → No hace remote build, Python deps no se instalan

### Archivos Modificados (desde v1.0.16)

| Archivo | Cambios |
|---------|---------|
| `infra/modules/functionapp.bicep` | Runtime settings condicionales, 2 recursos (Standard vs Flex) |
| `infra/modules/appserviceplan.bicep` | Agregado SKU FC1 |
| `infra/main.bicep` | 3 App Service Plans para FC1, variable `isFlexConsumption` |
| `infra/modules/code-deployment.bicep` | Función `deploy_flex_consumption()` para FC1 |
| `scripts/configure-auth.sh` | **NUEVO** - Wizard para configurar Azure AD post-deployment |

### Planes de Function Apps Soportados

| SKU | Nombre | VNet | Costo | Estado |
|-----|--------|------|-------|--------|
| **FC1** | Flex Consumption | ✅ Sí | ~$0-10/mes | ✅ **Funciona (v1.0.24)** |
| Y1 | Consumption (Legacy) | ❌ No | ~$0-5/mes | ✅ Funciona |
| EP1 | Premium | ✅ Sí | ~$150/mes | ✅ Funciona |
| EP2 | Premium | ✅ Sí | ~$300/mes | ✅ Funciona |
| EP3 | Premium | ✅ Sí | ~$600/mes | ✅ Funciona |

### Releases Recientes

| Versión | Fecha | Cambio |
|---------|-------|--------|
| v1.0.18 | 2026-01-29 | feat: configure-auth.sh wizard |
| v1.0.19 | 2026-01-29 | fix: remover FUNCTIONS_WORKER_RUNTIME de appSettings para FC1 |
| v1.0.20 | 2026-01-29 | fix: crear 3 App Service Plans separados para FC1 |
| v1.0.21 | 2026-01-29 | fix: deployment via Blob Storage para FC1 (descartado) |
| v1.0.22 | 2026-01-29 | fix: simplificar a `az functionapp deploy --src-path` |
| v1.0.23 | 2026-01-29 | fix: comparación case-insensitive para IS_FLEX_CONSUMPTION |
| v1.0.24 | 2026-01-31 | fix: FC1 deployment usando `config-zip --build-remote true` |
| v1.0.25 | 2026-01-31 | fix: containers separados para deployment de cada Function App |
| v1.0.26 | 2026-01-31 | fix: FC1 deployment sin --build-remote + restart previo |
| v1.0.27 | 2026-01-31 | fix: eliminar SCM_DO_BUILD_DURING_DEPLOYMENT + config-zip sin flags |
| v1.0.28 | 2026-01-31 | **fix: esperar 3 min + verificar SCM endpoint antes de deploy FC1** |

### 🧪 Historial de Tests FC1

| Versión | Resultado | Problema |
|---------|-----------|----------|
| v1.0.19 | ❌ | `FUNCTIONS_WORKER_RUNTIME` en appSettings no permitido |
| v1.0.20 | ❌ | FC1 solo permite 1 app por plan |
| v1.0.21 | ❌ | Usaba método blob pero `IS_FLEX_CONSUMPTION` no se detectaba |
| v1.0.22 | ❌ | Simplificado a `--src-path` pero `IS_FLEX_CONSUMPTION` = "True" vs "true" |
| v1.0.23 | ❌ | Fix case-insensitive OK, pero `--src-path` retorna **HTTP 415** |
| v1.0.24 | ❌ | `config-zip` funciona pero container compartido sobrescribe ZIPs |
| v1.0.25 | ❌ | Containers OK pero `--build-remote` setea setting incompatible con FC1 |
| v1.0.26 | ❌ | Restart OK pero `--build-remote false` no instala dependencias |
| v1.0.27 | ❌ | Fix correcto pero SCM endpoint no está listo (404) - poco tiempo de espera |
| v1.0.28 | ❌ | Espera 3 min + verifica SCM, pero CLI sigue seteando SCM_DO_BUILD_DURING_DEPLOYMENT |

**Nota:** v1.0.28 fue verificado manualmente (dilux68-rg) pero falla en deployment automatizado.

### ⚠️ PROBLEMA PENDIENTE: Deployment Automatizado FC1

**Fecha:** 2026-01-31

**Estado:** El deployment manual funciona pero el automatizado (via deploy.sh o Deploy to Azure) falla consistentemente.

#### El Problema Fundamental

Azure CLI `az functionapp deployment source config-zip` **automáticamente** setea el app setting `SCM_DO_BUILD_DURING_DEPLOYMENT` incluso cuando NO se usa el flag `--build-remote`. FC1 **rechaza** este setting (ni `true` ni `false` funcionan).

```
Error: "SCM_DO_BUILD_DURING_DEPLOYMENT" is not a supported configuration setting for Flex Consumption apps
```

#### Métodos de Deployment Probados

| Método | Comando | Resultado |
|--------|---------|-----------|
| config-zip + build-remote true | `az functionapp deployment source config-zip --build-remote true` | ❌ Setea SCM_DO_BUILD_DURING_DEPLOYMENT que FC1 rechaza |
| config-zip + build-remote false | `az functionapp deployment source config-zip --build-remote false` | ❌ No instala dependencias Python |
| config-zip sin flags | `az functionapp deployment source config-zip` | ❌ CLI igual setea el app setting |
| az functionapp deploy | `az functionapp deploy --src-path` | ❌ HTTP 415 (Unsupported Media Type) |
| Kudu API zipdeploy | `POST /api/zipdeploy` | ❌ HTTP 401 "not supported for Flex Consumption" |
| OneDeploy API | `POST /api/publish` | ❌ HTTP 404 |
| Blob directo | Upload a container deployments-xxx | ❌ 0 funciones cargadas |

#### Lo Que SÍ Funciona (Manual)

Cuando se hace **manualmente** con suficiente tiempo de espera después de crear la infra:

1. Esperar 5-10 minutos después de crear Function App
2. Eliminar app settings problemáticos:
   ```bash
   az functionapp config appsettings delete --name $APP --resource-group $RG --setting-names SCM_DO_BUILD_DURING_DEPLOYMENT WEBSITE_RUN_FROM_PACKAGE
   ```
3. Reiniciar la Function App:
   ```bash
   az functionapp restart --name $APP --resource-group $RG
   ```
4. Esperar 45+ segundos
5. Hacer el deploy:
   ```bash
   az functionapp deployment source config-zip --name $APP --resource-group $RG --src $ZIP
   ```

**Esto funciona porque:**
- El SCM endpoint ya está completamente inicializado
- Los settings se eliminan ANTES de que CLI los vuelva a crear
- El restart limpia el estado

#### Por Qué Falla Automatizado

1. **Timing**: El deployment script corre inmediatamente después de crear la infra (~3 min), pero el SCM endpoint necesita 5-10 min
2. **Race condition**: Aunque eliminamos los settings, el CLI los vuelve a crear durante `config-zip`
3. **No hay forma de evitar**: Azure CLI no tiene flag para NO setear `SCM_DO_BUILD_DURING_DEPLOYMENT`

#### RGs de Prueba Fallidos

| RG | Versión | Problema |
|----|---------|----------|
| dilux69-rg | v1.0.24 | Container compartido |
| dilux70-rg | v1.0.25 | SCM_DO_BUILD_DURING_DEPLOYMENT |
| dilux71-rg | v1.0.26 | build-remote false no instala deps |
| dilux73-rg | v1.0.27 | SCM 404 (timing) |
| dilux74-rg | v1.0.27 | SCM 404 (timing) |
| dilux75-rg | v1.0.28 | SCM 404 (timing) |
| dilux81-rg | v1.0.28 | Blob directo: 0 funciones |

#### Posibles Soluciones a Investigar

1. **Azure Functions Core Tools**: `func azure functionapp publish` puede tener diferente comportamiento
2. **GitHub Actions**: Usar `azure/functions-action@v1` en lugar de CLI
3. **REST API directo**: Investigar si hay API que no setee el app setting
4. **Mayor tiempo de espera**: Aumentar a 10-15 minutos (pero afecta UX)
5. **Workaround post-deploy**: Script separado que corra después del deployment inicial
6. **Reportar bug a Microsoft**: El comportamiento del CLI parece ser un bug

#### Verificación Manual Exitosa (dilux68-rg)

**Fecha:** 2026-01-31

| Componente | Funciones | Estado |
|------------|-----------|--------|
| API | 49 | ✅ Health OK |
| Scheduler | 2 | ✅ OK |
| Processor | 2 | ✅ OK |
| Frontend | - | ✅ Login Azure AD OK |
| CORS | - | ✅ Configurado automáticamente |

**Nota:** Este deployment funcionó porque se hizo manualmente con tiempo de espera adecuado.

### Archivos Clave para Continuar

| Archivo | Descripción |
|---------|-------------|
| `infra/modules/code-deployment.bicep` | Script que despliega código (líneas ~100-180 tienen la lógica FC1) |
| `infra/modules/functionapp.bicep` | Definición del Function App para FC1 |
| `infra/main.bicep` | Orquestador, pasa `isFlexConsumption` a los módulos |
| `scripts/deploy.sh` | Script interactivo de deployment |

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
