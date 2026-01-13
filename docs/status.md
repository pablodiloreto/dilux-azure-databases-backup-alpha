# Estado del Proyecto - 13 Enero 2026 (Actualizado 04:00 UTC)

## Resumen Ejecutivo

**Release actual**: v1.0.12 (pendiente tag)
**Estado**: ✅ **SCRIPT DE INSTALACIÓN CON PROGRESO EN TIEMPO REAL**
**Resource Groups eliminados**: dilux10-test-rg, dilux11-test-rg

### Resumen de Cambios Esta Sesión:
1. ✅ **Error 404 en login** → config.json faltaba `/api` en apiUrl
2. ✅ **Usuario no registrado** → eliminado usuario mock que bloqueaba "first run"
3. ✅ **Automatización** → deployment ahora limpia usuarios mock cuando AUTH_MODE=azure
4. ✅ **Script de instalación** → `scripts/deploy.sh` crea App Registration automáticamente
5. ✅ **README actualizado** → Script como opción principal de instalación
6. ✅ **Progreso en tiempo real** → El script ahora muestra el progreso del deployment dinámicamente

---

## ✅ NUEVO: Progreso en Tiempo Real (04:00 UTC - 13 Enero)

### Mejora Implementada
El script `deploy.sh` ahora muestra progreso del deployment en tiempo real:

```
───────────────────────────────────────────────────────────────
  Progreso del deployment (actualización cada 10 segundos)
───────────────────────────────────────────────────────────────

  ✅ dilux-backup-deploy-identity (userAssignedIdentities)
  ✅ dilux-backup-kv-abc123 (vaults)
  ✅ dilux-backup-stabc123xyz (storageAccounts)
  ⏳ Estado: Running | Completados: 3/12 | Tiempo: 2m 30s
```

### Características:
- Muestra recursos completados con checkmark ✅
- Actualiza cada 10 segundos
- Muestra contador de progreso (completados/total)
- Muestra tiempo transcurrido
- En caso de error, muestra detalles del fallo

---

## ✅ Script de Instalación Automático

### El Problema Resuelto
El Managed Identity del deployment no puede crear App Registrations porque requiere permisos de Microsoft Graph API que solo un Global Admin puede otorgar.

### La Solución
Creado `scripts/deploy.sh` que:
1. Usa las **credenciales del usuario** (no del Managed Identity)
2. Crea el App Registration automáticamente
3. Despliega toda la infraestructura
4. Configura los redirect URIs
5. El primer login será admin automáticamente

### Cómo usar
```bash
# En Azure Cloud Shell o terminal con az login
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash
```

### Flujo del script
```
═══════════════════════════════════════════════════════
   Dilux Database Backup - Instalador
═══════════════════════════════════════════════════════

[0/5] Verificando pre-requisitos
  ✅ Azure CLI instalado
  ✅ Sesión de Azure activa
  ✅ Permisos de Azure AD verificados

[1/5] Configuración del deployment
  Nombre de la aplicación [dilux-backup]: _
  Resource Group [dilux-backup-rg]: _
  Región [eastus]: _
  Email del administrador: _

[2/5] Creando App Registration
  ✅ App Registration creado: abc-123-def

[3/5] Creando Resource Group
  ✅ Resource Group creado

[4/5] Desplegando infraestructura
  ✅ Infraestructura desplegada

[5/5] Configurando redirect URIs
  ✅ Redirect URIs configurados

═══════════════════════════════════════════════════════
   ✅ INSTALACIÓN COMPLETADA
═══════════════════════════════════════════════════════
```

---

## ✅ FIX: Usuario no registrado (02:30 UTC - 13 Enero)

### Síntoma
Después de login exitoso con Azure AD:
```
Access denied for 'pablodiloreto@hotmail.com'. Your account is not registered in this application.
```

### Causa Raíz
La tabla `users` tenía un usuario mock del modo desarrollo:
```
RowKey: dev-user-00000000-0000-0000-0000-000000000000
email: admin@dilux.tech
role: admin
```

Esto impedía que el sistema detectara "first run" y creara al usuario real como admin automáticamente.

### Fix Aplicado
1. ✅ **Eliminado usuario mock** de la tabla `users`
2. ✅ Ahora el próximo login será tratado como "first run"
3. ✅ El usuario `pablodiloreto@hotmail.com` se convertirá en admin automáticamente

