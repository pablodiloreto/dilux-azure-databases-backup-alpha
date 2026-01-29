#!/bin/bash
# ============================================================================
# Dilux Database Backup - Configurador de Autenticación
# ============================================================================
# Este script configura Azure AD authentication después del deployment.
# Úsalo cuando el App Registration no se pudo crear automáticamente.
#
# Uso:
#   curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-auth.sh | bash
#
# O descarga y ejecuta:
#   wget https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-auth.sh
#   chmod +x configure-auth.sh
#   ./configure-auth.sh
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ============================================================================
# Helper Functions
# ============================================================================

print_banner() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}   Dilux Database Backup - Configurador de Autenticación${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Este asistente te guiará para configurar Azure AD authentication"
    echo -e "en una instalación existente de Dilux Database Backup."
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}${BOLD}[$1] $2${NC}"
    echo -e "${BLUE}───────────────────────────────────────────────────────────────${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

prompt_required() {
    local prompt="$1"
    local var_name="$2"
    local value=""

    while [ -z "$value" ]; do
        echo -en "${BOLD}$prompt${NC}: "
        read value < /dev/tty
        if [ -z "$value" ]; then
            print_error "Este campo es requerido"
        fi
    done

    eval "$var_name='$value'"
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

check_prerequisites() {
    print_step "1/5" "Verificando pre-requisitos"

    # Check if az cli is installed
    if ! command -v az &> /dev/null; then
        print_error "Azure CLI no está instalado"
        echo ""
        echo "Instala Azure CLI desde: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
        echo ""
        echo "O ejecuta este script en Azure Cloud Shell: https://shell.azure.com"
        exit 1
    fi
    print_success "Azure CLI instalado"

    # Check if jq is installed
    if ! command -v jq &> /dev/null; then
        print_warning "jq no está instalado, algunas funciones pueden estar limitadas"
    fi

    # Check if logged in
    if ! az account show &> /dev/null; then
        print_warning "No has iniciado sesión en Azure CLI"
        echo ""
        echo "Iniciando sesión..."
        az login
    fi
    print_success "Sesión de Azure activa"

    # Get current user info
    CURRENT_USER=$(az account show --query "user.name" -o tsv 2>/dev/null || echo "")
    if [ -n "$CURRENT_USER" ]; then
        print_success "Usuario actual: $CURRENT_USER"
    fi

    # Get subscription info
    SUBSCRIPTION_ID=$(az account show --query "id" -o tsv)
    SUBSCRIPTION_NAME=$(az account show --query "name" -o tsv)
    TENANT_ID=$(az account show --query "tenantId" -o tsv)

    echo ""
    print_info "Subscription: $SUBSCRIPTION_NAME"
    print_info "Tenant ID: $TENANT_ID"
}

# ============================================================================
# Find Dilux Installations
# ============================================================================

find_installations() {
    print_step "2/5" "Buscando instalaciones de Dilux"

    echo "Buscando Resource Groups con instalaciones de Dilux..."
    echo ""

    # Find resource groups with Dilux function apps
    DILUX_RGS=$(az functionapp list \
        --query "[?contains(name, '-api') && tags.Application=='Dilux Database Backup'].resourceGroup" \
        -o tsv 2>/dev/null | sort -u || echo "")

    if [ -z "$DILUX_RGS" ]; then
        # Fallback: search by function app naming pattern
        DILUX_RGS=$(az functionapp list \
            --query "[?contains(name, '-api')].resourceGroup" \
            -o tsv 2>/dev/null | sort -u || echo "")
    fi

    if [ -z "$DILUX_RGS" ]; then
        print_error "No se encontraron instalaciones de Dilux en esta subscription"
        echo ""
        echo "Asegúrate de:"
        echo "  1. Estar en la subscription correcta"
        echo "  2. Haber completado el deployment de Dilux"
        echo ""
        echo "Para cambiar de subscription:"
        echo "  az account set --subscription <subscription-id>"
        exit 1
    fi

    # Convert to array
    RG_ARRAY=()
    while IFS= read -r rg; do
        [ -n "$rg" ] && RG_ARRAY+=("$rg")
    done <<< "$DILUX_RGS"

    RG_COUNT=${#RG_ARRAY[@]}

    if [ "$RG_COUNT" -eq 1 ]; then
        RESOURCE_GROUP="${RG_ARRAY[0]}"
        print_success "Instalación encontrada: $RESOURCE_GROUP"
    else
        echo -e "${CYAN}Se encontraron $RG_COUNT instalaciones:${NC}"
        echo ""

        for i in "${!RG_ARRAY[@]}"; do
            echo -e "  ${BOLD}$((i+1)))${NC} ${RG_ARRAY[$i]}"
        done

        echo ""
        echo -en "${BOLD}Selecciona una opción [1-$RG_COUNT]:${NC} "
        read CHOICE < /dev/tty

        # Validate choice
        if [[ "$CHOICE" =~ ^[0-9]+$ ]] && [ "$CHOICE" -ge 1 ] && [ "$CHOICE" -le "$RG_COUNT" ]; then
            RESOURCE_GROUP="${RG_ARRAY[$((CHOICE-1))]}"
            print_success "Seleccionado: $RESOURCE_GROUP"
        else
            print_error "Opción inválida"
            exit 1
        fi
    fi

    # Get resources in the resource group
    echo ""
    echo "Obteniendo información del deployment..."

    # Get Function Apps
    FUNCTION_APPS=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[].name" -o tsv 2>/dev/null || echo "")

    API_APP=$(echo "$FUNCTION_APPS" | grep -E "\-api$" | head -1)
    SCHEDULER_APP=$(echo "$FUNCTION_APPS" | grep -E "\-scheduler$" | head -1)
    PROCESSOR_APP=$(echo "$FUNCTION_APPS" | grep -E "\-processor$" | head -1)

    if [ -z "$API_APP" ]; then
        print_error "No se encontró la Function App API en $RESOURCE_GROUP"
        exit 1
    fi

    print_success "API Function App: $API_APP"
    [ -n "$SCHEDULER_APP" ] && print_success "Scheduler Function App: $SCHEDULER_APP"
    [ -n "$PROCESSOR_APP" ] && print_success "Processor Function App: $PROCESSOR_APP"

    # Get Storage Account
    STORAGE_ACCOUNT=$(az storage account list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || echo "")

    if [ -n "$STORAGE_ACCOUNT" ]; then
        print_success "Storage Account: $STORAGE_ACCOUNT"

        # Get frontend URL
        FRONTEND_URL=$(az storage account show \
            --name "$STORAGE_ACCOUNT" \
            --resource-group "$RESOURCE_GROUP" \
            --query "primaryEndpoints.web" -o tsv 2>/dev/null | sed 's:/*$::' || echo "")

        if [ -n "$FRONTEND_URL" ]; then
            print_success "Frontend URL: $FRONTEND_URL"
        fi
    fi

    # Check current auth mode
    echo ""
    echo "Verificando configuración actual..."

    CURRENT_AUTH_MODE=$(az functionapp config appsettings list \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --query "[?name=='AUTH_MODE'].value" -o tsv 2>/dev/null || echo "")

    CURRENT_CLIENT_ID=$(az functionapp config appsettings list \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --query "[?name=='AZURE_AD_CLIENT_ID'].value" -o tsv 2>/dev/null || echo "")

    if [ "$CURRENT_AUTH_MODE" == "azure" ] && [ -n "$CURRENT_CLIENT_ID" ]; then
        print_warning "La autenticación ya está configurada"
        echo ""
        echo -e "  AUTH_MODE:          ${CYAN}$CURRENT_AUTH_MODE${NC}"
        echo -e "  AZURE_AD_CLIENT_ID: ${CYAN}$CURRENT_CLIENT_ID${NC}"
        echo ""
        echo -en "${BOLD}¿Deseas reconfigurar de todas formas? (s/N):${NC} "
        read RECONFIGURE < /dev/tty
        RECONFIGURE="${RECONFIGURE:-N}"

        if [[ ! "$RECONFIGURE" =~ ^[SsYy]$ ]]; then
            print_info "Operación cancelada"
            exit 0
        fi
    else
        print_warning "Autenticación NO configurada (AUTH_MODE: ${CURRENT_AUTH_MODE:-mock})"
    fi
}

# ============================================================================
# Get or Create App Registration
# ============================================================================

get_client_id() {
    print_step "3/5" "Configuración de Azure AD"

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}¿Cómo deseas obtener el Client ID de Azure AD?${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}1) Crear nuevo App Registration (recomendado)${NC}"
    echo "   El script creará el App Registration automáticamente"
    echo ""
    echo -e "${BLUE}2) Usar App Registration existente${NC}"
    echo "   Ingresa el Client ID de un App Registration que ya creaste"
    echo ""
    echo -en "${BOLD}Selecciona una opción [1-2] (default: 1):${NC} "
    read AUTH_CHOICE < /dev/tty
    AUTH_CHOICE="${AUTH_CHOICE:-1}"

    case $AUTH_CHOICE in
        1)
            create_app_registration
            ;;
        2)
            echo ""
            echo -e "${CYAN}Para obtener el Client ID:${NC}"
            echo "  1. Ve a Azure Portal → Microsoft Entra ID → App registrations"
            echo "  2. Selecciona tu App Registration"
            echo "  3. Copia el 'Application (client) ID'"
            echo ""
            prompt_required "Ingresa el Client ID (GUID)" CLIENT_ID

            # Validate GUID format
            if [[ ! "$CLIENT_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
                print_error "Formato de Client ID inválido"
                echo "El Client ID debe ser un GUID (ej: 12345678-1234-1234-1234-123456789012)"
                exit 1
            fi

            print_success "Client ID: $CLIENT_ID"

            # Update redirect URIs if we have the frontend URL
            if [ -n "$FRONTEND_URL" ]; then
                update_redirect_uris
            fi
            ;;
        *)
            print_error "Opción inválida"
            exit 1
            ;;
    esac
}

