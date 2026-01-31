#!/bin/bash
# ============================================================================
# Dilux Database Backup - Instalador Automático
# ============================================================================
# Este script:
# 1. Verifica permisos del usuario
# 2. Crea el App Registration para Azure AD auth
# 3. Despliega toda la infraestructura a Azure
# 4. Configura el primer usuario admin
#
# Uso:
#   curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash
#
# O descarga y ejecuta:
#   wget https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh
#   chmod +x deploy.sh
#   ./deploy.sh
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

# GitHub repo for deployment
GITHUB_REPO="pablodiloreto/dilux-azure-databases-backup-alpha"
DEFAULT_VERSION="latest"

# ============================================================================
# Helper Functions
# ============================================================================

print_banner() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}   Dilux Database Backup - Instalador Automático${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
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

prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"

    if [ -n "$default" ]; then
        echo -en "${BOLD}$prompt${NC} [${default}]: "
        read value < /dev/tty
        value="${value:-$default}"
    else
        echo -en "${BOLD}$prompt${NC}: "
        read value < /dev/tty
    fi

    eval "$var_name='$value'"
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
    print_step "0/6" "Verificando pre-requisitos"

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

    # Check if logged in
    if ! az account show &> /dev/null; then
        print_warning "No has iniciado sesión en Azure CLI"
        echo ""
        echo "Iniciando sesión..."
        az login
    fi
    print_success "Sesión de Azure activa"

    # Get current user info
    CURRENT_USER=$(az ad signed-in-user show --query "userPrincipalName" -o tsv 2>/dev/null || echo "")
    if [ -z "$CURRENT_USER" ]; then
        print_error "No se pudo obtener información del usuario actual"
        print_info "Asegúrate de tener permisos de Azure AD"
        exit 1
    fi
    print_success "Usuario actual: $CURRENT_USER"

    # Check if user has required Azure AD roles (Global Admin or Application Admin)
    echo "Verificando roles de Azure AD..."
    USER_ROLES=$(az rest --method GET --uri "https://graph.microsoft.com/v1.0/me/memberOf" \
        --query "value[].displayName" -o tsv 2>/dev/null || echo "")

    HAS_PERMISSION=false
    if echo "$USER_ROLES" | grep -qi "Global Administrator"; then
        print_success "Rol: Global Administrator"
        HAS_PERMISSION=true
    fi
    if echo "$USER_ROLES" | grep -qi "Application Administrator"; then
        print_success "Rol: Application Administrator"
        HAS_PERMISSION=true
    fi

    if [ "$HAS_PERMISSION" = false ]; then
        print_error "No tienes los roles necesarios para crear App Registrations"
        echo ""
        echo "Roles requeridos (al menos uno):"
        echo "  - Global Administrator"
        echo "  - Application Administrator"
        echo ""
        echo "Tus roles actuales:"
        echo "$USER_ROLES" | grep -i "administrator" || echo "  (ningún rol de administrador encontrado)"
        echo ""
        echo "Contacta a tu administrador de Azure AD para obtener permisos."
        exit 1
    fi

    # Get tenant and subscription info
    TENANT_ID=$(az account show --query "tenantId" -o tsv)
    SUBSCRIPTION_ID=$(az account show --query "id" -o tsv)
    SUBSCRIPTION_NAME=$(az account show --query "name" -o tsv)

    echo ""
    print_info "Tenant ID: $TENANT_ID"
    print_info "Subscription: $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"
}

# ============================================================================
# Configuration Prompts
# ============================================================================