### ✅ Automatización Implementada
Se modificó `infra/modules/code-deployment.bicep` para que cuando `AUTH_MODE=azure`:
1. Elimine automáticamente el usuario mock de la tabla `users`
2. Esto asegura que el "first run" funcione correctamente
3. El primer usuario que haga login con Azure AD será admin automáticamente

**Código agregado** (líneas 288-301):
```bash
# Clean up mock users from Table Storage to allow real "first run"
az storage entity delete \
  --table-name users \
  --partition-key "users" \
  --row-key "dev-user-00000000-0000-0000-0000-000000000000" \
  2>/dev/null || true
```

---

## ✅ FIX CRÍTICO: Error 404 en Login (02:15 UTC - 13 Enero)

### Síntoma
Después de autenticarse con Azure AD, el frontend mostraba:
`Request failed with status code 404`

### Causa Raíz
El `config.json` tenía:
```json
"apiUrl": "https://dilux11-snrcky-api.azurewebsites.net"
```

**Pero debería tener:**
```json
"apiUrl": "https://dilux11-snrcky-api.azurewebsites.net/api"
```

El frontend hace llamadas como `/users/me`, resultando en:
- ❌ `https://...azurewebsites.net/users/me` → **404**
- ✅ `https://...azurewebsites.net/api/users/me` → **200**

### Fix Aplicado
1. ✅ **Corregido config.json** en Blob Storage con `/api` al final
2. ✅ **Corregido `infra/main.bicep`** línea 398:
   - Antes: `apiBaseUrl: 'https://${functionAppApiName}.azurewebsites.net'`
   - Después: `apiBaseUrl: 'https://${functionAppApiName}.azurewebsites.net/api'`
3. ✅ **Recompilado `infra/azuredeploy.json`** para futuros deployments

### URLs para probar
- **Frontend**: https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net/
- **API**: https://dilux11-snrcky-api.azurewebsites.net/api/health

---

## ✅ FIX ANTERIOR (23:20 UTC - 12 Enero)

### Acciones realizadas:
1. ✅ Creado App Registration manualmente
   - Nombre: `Dilux Database Backup - dilux11`
   - Client ID: `24d25abc-f444-4bce-bcb4-3cbf49a58973`

2. ✅ Configurados redirect URIs (SPA):
   - `https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net`
   - `https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net/auth/callback`

3. ✅ Actualizada Function App API:
   - `AUTH_MODE=azure`
   - `AZURE_AD_CLIENT_ID=24d25abc-f444-4bce-bcb4-3cbf49a58973`

4. ✅ Actualizado config.json en Blob Storage:
   - `authMode: "azure"`
   - `azureClientId: "24d25abc-f444-4bce-bcb4-3cbf49a58973"`

### URLs para probar:
- **Frontend**: https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net/
- **API**: https://dilux11-snrcky-api.azurewebsites.net

---

## 🐛 BUG EN CÓDIGO FRONTEND (23:50 UTC)

### Síntoma
Error: `AADSTS900144: The request body must contain the following parameter: 'client_id'`

### Causa
Bug de timing en `src/frontend/src/auth/msalConfig.ts` líneas 29-36:

```typescript
// PROBLEMA: Este objeto se crea al IMPORTAR el módulo
// En ese momento config.json NO se ha cargado todavía
export const msalConfig: Configuration = {
  auth: {
    clientId: getAuthConfig().azureClientId,  // ← VACÍO porque config no cargó
    ...
  },
}
```

### Flujo del bug:
1. JavaScript importa módulos → `msalConfig` se crea con `clientId: ""`
2. `initConfig()` carga config.json → pero `msalConfig` ya está creado
3. MSAL usa `msalConfig` → `clientId` sigue vacío
4. Azure AD rechaza: "falta client_id"

### Solución requerida:
Hacer que `msalConfig` se cree DESPUÉS de cargar config.json, no al importar.

### ✅ FIX APLICADO (00:01 UTC - 13 Enero):
1. Modificado `src/frontend/src/auth/msalConfig.ts`:
   - Cambiado `const msalConfig` a función `getMsalConfig()`
   - La función se llama DESPUÉS de que config.json carga

