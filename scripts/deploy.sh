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
    print_step "0/5" "Verificando pre-requisitos"

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
    print_step "1/5" "Configuración del deployment"

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

    # Summary
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Resumen de configuración:${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Nombre:        ${BOLD}$APP_NAME${NC}"
    echo -e "  Resource Group: ${BOLD}$RESOURCE_GROUP${NC}"
    echo -e "  Región:        ${BOLD}$LOCATION${NC}"
    echo -e "  Admin Email:   ${BOLD}$ADMIN_EMAIL${NC}"
    echo -e "  Versión:       ${BOLD}$APP_VERSION${NC}"
    echo ""

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
    print_step "2/5" "Creando App Registration para Azure AD"

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
    print_step "3/5" "Creando Resource Group"

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
    print_step "4/5" "Desplegando infraestructura"

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

    # Run deployment (this takes 10-15 minutes)
    DEPLOY_OUTPUT=$(az deployment group create \
        --resource-group "$RESOURCE_GROUP" \
        --template-uri "$TEMPLATE_URL" \
        --parameters \
            appName="$APP_NAME" \
            adminEmail="$ADMIN_EMAIL" \
            appVersion="$APP_VERSION" \
            azureAdClientId="$CLIENT_ID" \
        --query "properties.outputs" \
        -o json 2>&1)

    DEPLOY_EXIT_CODE=$?

    if [ $DEPLOY_EXIT_CODE -ne 0 ]; then
        print_error "Error en el deployment"
        echo ""
        echo "Detalles del error:"
        echo "$DEPLOY_OUTPUT" | head -50
        echo ""
        echo "Para más detalles, revisa en Azure Portal:"
        echo "  https://portal.azure.com/#@/resource/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}/deployments"
        exit 1
    fi

    print_success "Infraestructura desplegada"

    # Extract outputs
    STORAGE_ACCOUNT=$(echo "$DEPLOY_OUTPUT" | jq -r '.storageAccountName.value // empty')
}

# ============================================================================
# Configure App Registration Redirect URIs
# ============================================================================

configure_redirect_uris() {
    print_step "5/5" "Configurando redirect URIs"

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

    echo ""
    echo -e "${BOLD}Primer login:${NC}"
    echo -e "  El usuario ${CYAN}${ADMIN_EMAIL}${NC} será administrador automáticamente"
    echo -e "  al hacer el primer login con Azure AD."

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
    print_summary
}

# Run main function
main "$@"