get_configuration() {
    print_step "1/6" "Configuración del deployment"

    echo ""
    echo -e "${CYAN}Ingresa los parámetros de configuración:${NC}"
    echo ""

    # App name
    prompt_with_default "Nombre de la aplicación" "dilux-backup" APP_NAME

    # Validate app name (lowercase, alphanumeric, hyphens only)
    APP_NAME=$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')

    # Resource group
    prompt_with_default "Resource Group" "${APP_NAME}-rg" RESOURCE_GROUP

    # Location
    echo ""
    echo "Regiones disponibles: eastus, eastus2, westus, westus2, centralus,"
    echo "                      westeurope, northeurope, brazilsouth, etc."
    prompt_with_default "Región de Azure" "eastus" LOCATION

    # Admin email
    echo ""
    prompt_required "Email del administrador (será el primer admin)" ADMIN_EMAIL

    # Validate email format
    if [[ ! "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Email inválido: $ADMIN_EMAIL"
        exit 1
    fi

    # Version
    echo ""
    prompt_with_default "Versión a instalar" "latest" APP_VERSION

    # Function App Plan Selection
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Selecciona el plan de hosting para las Function Apps:${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}1) FC1 - Flex Consumption (RECOMENDADO)${NC}"
    echo "   ✅ Serverless (pago por ejecución)"
    echo "   ✅ VNet Integration (conexión a redes privadas)"
    echo "   ✅ Cold starts rápidos"
    echo "   💰 Costo: ~\$0-10/mes"
    echo ""
    echo -e "${YELLOW}2) Y1 - Consumption (Legacy)${NC}"
    echo "   ✅ Serverless (pago por ejecución)"
    echo "   ❌ SIN VNet Integration"
    echo "   ⚠️  EOL: Septiembre 2028"
    echo "   💰 Costo: ~\$0-5/mes"
    echo ""
    echo -e "${BLUE}3) EP1 - Premium${NC}"
    echo "   ✅ Instancias reservadas (sin cold starts)"
    echo "   ✅ VNet Integration"
    echo "   ✅ Mejor rendimiento"
    echo "   💰 Costo: ~\$150/mes"
    echo ""
    echo -e "${BLUE}4) EP2 - Premium (Alto rendimiento)${NC}"
    echo "   ✅ Todo lo de EP1 + más CPU/memoria"
    echo "   💰 Costo: ~\$300/mes"
    echo ""
    echo -e "${BLUE}5) EP3 - Premium (Máximo rendimiento)${NC}"
    echo "   ✅ Todo lo de EP2 + máximos recursos"
    echo "   💰 Costo: ~\$600/mes"
    echo ""
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${YELLOW}IMPORTANTE:${NC} Si necesitas conectarte a bases de datos en"
    echo "Azure Virtual Networks (Private Endpoints, VMs en VNet),"
    echo -e "debes usar ${GREEN}FC1${NC} o ${BLUE}EP1/EP2/EP3${NC}. El plan Y1 NO soporta VNet."
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -en "${BOLD}Selecciona una opción [1-5] (default: 1):${NC} "
    read PLAN_CHOICE < /dev/tty
    PLAN_CHOICE="${PLAN_CHOICE:-1}"

    case $PLAN_CHOICE in
        1) FUNCTION_SKU="FC1" ;;
        2) FUNCTION_SKU="Y1" ;;
        3) FUNCTION_SKU="EP1" ;;
        4) FUNCTION_SKU="EP2" ;;
        5) FUNCTION_SKU="EP3" ;;
        *)
            print_warning "Opción inválida, usando FC1 (recomendado)"
            FUNCTION_SKU="FC1"
            ;;
    esac

    print_success "Plan seleccionado: $FUNCTION_SKU"

    # Summary
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Resumen de configuración:${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Nombre:         ${BOLD}$APP_NAME${NC}"
    echo -e "  Resource Group: ${BOLD}$RESOURCE_GROUP${NC}"
    echo -e "  Región:         ${BOLD}$LOCATION${NC}"
    echo -e "  Admin Email:    ${BOLD}$ADMIN_EMAIL${NC}"
    echo -e "  Versión:        ${BOLD}$APP_VERSION${NC}"
    echo -e "  Plan Functions: ${BOLD}$FUNCTION_SKU${NC}"
    echo ""

    # Show VNet warning if Y1 selected
    if [ "$FUNCTION_SKU" == "Y1" ]; then
        print_warning "Has seleccionado Y1 (sin VNet). No podrás conectarte a DBs en redes privadas."
    fi

    echo -en "${BOLD}¿Continuar con estos valores? (S/n):${NC} "
    read CONFIRM < /dev/tty
    CONFIRM="${CONFIRM:-S}"

    if [[ ! "$CONFIRM" =~ ^[SsYy]$ ]]; then
        print_warning "Instalación cancelada"
        exit 0
    fi
}