create_app_registration() {
    echo ""
    echo "Verificando permisos de Azure AD..."

    # Check if user can create app registrations
    CAN_CREATE=$(az rest --method GET \
        --uri "https://graph.microsoft.com/v1.0/me" \
        --query "id" -o tsv 2>/dev/null || echo "")

    if [ -z "$CAN_CREATE" ]; then
        print_error "No tienes permisos para crear App Registrations"
        echo ""
        echo "Necesitas uno de estos roles:"
        echo "  - Global Administrator"
        echo "  - Application Administrator"
        echo ""
        echo "Alternativa: Usa la opción 2 para ingresar un Client ID existente"
        exit 1
    fi

    # Extract app name from function app name (e.g., dilux-abc123-api -> dilux)
    APP_NAME=$(echo "$API_APP" | sed 's/-[a-z0-9]*-api$//')
    APP_DISPLAY_NAME="Dilux Database Backup - ${APP_NAME}"

    # Check if app already exists
    echo "Verificando si ya existe..."
    EXISTING_APP=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

    if [ -n "$EXISTING_APP" ] && [ "$EXISTING_APP" != "None" ]; then
        print_info "App Registration ya existe: $EXISTING_APP"
        CLIENT_ID="$EXISTING_APP"
    else
        echo "Creando nuevo App Registration..."

        # Create the app registration
        CREATE_RESULT=$(az ad app create \
            --display-name "$APP_DISPLAY_NAME" \
            --sign-in-audience "AzureADMyOrg" \
            --query "{appId:appId, id:id}" \
            -o json 2>&1)

        if [ $? -ne 0 ]; then
            print_error "Error al crear App Registration"
            echo "$CREATE_RESULT"
            exit 1
        fi

        CLIENT_ID=$(echo "$CREATE_RESULT" | jq -r '.appId')
        print_success "App Registration creado: $CLIENT_ID"
    fi

    # Configure redirect URIs
    if [ -n "$FRONTEND_URL" ]; then
        update_redirect_uris
    fi
}