2. Modificado `src/frontend/src/auth/MsalAuthProvider.tsx`:
   - Importa `getMsalConfig` en lugar de `msalConfig`
   - Llama a `getMsalConfig()` al inicializar MSAL

3. Build y deploy del frontend al blob storage completado.

---

## 🚨 ERROR CRÍTICO IDENTIFICADO

### Síntoma
- Frontend muestra: "No response received from server"
- Frontend muestra: "Modo de desarrollo (Mock Auth)"
- No se puede iniciar sesión con Microsoft Azure AD

### Causa Raíz Confirmada
**El App Registration NO se está creando correctamente durante el deployment.**

El Managed Identity (`dilux11-deploy-identity`) no tiene permisos de Microsoft Graph API para crear App Registrations. Como resultado:
1. El script `appregistration.bicep` falla silenciosamente
2. `clientId` queda vacío (`""`)
3. `AUTH_MODE` se configura como `mock` (tanto en backend como en frontend)
4. El frontend entra en modo mock y no puede autenticar con Azure AD

---

## EVIDENCIA (dilux11-test-rg)

### 1. Configuración del Backend (Function App API)
```
az functionapp config appsettings list --name dilux11-snrcky-api ...

Name                Value
------------------  ------------------------------------
AUTH_MODE           mock                                  ← PROBLEMA
AZURE_AD_CLIENT_ID  (vacío)                               ← PROBLEMA
AZURE_AD_TENANT_ID  0247cf34-7abc-4ba3-bcc0-d105e9a29a5f  ← OK
```

### 2. Configuración del Frontend (config.json en Blob Storage)
```json
{
  "apiUrl": "https://dilux11-snrcky-api.azurewebsites.net",
  "azureClientId": "",           ← PROBLEMA: VACÍO
  "azureTenantId": "0247cf34-7abc-4ba3-bcc0-d105e9a29a5f",
  "azureRedirectUri": "https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net",
  "authMode": "mock"             ← PROBLEMA: MOCK
}
```

### 3. App Registration NO existe
```bash
az ad app list --filter "startswith(displayName, 'Dilux Database Backup')"
# Resultado: vacío - NO HAY APP REGISTRATION
```

### 4. URLs del Deployment
- **Frontend**: https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net/
- **API**: https://dilux11-snrcky-api.azurewebsites.net

---

## FLUJO DEL PROBLEMA

```
1. Deployment inicia
   ↓
2. appregistration.bicep se ejecuta
   ↓
3. Script intenta crear App Registration via Microsoft Graph API
   ↓
4. ❌ FALLA: Managed Identity no tiene permisos "Application.ReadWrite.All"
   ↓
5. Script termina con success=false, clientId=""
   ↓
6. main.bicep: var clientId = '' (vacío)
   ↓
7. Function Apps se crean con AUTH_MODE=mock
   ↓
8. code-deployment.bicep genera config.json con authMode="mock"
   ↓
9. Frontend carga config.json → authMode="mock" → modo mock activado
   ↓
10. Usuario ve "Modo de desarrollo (Mock Auth)" y no puede iniciar sesión
```

---

## ARCHIVOS CLAVE DEL PROBLEMA

### 1. `infra/main.bicep` (línea 176)
```bicep
var clientId = skipAppRegistration ? '' : (appRegistration.outputs.success ? appRegistration.outputs.clientId : '')
```
Si App Registration falla, `clientId = ''`

### 2. `infra/modules/appregistration.bicep` (líneas 146-173)
El script falla silenciosamente si no tiene permisos de Graph API:
```bash
# Output empty values so the deployment doesn't fail completely
echo "{\"clientId\": \"\", \"success\": false, \"message\": \"Manual setup required\"}" > $AZ_SCRIPTS_OUTPUT_PATH
exit 0  # ← NO FALLA, termina con éxito pero sin clientId
```

### 3. `infra/modules/code-deployment.bicep` (líneas 285-289)
```bash
if [ -n "$AZURE_AD_CLIENT_ID" ] && [ "$AZURE_AD_CLIENT_ID" != "" ]; then
  AUTH_MODE="azure"
else
  AUTH_MODE="mock"  # ← AQUÍ ENTRA PORQUE CLIENT_ID ESTÁ VACÍO
fi
```