# ============================================================================
# Create App Registration
# ============================================================================

create_app_registration() {
    print_step "2/6" "Creando App Registration para Azure AD"

    APP_DISPLAY_NAME="Dilux Database Backup - ${APP_NAME}"

    # Check if app already exists
    echo "Verificando si ya existe..."
    EXISTING_APP=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

    if [ -n "$EXISTING_APP" ] && [ "$EXISTING_APP" != "None" ]; then
        print_info "App Registration ya existe: $EXISTING_APP"
        CLIENT_ID="$EXISTING_APP"

        # Get object ID for updates
        OBJECT_ID=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].id" -o tsv)

        print_info "Actualizando configuración..."
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
        OBJECT_ID=$(echo "$CREATE_RESULT" | jq -r '.id')

        print_success "App Registration creado: $CLIENT_ID"
    fi

    # We'll update the redirect URIs after we know the storage account URL
    # For now, save the client ID
    echo ""
    print_success "Client ID: $CLIENT_ID"
}

# ============================================================================
# Create Resource Group
# ============================================================================

create_resource_group() {
    print_step "3/6" "Creando Resource Group"

    # Check if resource group exists
    if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
        print_warning "Resource Group '$RESOURCE_GROUP' ya existe"
        echo -en "${BOLD}¿Usar el existente? (S/n):${NC} "
        read USE_EXISTING < /dev/tty
        USE_EXISTING="${USE_EXISTING:-S}"

        if [[ ! "$USE_EXISTING" =~ ^[SsYy]$ ]]; then
            print_error "Instalación cancelada"
            exit 1
        fi
    else
        echo "Creando Resource Group '$RESOURCE_GROUP' en '$LOCATION'..."
        az group create \
            --name "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --output none

        print_success "Resource Group creado"
    fi
}

# ============================================================================
# Deploy Infrastructure
# ============================================================================