update_redirect_uris() {
    echo ""
    echo "Configurando redirect URIs..."

    # Get object ID
    APP_DISPLAY_NAME="Dilux Database Backup - $(echo "$API_APP" | sed 's/-[a-z0-9]*-api$//')"
    OBJECT_ID=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].id" -o tsv 2>/dev/null || echo "")

    if [ -z "$OBJECT_ID" ]; then
        # Try to get by client ID
        OBJECT_ID=$(az ad app show --id "$CLIENT_ID" --query "id" -o tsv 2>/dev/null || echo "")
    fi

    if [ -n "$OBJECT_ID" ]; then
        # Update using Graph API for SPA redirect URIs
        az rest --method PATCH \
            --uri "https://graph.microsoft.com/v1.0/applications/${OBJECT_ID}" \
            --headers "Content-Type=application/json" \
            --body "{
                \"spa\": {
                    \"redirectUris\": [
                        \"${FRONTEND_URL}\",
                        \"${FRONTEND_URL}/auth/callback\"
                    ]
                }
            }" 2>/dev/null && print_success "Redirect URIs configurados" || print_warning "No se pudieron actualizar los redirect URIs automáticamente"
    else
        print_warning "No se pudo encontrar el App Registration para actualizar redirect URIs"
        echo ""
        echo "Configura manualmente los redirect URIs en Azure Portal:"
        echo "  1. Ve a Microsoft Entra ID → App registrations"
        echo "  2. Selecciona tu app"
        echo "  3. Ve a Authentication → Add a platform → Single-page application"
        echo "  4. Agrega estos URIs:"
        echo "     - ${FRONTEND_URL}"
        echo "     - ${FRONTEND_URL}/auth/callback"
    fi
}