### 4. `src/frontend/src/config/index.ts` (línea 88-91)
```typescript
export function isAzureAuthEnabled(): boolean {
  const config = getConfig()
  return config.authMode === 'azure' && !!config.azureClientId && !!config.azureTenantId
}
```
Si `authMode !== 'azure'` o `azureClientId` está vacío → modo mock

---

## SOLUCIONES POSIBLES

### Opción A: Crear App Registration manualmente (INMEDIATA)
1. Ir a Azure Portal → Microsoft Entra ID → App registrations
2. Click "New registration"
3. Nombre: `Dilux Database Backup - dilux11`
4. Supported account types: Single tenant
5. Redirect URI: Select "Single-page application (SPA)"
   - URL: `https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net`
6. Click "Register"
7. Agregar segundo redirect URI:
   - `https://dilux11stsnrckyt25ax2w.z15.web.core.windows.net/auth/callback`
8. Copiar el "Application (client) ID"
9. Actualizar:
   - Function App: `AZURE_AD_CLIENT_ID` y `AUTH_MODE=azure`
   - Blob Storage: config.json con `azureClientId` y `authMode: azure`

### Opción B: Dar permisos al Managed Identity (PERMANENTE)
El Managed Identity necesita el permiso `Application.ReadWrite.All` de Microsoft Graph.

Esto requiere:
1. Un Global Admin o Application Administrator
2. Otorgar el permiso via PowerShell o Graph API

### Opción C: Usar parámetro skipAppRegistration + clientId manual
1. Crear App Registration manualmente una vez
2. Pasar el clientId como parámetro del deployment
3. Modificar Bicep para aceptar clientId como input

---

## PRÓXIMOS PASOS

1. [x] ~~Decidir solución (A, B, o C)~~ → Opción A implementada
2. [x] ~~Implementar solución~~ → Fix manual aplicado
3. [ ] **Verificar que login funciona** ← PENDIENTE
4. [ ] Documentar proceso para futuros deployments

---

## LECCIÓN APRENDIDA - SOLUCIÓN PERMANENTE

### El problema de fondo
El Managed Identity del deployment NO puede crear App Registrations porque requiere permisos de Microsoft Graph API (`Application.ReadWrite.All`) que solo un Global Admin puede otorgar.

### Solución recomendada para futuros deployments
**Opción C mejorada**: Pasar `azureClientId` como parámetro del deployment.

1. **Pre-requisito**: Crear App Registration UNA VEZ manualmente (o reusar el existente)
2. **Modificar Bicep** para aceptar `azureClientId` como parámetro opcional
3. **Si se provee clientId** → usar ese, configurar AUTH_MODE=azure
4. **Si NO se provee** → usar mock (desarrollo local)

### App Registration reutilizable
```
Nombre: Dilux Database Backup - dilux11
Client ID: 24d25abc-f444-4bce-bcb4-3cbf49a58973
Tenant ID: 0247cf34-7abc-4ba3-bcc0-d105e9a29a5f
```

**IMPORTANTE**: Al hacer nuevo deployment, hay que:
1. Agregar el nuevo redirect URI del frontend al App Registration
2. Pasar el clientId existente al deployment

---

## COMANDOS ÚTILES

```bash
# Ver configuración actual de la API
az functionapp config appsettings list --name dilux11-snrcky-api --resource-group dilux11-test-rg -o table

# Ver config.json del frontend
ACCOUNT_KEY=$(az storage account keys list --account-name dilux11stsnrckyt25ax2w --resource-group dilux11-test-rg --query "[0].value" -o tsv)
az storage blob download --account-name dilux11stsnrckyt25ax2w --account-key "$ACCOUNT_KEY" --container-name '$web' --name config.json --file /tmp/config.json && cat /tmp/config.json

# Listar App Registrations
az ad app list --filter "startswith(displayName, 'Dilux')" --query "[].{displayName:displayName,appId:appId}" -o table

# Ver logs del deployment script
az deployment-scripts show-log --resource-group dilux11-test-rg --name dilux11-create-app-registration
```

---

*Última actualización: 12 Enero 2026, 21:15 UTC*
*Investigación de causa raíz completada*