deploy_infrastructure() {
    print_step "4/6" "Desplegando infraestructura"

    echo ""
    echo "Esto puede tomar 10-15 minutos..."
    echo ""

    # Get the bicep template URL
    if [ "$APP_VERSION" == "latest" ]; then
        # Try to get latest release version, fallback to main branch
        LATEST_VERSION=$(curl -s "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | jq -r '.tag_name' 2>/dev/null || echo "")
        if [ -z "$LATEST_VERSION" ] || [ "$LATEST_VERSION" == "null" ]; then
            print_warning "No se pudo obtener la última versión, usando branch main"
            APP_VERSION="main"
        else
            APP_VERSION="$LATEST_VERSION"
        fi
        print_info "Usando versión: $APP_VERSION"
    fi

    TEMPLATE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${APP_VERSION}/infra/azuredeploy.json"

    # Verify template exists, fallback to main if not found
    if ! curl -s --head "$TEMPLATE_URL" | head -n 1 | grep -q "200"; then
        print_warning "Template no encontrado para $APP_VERSION, usando branch main"
        APP_VERSION="main"
        TEMPLATE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/main/infra/azuredeploy.json"
    fi

    print_info "Template URL: $TEMPLATE_URL"
    echo ""

    # Deploy with progress tracking
    echo "Iniciando deployment..."
    echo ""
    echo "  Puedes seguir el progreso en Azure Portal:"
    echo "  https://portal.azure.com/#@/resource/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/deployments"
    echo ""

    # Run deployment with real-time progress tracking
    echo "Ejecutando deployment..."
    echo ""
    echo "  Portal: https://portal.azure.com/#@/resource/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/deployments"
    echo ""

    # Start deployment in background (no-wait)
    DEPLOYMENT_NAME="main-$(date +%Y%m%d%H%M%S)"

    az deployment group create \
        --resource-group "$RESOURCE_GROUP" \
        --template-uri "$TEMPLATE_URL" \
        --name "$DEPLOYMENT_NAME" \
        --parameters \
            appName="$APP_NAME" \
            adminEmail="$ADMIN_EMAIL" \
            appVersion="$APP_VERSION" \
            azureAdClientId="$CLIENT_ID" \
            functionAppSku="$FUNCTION_SKU" \
        --no-wait \
        --output none 2>/dev/null

    # Poll deployment status with progress display
    echo "───────────────────────────────────────────────────────────────"
    echo "  Progreso del deployment (actualización cada 10 segundos)"
    echo "───────────────────────────────────────────────────────────────"
    echo ""

    START_TIME=$(date +%s)
    SHOWN_FILE=$(mktemp)

    # Clear line function
    clear_line() {
        printf "\r%-80s\r" ""
    }

    while true; do
        # Get deployment status
        DEPLOY_STATUS=$(az deployment group show \
            --resource-group "$RESOURCE_GROUP" \
            --name "$DEPLOYMENT_NAME" \
            --query "properties.provisioningState" \
            -o tsv 2>/dev/null || echo "Running")

        # Get operations status
        OPERATIONS=$(az deployment operation group list \
            --resource-group "$RESOURCE_GROUP" \
            --name "$DEPLOYMENT_NAME" \
            --query "[].{name:properties.targetResource.resourceName, type:properties.targetResource.resourceType, status:properties.provisioningState}" \
            -o json 2>/dev/null || echo "[]")

        # Calculate elapsed time
        CURRENT_TIME=$(date +%s)
        ELAPSED=$((CURRENT_TIME - START_TIME))
        ELAPSED_MIN=$((ELAPSED / 60))
        ELAPSED_SEC=$((ELAPSED % 60))

        # Show completed operations (only new ones)
        if [ "$OPERATIONS" != "[]" ]; then
            COMPLETED_LIST=$(echo "$OPERATIONS" | jq -r '.[] | select(.status == "Succeeded" and .name != null) | "\(.name)|\(.type)"' 2>/dev/null || echo "")

            if [ -n "$COMPLETED_LIST" ]; then
                echo "$COMPLETED_LIST" | while IFS='|' read -r name type; do
                    if [ -n "$name" ] && ! grep -q "^${name}$" "$SHOWN_FILE" 2>/dev/null; then
                        clear_line
                        short_type=$(echo "$type" | rev | cut -d'/' -f1 | rev)
                        echo "  ✅ ${name} (${short_type})"
                        echo "$name" >> "$SHOWN_FILE"
                    fi
                done
            fi
        fi

        # Check if deployment is complete
        if [ "$DEPLOY_STATUS" == "Succeeded" ]; then
            clear_line
            echo ""
            print_success "Deployment completado en ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
            rm -f "$SHOWN_FILE"
            break
        elif [ "$DEPLOY_STATUS" == "Failed" ]; then
            clear_line
            echo ""
            print_error "Deployment falló después de ${ELAPSED_MIN}m ${ELAPSED_SEC}s"
            echo ""
            # Show error details
            az deployment operation group list \
                --resource-group "$RESOURCE_GROUP" \
                --name "$DEPLOYMENT_NAME" \
                --query "[?properties.provisioningState=='Failed'].{resource:properties.targetResource.resourceName, error:properties.statusMessage.error.message}" \
                -o table 2>/dev/null
            rm -f "$SHOWN_FILE"
            exit 1
        fi

        # Show running indicator
        SUCCEEDED_COUNT=$(echo "$OPERATIONS" | jq '[.[] | select(.status == "Succeeded")] | length' 2>/dev/null || echo "0")
        TOTAL_COUNT=$(echo "$OPERATIONS" | jq 'length' 2>/dev/null || echo "0")

        printf "\r  ⏳ Estado: %-10s | Completados: %s/%s | Tiempo: %dm %02ds" "$DEPLOY_STATUS" "$SUCCEEDED_COUNT" "$TOTAL_COUNT" "$ELAPSED_MIN" "$ELAPSED_SEC"

        sleep 10
    done

    echo ""

    # Get storage account name from resource group
    STORAGE_ACCOUNT=$(az storage account list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv 2>/dev/null || echo "")
}

# ============================================================================
# Configure App Registration Redirect URIs
# ============================================================================

configure_redirect_uris() {
    print_step "5/6" "Configurando redirect URIs"

    # Get the storage account web endpoint
    if [ -z "$STORAGE_ACCOUNT" ]; then
        # Try to find it
        STORAGE_ACCOUNT=$(az storage account list \
            --resource-group "$RESOURCE_GROUP" \
            --query "[0].name" -o tsv 2>/dev/null || echo "")
    fi

    if [ -z "$STORAGE_ACCOUNT" ]; then
        print_warning "No se pudo obtener el Storage Account"
        print_info "Deberás configurar los redirect URIs manualmente"
        return
    fi

    # Get web endpoint
    FRONTEND_URL=$(az storage account show \
        --name "$STORAGE_ACCOUNT" \
        --resource-group "$RESOURCE_GROUP" \
        --query "primaryEndpoints.web" -o tsv 2>/dev/null | sed 's:/*$::')

    if [ -z "$FRONTEND_URL" ]; then
        print_warning "Static website no habilitado aún"
        print_info "Los redirect URIs se configurarán cuando el frontend se despliegue"
        return
    fi

    echo "Frontend URL: $FRONTEND_URL"

    # Update App Registration with SPA redirect URIs
    echo "Actualizando App Registration con redirect URIs..."

    # Get object ID
    OBJECT_ID=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].id" -o tsv 2>/dev/null)

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
            }" 2>/dev/null || print_warning "No se pudieron actualizar los redirect URIs automáticamente"

        print_success "Redirect URIs configurados"
    fi
}

