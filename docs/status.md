# Estado del Proyecto - 11 Enero 2026

## Resumen Ejecutivo

**Release actual**: v1.0.10
**Estado**: ⚠️ PARCIALMENTE FUNCIONAL - Ver problemas críticos abajo
**Resource Group de prueba**: dilux4-test-rg (activo)

---

## ⛔ PROBLEMAS CRÍTICOS PENDIENTES

### 1. LOGIN CON MICROSOFT NO FUNCIONA

**Síntoma visible**:
- El frontend muestra **"Modo de desarrollo (Mock Auth)"**
- Al hacer clic en "Iniciar sesión con Microsoft" **NO PASA NADA**
- El botón no hace nada, no redirige, no muestra error

**Causa raíz**:
- El App Registration **FALLA** durante el deployment
- `azureAdClientId` está **VACÍO** en config.json
- Por eso `authMode = "mock"` en lugar de `"azure"`
- En modo mock, el login real está deshabilitado

**Config.json actual** (MAL):
```json
{
  "apiUrl": "https://dilux4-slbkfy-api.azurewebsites.net",
  "azureClientId": "",        // <-- VACÍO! Este es el problema
  "azureTenantId": "0247cf34-7abc-4ba3-bcc0-d105e9a29a5f",
  "azureRedirectUri": "https://thankful-glacier-01ff6d50f.4.azurestaticapps.net",
  "authMode": "mock"          // <-- Por eso está en mock
}
```

**Lo que debería ser** (BIEN):
```json
{
  "apiUrl": "https://dilux4-slbkfy-api.azurewebsites.net",
  "azureClientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // <-- GUID del App Registration
  "azureTenantId": "0247cf34-7abc-4ba3-bcc0-d105e9a29a5f",
  "azureRedirectUri": "https://thankful-glacier-01ff6d50f.4.azurestaticapps.net",
  "authMode": "azure"         // <-- Cambiaría automáticamente si hay clientId
}
```

**Por qué falla el App Registration**:
- El script en `infra/modules/appregistration.bicep` usa `az ad app create`
- El Managed Identity NO tiene permisos de Microsoft Graph API
- Se necesita el permiso `Application.ReadWrite.All` en Graph API
- Este permiso requiere **consentimiento de admin del tenant**

**Opciones para arreglar**:

1. **OPCIÓN A - Crear App Registration MANUALMENTE** (más fácil):
   ```
   1. Ir a Azure Portal > Microsoft Entra ID > App registrations
   2. Click "New registration"
   3. Nombre: "Dilux Database Backup"
   4. Supported account types: "Single tenant"
   5. Redirect URI:
      - Platform: "Single-page application (SPA)"
      - URL: https://thankful-glacier-01ff6d50f.4.azurestaticapps.net
   6. Click "Register"
   7. Copiar el "Application (client) ID"
   8. Actualizar config.json en el frontend con ese ID
   9. Re-deployar el frontend
   ```

2. **OPCIÓN B - Dar permisos al Managed Identity** (más complejo):
   - Requiere ser Global Admin o Privileged Role Admin
   - Asignar rol "Cloud Application Administrator" al Managed Identity
   - O dar permiso de Graph API `Application.ReadWrite.All`

3. **OPCIÓN C - Usar un Service Principal pre-existente**:
   - Crear el App Registration una vez manualmente
   - Pasar el clientId como parámetro al deployment
   - Modificar el Bicep para aceptar clientId opcional

---

### 2. FRONTEND NO SE DESPLIEGA AUTOMÁTICAMENTE

**Síntoma visible**:
- Después del deployment de Azure, el frontend muestra la página default de Azure SWA
- Hay que deployar manualmente con SWA CLI

**Causa raíz**:
- El container de deployment (Azure CLI) no tiene Node.js
- No se puede instalar SWA CLI
- La API REST que probamos (`content-*.azurestaticapps.net/api/zipdeploy`) retorna 404

**Estado actual**:
- El script genera `config.json` correctamente ✅
- Pero NO puede subir los archivos al Static Web App ❌