# ============================================================================
# Update Configuration
# ============================================================================

update_configuration() {
    print_step "4/5" "Actualizando configuración"

    echo ""
    echo "Actualizando Function Apps..."

    # Update API Function App
    echo -n "  Actualizando $API_APP... "
    az functionapp config appsettings set \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --settings \
            AZURE_AD_CLIENT_ID="$CLIENT_ID" \
            AUTH_MODE="azure" \
        --output none 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}ERROR${NC}"

    # Update Scheduler Function App
    if [ -n "$SCHEDULER_APP" ]; then
        echo -n "  Actualizando $SCHEDULER_APP... "
        az functionapp config appsettings set \
            --name "$SCHEDULER_APP" \
            --resource-group "$RESOURCE_GROUP" \
            --settings \
                AZURE_AD_CLIENT_ID="$CLIENT_ID" \
                AUTH_MODE="azure" \
            --output none 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}ERROR${NC}"
    fi

    # Update Processor Function App
    if [ -n "$PROCESSOR_APP" ]; then
        echo -n "  Actualizando $PROCESSOR_APP... "
        az functionapp config appsettings set \
            --name "$PROCESSOR_APP" \
            --resource-group "$RESOURCE_GROUP" \
            --settings \
                AZURE_AD_CLIENT_ID="$CLIENT_ID" \
                AUTH_MODE="azure" \
            --output none 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${RED}ERROR${NC}"
    fi

    # Update Frontend config.json
    if [ -n "$STORAGE_ACCOUNT" ]; then
        echo ""
        echo "Actualizando frontend config.json..."

        # Get storage key
        STORAGE_KEY=$(az storage account keys list \
            --account-name "$STORAGE_ACCOUNT" \
            --resource-group "$RESOURCE_GROUP" \
            --query "[0].value" -o tsv 2>/dev/null || echo "")

        if [ -n "$STORAGE_KEY" ]; then
            # Download current config.json
            TEMP_CONFIG=$(mktemp)

            az storage blob download \
                --account-name "$STORAGE_ACCOUNT" \
                --account-key "$STORAGE_KEY" \
                --container-name '$web' \
                --name "config.json" \
                --file "$TEMP_CONFIG" \
                --output none 2>/dev/null || echo "{}" > "$TEMP_CONFIG"

            # Update config.json with new values
            if command -v jq &> /dev/null; then
                # Use jq if available
                UPDATED_CONFIG=$(jq \
                    --arg clientId "$CLIENT_ID" \
                    --arg tenantId "$TENANT_ID" \
                    '. + {azureClientId: $clientId, azureTenantId: $tenantId, authMode: "azure"}' \
                    "$TEMP_CONFIG" 2>/dev/null || echo "{\"azureClientId\":\"$CLIENT_ID\",\"azureTenantId\":\"$TENANT_ID\",\"authMode\":\"azure\"}")
                echo "$UPDATED_CONFIG" > "$TEMP_CONFIG"
            else
                # Fallback: create new config
                cat > "$TEMP_CONFIG" << EOF
{
    "azureClientId": "$CLIENT_ID",
    "azureTenantId": "$TENANT_ID",
    "authMode": "azure",
    "apiUrl": "/api"
}
EOF
            fi

            # Upload updated config.json
            az storage blob upload \
                --account-name "$STORAGE_ACCOUNT" \
                --account-key "$STORAGE_KEY" \
                --container-name '$web' \
                --name "config.json" \
                --file "$TEMP_CONFIG" \
                --overwrite \
                --content-type "application/json" \
                --output none 2>/dev/null && print_success "Frontend config.json actualizado" || print_warning "No se pudo actualizar config.json"

            rm -f "$TEMP_CONFIG"
        else
            print_warning "No se pudo obtener la key del Storage Account"
        fi
    fi
}