# ============================================================================
# VNet Integration (Optional)
# ============================================================================

VNET_CONFIGURED="false"
SELECTED_VNET_NAME=""
SELECTED_SUBNET_NAME=""

configure_vnet_integration() {
    print_step "6/6" "VNet Integration (opcional)"

    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}¿Configurar VNet Integration?${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "VNet Integration permite que Dilux acceda a bases de datos"
    echo "en redes privadas de Azure (Private Endpoints, VMs en VNet)."
    echo ""
    echo -e "  ${GREEN}1)${NC} Sí, configurar ahora"
    echo -e "  ${YELLOW}2)${NC} No, lo haré después"
    echo ""
    echo -en "${BOLD}Selecciona [1-2] (default: 2):${NC} "
    read VNET_CHOICE < /dev/tty
    VNET_CHOICE="${VNET_CHOICE:-2}"

    if [ "$VNET_CHOICE" != "1" ]; then
        print_info "VNet Integration omitido. Puedes configurarlo después."
        return
    fi

    # Get Function App names
    API_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[?contains(name, '-api')].name" -o tsv | head -1)
    SCHEDULER_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[?contains(name, '-scheduler')].name" -o tsv | head -1)
    PROCESSOR_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[?contains(name, '-processor')].name" -o tsv | head -1)

    if [ -z "$API_APP" ] || [ -z "$SCHEDULER_APP" ] || [ -z "$PROCESSOR_APP" ]; then
        print_warning "No se encontraron las Function Apps. Configura VNet manualmente después."
        return
    fi

    # Select VNet
    select_vnet_for_deploy
    if [ -z "$SELECTED_VNET_ID" ]; then
        return
    fi

    # Select or create subnet
    select_subnet_for_deploy
    if [ -z "$SELECTED_SUBNET_ID" ]; then
        return
    fi

    # Apply VNet Integration
    apply_vnet_integration_for_deploy

    VNET_CONFIGURED="true"
}