**Workaround manual** (funciona pero es tedioso):
```bash
# Desde una máquina con Node.js
cd /tmp
curl -L -o frontend.zip https://github.com/.../releases/download/v1.0.10/frontend.zip
unzip frontend.zip -d dist

# Crear config.json con los valores correctos
cat > dist/config.json << 'EOF'
{
  "apiUrl": "https://dilux4-slbkfy-api.azurewebsites.net",
  "azureClientId": "",
  "azureTenantId": "0247cf34-7abc-4ba3-bcc0-d105e9a29a5f",
  "azureRedirectUri": "https://thankful-glacier-01ff6d50f.4.azurestaticapps.net",
  "authMode": "mock"
}
EOF

# Obtener token y deployar
TOKEN=$(az staticwebapp secrets list --name dilux4-slbkfy-web -g dilux4-test-rg --query "properties.apiKey" -o tsv)
npx @azure/static-web-apps-cli deploy ./dist --deployment-token "$TOKEN" --env production
```

**Opciones para automatizar** (por investigar):
1. GitHub Actions con `azure/static-web-apps-deploy@v1`
2. Usar Azure Container Instance con imagen que tenga Node.js
3. Investigar si hay otra API REST para SWA deployment

---

### 3. ERROR 404 EN LLAMADAS A LA API (POSIBLE)

**Nota**: Este error puede aparecer si:
- El frontend no tiene el `config.json` correcto
- La API URL está mal configurada
- Hay problemas de CORS

**Verificar**:
```bash
# La API funciona?
curl https://dilux4-slbkfy-api.azurewebsites.net/api/health
# Debería retornar: {"status": "healthy", ...}

# El config.json está correcto?
curl https://thankful-glacier-01ff6d50f.4.azurestaticapps.net/config.json
# Verificar que apiUrl apunte a la API correcta
```

---

## Problemas Resueltos

### 1. GLIBC Error en Function Apps (v1.0.8 - v1.0.9)

**Problema**: Las Function Apps retornaban 404 después del deployment. Al investigar, el error era:
```
GLIBC_2.33 not found (required by cryptography/hazmat/bindings/_rust.abi3.so)
```

**Causa raíz**: El paquete `cryptography` se compilaba en GitHub Actions (Ubuntu con GLIBC 2.33+) pero Azure Functions usa un runtime con GLIBC más antiguo.

**Solución implementada** (v1.0.9):
1. Modificar `.github/workflows/build-release.yml` para NO incluir `.python_packages/` en los ZIPs
2. Modificar `infra/modules/code-deployment.bicep` para usar `--build-remote true`
3. Azure instala las dependencias con la versión correcta de GLIBC

**Archivos modificados**:
- `.github/workflows/build-release.yml` - Excluir `.python_packages/`
- `infra/modules/code-deployment.bicep` - Función `deploy_with_remote_build()`

### 2. Shared Module Path (v1.0.8)

**Problema**: `ModuleNotFoundError: No module named 'shared'`

**Causa raíz**: El path del módulo shared era diferente en desarrollo vs producción:
- Dev: `src/functions/api/function_app.py` -> `src/shared` (3 niveles arriba)
- Prod: `function_app.py` + `shared/` en el mismo directorio

**Solución implementada**:
```python
dev_shared_path = Path(__file__).parent.parent.parent / "shared"
prod_shared_path = Path(__file__).parent / "shared"

if prod_shared_path.exists():
    shared_path = prod_shared_path
elif dev_shared_path.exists():
    shared_path = dev_shared_path
```

**Archivos modificados**:
- `src/functions/api/function_app.py`
- `src/functions/scheduler/function_app.py`
- `src/functions/processor/function_app.py`

### 3. Frontend Config at Runtime (v1.0.10)

**Problema**: El frontend usaba variables `VITE_*` que se embeben en BUILD time, no runtime. Esto significaba que:
- El frontend construido en GitHub Actions no tenía las URLs de Azure
- No podía conectarse a la API
- El login con Microsoft no funcionaba (clientId vacío)

**Solución implementada**: Sistema de configuración runtime

**Archivos nuevos**:
- `src/frontend/src/config/index.ts` - Módulo que carga `/config.json` al iniciar

**Archivos modificados**:
- `src/frontend/src/main.tsx` - Llama `initConfig()` antes de renderizar
- `src/frontend/src/api/client.ts` - Usa `getConfig().apiUrl`
- `src/frontend/src/auth/msalConfig.ts` - Usa `getConfig()` para Azure AD

**Cómo funciona**:
1. Frontend busca `/config.json` al cargar
2. Si existe (producción), usa esos valores
3. Si no existe (desarrollo), usa variables `VITE_*` o defaults