# ============================================================================
# Verify Configuration
# ============================================================================

verify_configuration() {
    print_step "5/5" "Verificando configuración"

    echo ""
    echo "Verificando que los cambios se aplicaron correctamente..."
    echo ""

    # Check API Function App
    NEW_AUTH_MODE=$(az functionapp config appsettings list \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --query "[?name=='AUTH_MODE'].value" -o tsv 2>/dev/null || echo "")

    NEW_CLIENT_ID=$(az functionapp config appsettings list \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --query "[?name=='AZURE_AD_CLIENT_ID'].value" -o tsv 2>/dev/null || echo "")

    if [ "$NEW_AUTH_MODE" == "azure" ] && [ "$NEW_CLIENT_ID" == "$CLIENT_ID" ]; then
        print_success "Function Apps configuradas correctamente"
    else
        print_warning "La configuración podría no haberse aplicado correctamente"
        echo "  AUTH_MODE actual: $NEW_AUTH_MODE (esperado: azure)"
        echo "  CLIENT_ID actual: $NEW_CLIENT_ID (esperado: $CLIENT_ID)"
    fi

    # Test API health endpoint
    echo ""
    echo "Probando API health endpoint..."

    API_URL="https://${API_APP}.azurewebsites.net/api/health"
    HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" 2>/dev/null || echo "000")

    if [ "$HEALTH_RESPONSE" == "200" ]; then
        print_success "API respondiendo correctamente"
    else
        print_warning "API no responde (código: $HEALTH_RESPONSE)"
        echo "  Puede tomar unos minutos para que los cambios se apliquen"
    fi
}

# ============================================================================
# Print Summary
# ============================================================================

print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}   ✅ CONFIGURACIÓN COMPLETADA${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    echo -e "${BOLD}Configuración aplicada:${NC}"
    echo -e "  📦 Resource Group:     ${CYAN}${RESOURCE_GROUP}${NC}"
    echo -e "  🔑 Client ID:          ${CYAN}${CLIENT_ID}${NC}"
    echo -e "  🔐 Auth Mode:          ${CYAN}azure${NC}"

    if [ -n "$FRONTEND_URL" ]; then
        echo ""
        echo -e "${BOLD}Tu aplicación está lista en:${NC}"
        echo -e "  🌐 ${CYAN}${FRONTEND_URL}${NC}"
    fi

    echo ""
    echo -e "${BOLD}Próximos pasos:${NC}"
    echo -e "  1. Abre la URL del frontend en tu navegador"
    echo -e "  2. Haz clic en 'Iniciar sesión'"
    echo -e "  3. El primer usuario que inicie sesión será administrador"

    echo ""
    echo -e "${YELLOW}Nota:${NC} Los cambios pueden tomar 1-2 minutos en propagarse."
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_banner
    check_prerequisites
    find_installations
    get_client_id
    update_configuration
    verify_configuration
    print_summary
}

# Run main function
main "$@"