select_vnet_for_deploy() {
    echo ""
    echo "Buscando VNets en la subscription..."

    VNETS=$(az network vnet list --query "[].{name:name, rg:resourceGroup, address:addressSpace.addressPrefixes[0]}" -o json 2>/dev/null)
    VNET_COUNT=$(echo "$VNETS" | jq 'length')

    if [ "$VNET_COUNT" == "0" ] || [ -z "$VNETS" ]; then
        print_warning "No se encontraron VNets en la subscription"
        print_info "Crea una VNet con tus bases de datos y ejecuta configure-vnet.sh después."
        SELECTED_VNET_ID=""
        return
    fi

    echo ""
    echo "VNets disponibles:"
    echo ""

    INDEX=1
    while IFS='|' read -r name rg address; do
        echo -e "  ${GREEN}$INDEX)${NC} $name ($address) - RG: $rg"
        INDEX=$((INDEX + 1))
    done < <(echo "$VNETS" | jq -r '.[] | "\(.name)|\(.rg)|\(.address)"')

    echo -e "  ${YELLOW}0)${NC} Cancelar (configurar después)"
    echo ""
    echo -en "${BOLD}Selecciona [0-$VNET_COUNT]:${NC} "
    read VNET_SELECTION < /dev/tty

    if [ "$VNET_SELECTION" == "0" ] || [ -z "$VNET_SELECTION" ]; then
        print_info "VNet Integration omitido."
        SELECTED_VNET_ID=""
        return
    fi

    VNET_INDEX=$((VNET_SELECTION - 1))
    SELECTED_VNET_NAME=$(echo "$VNETS" | jq -r ".[$VNET_INDEX].name")
    SELECTED_VNET_RG=$(echo "$VNETS" | jq -r ".[$VNET_INDEX].rg")

    if [ "$SELECTED_VNET_NAME" == "null" ] || [ -z "$SELECTED_VNET_NAME" ]; then
        print_error "Selección inválida"
        SELECTED_VNET_ID=""
        return
    fi

    SELECTED_VNET_ID=$(az network vnet show --name "$SELECTED_VNET_NAME" --resource-group "$SELECTED_VNET_RG" --query "id" -o tsv)
    print_success "VNet: $SELECTED_VNET_NAME"
}

select_subnet_for_deploy() {
    echo ""
    echo "Buscando subnets en $SELECTED_VNET_NAME..."

    SUBNETS=$(az network vnet subnet list \
        --vnet-name "$SELECTED_VNET_NAME" \
        --resource-group "$SELECTED_VNET_RG" \
        --query "[].{name:name, address:addressPrefix, delegation:delegations[0].serviceName}" \
        -o json 2>/dev/null)

    SUBNET_COUNT=$(echo "$SUBNETS" | jq 'length')

    echo ""

    if [ "$SUBNET_COUNT" != "0" ] && [ -n "$SUBNETS" ]; then
        echo "Subnets existentes:"
        echo ""

        INDEX=1
        while IFS='|' read -r name address delegation; do
            if [ "$delegation" == "Microsoft.Web/serverFarms" ]; then
                echo -e "  ${GREEN}$INDEX)${NC} $name ($address) - ${GREEN}✓ Compatible${NC}"
            elif [ "$delegation" == "null" ] || [ -z "$delegation" ]; then
                echo -e "  ${YELLOW}$INDEX)${NC} $name ($address) - Sin delegación"
            else
                echo -e "  ${RED}$INDEX)${NC} $name ($address) - Delegado a otro servicio"
            fi
            INDEX=$((INDEX + 1))
        done < <(echo "$SUBNETS" | jq -r '.[] | "\(.name)|\(.address)|\(.delegation)"')

        echo ""
    fi

    echo -e "  ${CYAN}N)${NC} ✨ Crear nuevo subnet"
    echo -e "  ${YELLOW}0)${NC} Cancelar"
    echo ""
    echo -en "${BOLD}Selecciona [0-$SUBNET_COUNT/N]:${NC} "
    read SUBNET_SELECTION < /dev/tty

    if [ "$SUBNET_SELECTION" == "0" ]; then
        print_info "VNet Integration omitido."
        SELECTED_SUBNET_ID=""
        return
    fi

    if [ "$SUBNET_SELECTION" == "N" ] || [ "$SUBNET_SELECTION" == "n" ]; then
        create_new_subnet_for_deploy
        return
    fi

    # Select existing subnet
    SUBNET_INDEX=$((SUBNET_SELECTION - 1))
    SELECTED_SUBNET_NAME=$(echo "$SUBNETS" | jq -r ".[$SUBNET_INDEX].name")
    SELECTED_SUBNET_DELEGATION=$(echo "$SUBNETS" | jq -r ".[$SUBNET_INDEX].delegation")

    if [ "$SELECTED_SUBNET_NAME" == "null" ] || [ -z "$SELECTED_SUBNET_NAME" ]; then
        print_error "Selección inválida"
        SELECTED_SUBNET_ID=""
        return
    fi

    # Check delegation
    if [ "$SELECTED_SUBNET_DELEGATION" != "null" ] && [ "$SELECTED_SUBNET_DELEGATION" != "Microsoft.Web/serverFarms" ] && [ -n "$SELECTED_SUBNET_DELEGATION" ]; then
        print_error "Subnet delegado a otro servicio. Selecciona otro o crea uno nuevo."
        SELECTED_SUBNET_ID=""
        return
    fi

    # Add delegation if needed
    if [ "$SELECTED_SUBNET_DELEGATION" == "null" ] || [ -z "$SELECTED_SUBNET_DELEGATION" ]; then
        echo "Agregando delegación..."
        az network vnet subnet update \
            --name "$SELECTED_SUBNET_NAME" \
            --vnet-name "$SELECTED_VNET_NAME" \
            --resource-group "$SELECTED_VNET_RG" \
            --delegations "Microsoft.Web/serverFarms" \
            --output none 2>/dev/null
    fi

    SELECTED_SUBNET_ID=$(az network vnet subnet show \
        --name "$SELECTED_SUBNET_NAME" \
        --vnet-name "$SELECTED_VNET_NAME" \
        --resource-group "$SELECTED_VNET_RG" \
        --query "id" -o tsv)

    print_success "Subnet: $SELECTED_SUBNET_NAME"
}