**Estructura de config.json**:
```json
{
  "apiUrl": "https://xxx-api.azurewebsites.net",
  "azureClientId": "guid-del-app-registration",
  "azureTenantId": "guid-del-tenant",
  "azureRedirectUri": "https://xxx.azurestaticapps.net",
  "authMode": "azure" | "mock"
}
```

---

## Estado Actual del Deployment

### URLs de dilux4-test-rg

| Componente | URL | Estado |
|------------|-----|--------|
| Frontend | https://thankful-glacier-01ff6d50f.4.azurestaticapps.net | ✅ Funcionando |
| API | https://dilux4-slbkfy-api.azurewebsites.net | ✅ Funcionando |
| Scheduler | https://dilux4-slbkfy-scheduler.azurewebsites.net | ✅ Desplegado |
| Processor | https://dilux4-slbkfy-processor.azurewebsites.net | ✅ Desplegado |

### Verificaciones realizadas

```bash
# API Health Check
curl https://dilux4-slbkfy-api.azurewebsites.net/api/health
# Respuesta: {"status": "healthy", "service": "dilux-backup-api", "version": "v1.0.10"}

# Config.json accesible
curl https://thankful-glacier-01ff6d50f.4.azurestaticapps.net/config.json
# Respuesta: {"apiUrl": "https://dilux4-slbkfy-api.azurewebsites.net", ...}
```

---

## Problema Pendiente: Frontend Deployment Automático

### Situación actual

El script de deployment (`code-deployment.bicep`) genera `config.json` correctamente, pero **falla al deployar el frontend automáticamente**.

### Lo que se intentó

1. **Instalar Node.js + SWA CLI en el container de deployment**:
   - Falló porque el container (CBL-Mariner) no tiene Node.js disponible
   - `tdnf install nodejs npm` no funciona correctamente

2. **API REST de Azure Static Web Apps**:
   ```bash
   curl -X POST \
     "https://content-eastus2.azurestaticapps.net/api/zipdeploy?sitename=$STATIC_WEB_APP_NAME" \
     -H "Authorization: Bearer $DEPLOYMENT_TOKEN" \
     -H "Content-Type: application/zip" \
     --data-binary @frontend_with_config.zip
   ```
   - Retorna HTTP 404
   - Esta API parece no existir o tener un formato diferente

### Workaround actual

El frontend debe deployarse manualmente después del deployment de Azure:

```bash
# 1. Descargar frontend
curl -L -o frontend.zip https://github.com/pablodiloreto/dilux-azure-databases-backup-alpha/releases/download/v1.0.10/frontend.zip
unzip frontend.zip -d frontend_dist

# 2. Crear config.json
cat > frontend_dist/config.json << EOF
{
  "apiUrl": "https://xxx-api.azurewebsites.net",
  "azureClientId": "",
  "azureTenantId": "xxx",
  "azureRedirectUri": "https://xxx.azurestaticapps.net",
  "authMode": "mock"
}
EOF

# 3. Obtener deployment token
az staticwebapp secrets list --name xxx-web --resource-group xxx-rg --query "properties.apiKey" -o tsv

# 4. Deployar
npx @azure/static-web-apps-cli deploy ./frontend_dist --deployment-token "TOKEN" --env production
```

### Opciones para automatizar (por investigar)

1. **GitHub Actions post-deployment**:
   - Crear un workflow que se ejecute después del deployment de Azure
   - Usar `azure/static-web-apps-deploy@v1` action
   - Requiere configurar el deployment token como secret

2. **Azure DevOps Pipeline**:
   - Similar a GitHub Actions pero con Azure DevOps

3. **Blob Storage + Azure Functions**:
   - Subir el frontend a Blob Storage
   - Tener una Azure Function que lo deploye al SWA cuando detecte cambios

4. **Usar az staticwebapp desde el deployment script con imagen custom**:
   - Crear una imagen Docker con Node.js y SWA CLI
   - Usarla en el deployment script en lugar de AzureCLI

5. **Investigar la API REST correcta de SWA**:
   - La documentación de Azure puede tener el endpoint correcto
   - Puede requerir autenticación diferente (Azure AD vs deployment token)

---

## Otros Problemas Conocidos

### App Registration falla silenciosamente

**Síntoma**: `azureAdClientId` está vacío en los outputs del deployment

**Causa probable**: El Managed Identity no tiene permisos de Graph API para crear App Registrations

**Impacto**: Login con Microsoft no funciona (authMode = "mock")

**Workaround**: Crear App Registration manualmente en Azure Portal:
1. Azure AD > App registrations > New registration
2. Nombre: "Dilux Backup"
3. Redirect URI: https://xxx.azurestaticapps.net
4. Copiar Client ID y actualizar config.json

---

## Historial de Releases

| Version | Fecha | Cambios |
|---------|-------|---------|
| v1.0.7 | 22 Dic 2025 | Intento inicial de deployment automático |
| v1.0.8 | 11 Ene 2026 | Fix: shared module path detection |
| v1.0.9 | 11 Ene 2026 | Fix: remote build para GLIBC |
| v1.0.10 | 11 Ene 2026 | Feat: runtime config system |

---

## Resource Groups usados en testing

| Nombre | Estado | Notas |
|--------|--------|-------|
| dilux-test-rg | Eliminado | Primera prueba |
| dilux2-test-rg | Eliminado | Prueba v1.0.8 |
| dilux3-test-rg | Eliminado | Prueba v1.0.9 |
| dilux4-test-rg | **ACTIVO** | Prueba v1.0.10 - NO ELIMINAR |

---

## Para continuar

### Próximos pasos sugeridos

1. **Investigar API REST de Static Web Apps**
   - Buscar documentación oficial de Azure sobre deployment programático
   - Probar diferentes endpoints y autenticación

2. **Probar GitHub Actions para frontend**
   - Crear workflow `.github/workflows/deploy-frontend.yml`
   - Se ejecutaría manualmente o cuando se crea una release

3. **Probar la aplicación completa**
   - Crear un backup de prueba
   - Verificar que la cola funciona
   - Verificar que el processor procesa los jobs

4. **Arreglar App Registration**
   - Investigar qué permisos necesita el Managed Identity
   - O documentar el proceso manual

### Comandos útiles para retomar

```bash
# Ver estado del resource group
az deployment group list --resource-group dilux4-test-rg --query "[].{name:name, state:properties.provisioningState}" -o table

# Ver logs del deployment script
az deployment-scripts show-log --resource-group dilux4-test-rg --name deploy-application-code

# Test de la API
curl https://dilux4-slbkfy-api.azurewebsites.net/api/health

# Ver outputs del deployment
az deployment group show --resource-group dilux4-test-rg --name main --query "properties.outputs" -o json

# Eliminar resource group (para nueva prueba)
az group delete --name dilux4-test-rg --yes --no-wait

# Crear nuevo resource group
az group create --name dilux5-test-rg --location eastus2

# Deploy nueva versión
az deployment group create \
  --resource-group dilux5-test-rg \
  --template-file infra/main.bicep \
  --parameters appName=dilux5 adminEmail=test@dilux.com appVersion=v1.0.10
```

---

## Archivos clave modificados en v1.0.10

```
src/frontend/src/config/index.ts          # NUEVO - runtime config loader
src/frontend/src/main.tsx                  # Modificado - init config
src/frontend/src/api/client.ts             # Modificado - usa getConfig()
src/frontend/src/auth/msalConfig.ts        # Modificado - usa getConfig()
infra/main.bicep                           # Modificado - pasa tenantId/clientId
infra/modules/code-deployment.bicep        # Modificado - genera config.json
infra/azuredeploy.json                     # Recompilado
```

---

*Última actualización: 11 Enero 2026, 23:50 UTC*

---

## RESUMEN RÁPIDO PARA CONTINUAR

**3 problemas críticos pendientes:**

1. ❌ **LOGIN NO FUNCIONA** → App Registration falla → clientId vacío → authMode="mock"
2. ❌ **FRONTEND NO SE DESPLIEGA SOLO** → No hay Node.js en container → API REST no existe
3. ⚠️ **Posibles 404 en API** → Verificar config.json y CORS

**Para arreglar el login rápidamente:**
```bash
# Crear App Registration manualmente en Azure Portal
# Luego actualizar config.json y re-deployar frontend
```

**Para continuar el desarrollo:**
```bash
# Leer este archivo completo
# El resource group dilux4-test-rg está activo
# La API funciona: curl https://dilux4-slbkfy-api.azurewebsites.net/api/health
```