create_new_subnet_for_deploy() {
    echo ""
    echo "Calculando espacio disponible..."

    VNET_PREFIX=$(az network vnet show \
        --name "$SELECTED_VNET_NAME" \
        --resource-group "$SELECTED_VNET_RG" \
        --query "addressSpace.addressPrefixes[0]" -o tsv)

    EXISTING_SUBNETS=$(az network vnet subnet list \
        --vnet-name "$SELECTED_VNET_NAME" \
        --resource-group "$SELECTED_VNET_RG" \
        --query "[].addressPrefix" -o tsv | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n)

    if [ -n "$EXISTING_SUBNETS" ]; then
        LAST_SUBNET=$(echo "$EXISTING_SUBNETS" | tail -1)
        LAST_THIRD_OCTET=$(echo "$LAST_SUBNET" | cut -d'.' -f3)
        NEXT_THIRD_OCTET=$((LAST_THIRD_OCTET + 1))
        VNET_BASE=$(echo "$VNET_PREFIX" | cut -d'.' -f1-2)
        SUGGESTED_PREFIX="${VNET_BASE}.${NEXT_THIRD_OCTET}.0"
    else
        VNET_BASE=$(echo "$VNET_PREFIX" | cut -d'.' -f1-2)
        SUGGESTED_PREFIX="${VNET_BASE}.1.0"
    fi

    echo ""
    echo "Tamaño del subnet:"
    echo -e "  ${GREEN}1)${NC} /28 = 16 IPs"
    echo -e "  ${GREEN}2)${NC} /27 = 32 IPs ${GREEN}(recomendado)${NC}"
    echo -e "  ${YELLOW}3)${NC} /26 = 64 IPs"
    echo -e "  ${YELLOW}0)${NC} Cancelar"
    echo ""
    echo -en "${BOLD}Selecciona [0-3] (default: 2):${NC} "
    read SIZE_CHOICE < /dev/tty
    SIZE_CHOICE="${SIZE_CHOICE:-2}"

    case $SIZE_CHOICE in
        0)
            SELECTED_SUBNET_ID=""
            return
            ;;
        1) SUBNET_CIDR="/28" ;;
        2) SUBNET_CIDR="/27" ;;
        3) SUBNET_CIDR="/26" ;;
        *) SUBNET_CIDR="/27" ;;
    esac

    NEW_SUBNET_ADDRESS="${SUGGESTED_PREFIX}${SUBNET_CIDR}"

    echo ""
    echo -en "${BOLD}Nombre del subnet [dilux-functions]:${NC} "
    read NEW_SUBNET_NAME < /dev/tty
    NEW_SUBNET_NAME="${NEW_SUBNET_NAME:-dilux-functions}"

    echo "Creando subnet..."
    az network vnet subnet create \
        --name "$NEW_SUBNET_NAME" \
        --vnet-name "$SELECTED_VNET_NAME" \
        --resource-group "$SELECTED_VNET_RG" \
        --address-prefixes "$NEW_SUBNET_ADDRESS" \
        --delegations "Microsoft.Web/serverFarms" \
        --output none 2>/dev/null

    if [ $? -ne 0 ]; then
        print_error "Error al crear subnet. Configura VNet manualmente después."
        SELECTED_SUBNET_ID=""
        return
    fi

    SELECTED_SUBNET_NAME="$NEW_SUBNET_NAME"
    SELECTED_SUBNET_ID=$(az network vnet subnet show \
        --name "$SELECTED_SUBNET_NAME" \
        --vnet-name "$SELECTED_VNET_NAME" \
        --resource-group "$SELECTED_VNET_RG" \
        --query "id" -o tsv)

    print_success "Subnet creado: $SELECTED_SUBNET_NAME ($NEW_SUBNET_ADDRESS)"
}

apply_vnet_integration_for_deploy() {
    echo ""
    echo "Aplicando VNet Integration..."

    echo "  Integrando $API_APP..."
    az functionapp vnet-integration add \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --vnet "$SELECTED_VNET_ID" \
        --subnet "$SELECTED_SUBNET_NAME" \
        --output none 2>/dev/null && print_success "$API_APP" || print_warning "$API_APP (revisar)"

    echo "  Integrando $SCHEDULER_APP..."
    az functionapp vnet-integration add \
        --name "$SCHEDULER_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --vnet "$SELECTED_VNET_ID" \
        --subnet "$SELECTED_SUBNET_NAME" \
        --output none 2>/dev/null && print_success "$SCHEDULER_APP" || print_warning "$SCHEDULER_APP (revisar)"

    echo "  Integrando $PROCESSOR_APP..."
    az functionapp vnet-integration add \
        --name "$PROCESSOR_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --vnet "$SELECTED_VNET_ID" \
        --subnet "$SELECTED_SUBNET_NAME" \
        --output none 2>/dev/null && print_success "$PROCESSOR_APP" || print_warning "$PROCESSOR_APP (revisar)"

    print_success "VNet Integration aplicado"
}

# ============================================================================
# Print Final Summary
# ============================================================================

print_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}   ✅ INSTALACIÓN COMPLETADA${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    # Get URLs
    if [ -n "$FRONTEND_URL" ]; then
        echo -e "${BOLD}Tu aplicación está lista en:${NC}"
        echo -e "  🌐 ${CYAN}${FRONTEND_URL}${NC}"
    else
        echo -e "${BOLD}Frontend URL:${NC}"
        echo -e "  ${YELLOW}Revisa el deployment en Azure Portal${NC}"
    fi

    echo ""
    echo -e "${BOLD}Configuración:${NC}"
    echo -e "  📦 Resource Group: ${CYAN}${RESOURCE_GROUP}${NC}"
    echo -e "  🔑 Client ID:      ${CYAN}${CLIENT_ID}${NC}"
    echo -e "  👤 Admin:          ${CYAN}${ADMIN_EMAIL}${NC}"
    echo -e "  ⚙️  Plan Functions: ${CYAN}${FUNCTION_SKU}${NC}"

    echo ""
    echo -e "${BOLD}Primer login:${NC}"
    echo -e "  El usuario ${CYAN}${ADMIN_EMAIL}${NC} será administrador automáticamente"
    echo -e "  al hacer el primer login con Azure AD."

    # Show VNet status
    if [ "$VNET_CONFIGURED" == "true" ]; then
        echo ""
        echo -e "${BOLD}VNet Integration:${NC}"
        echo -e "  ✅ Configurado - VNet: ${CYAN}${SELECTED_VNET_NAME}${NC}, Subnet: ${CYAN}${SELECTED_SUBNET_NAME}${NC}"
    else
        echo ""
        echo -e "${YELLOW}───────────────────────────────────────────────────────────────${NC}"
        echo -e "${BOLD}📡 ¿Bases de datos en redes privadas?${NC}"
        echo ""
        echo "Para configurar VNet Integration después, ejecuta:"
        echo ""
        echo -e "  ${CYAN}curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-vnet.sh | bash${NC}"
        echo -e "${YELLOW}───────────────────────────────────────────────────────────────${NC}"
    fi

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
    get_configuration
    create_app_registration
    create_resource_group
    deploy_infrastructure
    configure_redirect_uris
    configure_vnet_integration
    print_summary
}

# Run main function
main "$@"
