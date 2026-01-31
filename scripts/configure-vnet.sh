#!/bin/bash
# ============================================================================
# Dilux Database Backup - Configurador de VNet Integration
# ============================================================================
# Este script configura VNet Integration para que las Function Apps
# puedan acceder a bases de datos en redes privadas (Private Endpoints).
#
# Uso:
#   curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-vnet.sh | bash
#
# Requisitos:
#   - Azure CLI instalado y autenticado
#   - Dilux ya desplegado en un Resource Group
#   - VNet existente (o permisos para crear subnet)
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
    echo -e "${CYAN}${BOLD}   Dilux Database Backup - VNet Integration${NC}"
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

# ============================================================================
# Pre-flight Checks
# ============================================================================

check_prerequisites() {
    print_step "0/5" "Verificando pre-requisitos"

    # Check if az cli is installed
    if ! command -v az &> /dev/null; then
        print_error "Azure CLI no está instalado"
        exit 1
    fi
    print_success "Azure CLI instalado"

    # Check if logged in
    if ! az account show &> /dev/null; then
        print_warning "No has iniciado sesión en Azure CLI"
        az login
    fi
    print_success "Sesión de Azure activa"

    # Get subscription info
    SUBSCRIPTION_ID=$(az account show --query "id" -o tsv)
    SUBSCRIPTION_NAME=$(az account show --query "name" -o tsv)
    print_info "Subscription: $SUBSCRIPTION_NAME"
}

# ============================================================================
# Initial Question
# ============================================================================

ask_initial_question() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}¿Qué deseas hacer?${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "VNet Integration permite que Dilux acceda a bases de datos"
    echo "en redes privadas de Azure (Private Endpoints, VMs en VNet)."
    echo ""
    echo -e "  ${GREEN}1)${NC} Configurar VNet Integration ahora"
    echo -e "  ${YELLOW}2)${NC} Salir (puedo hacerlo después)"
    echo ""
    echo -en "${BOLD}Selecciona [1-2]:${NC} "
    read INITIAL_CHOICE < /dev/tty

    if [ "$INITIAL_CHOICE" != "1" ]; then
        echo ""
        print_info "VNet Integration no configurado."
        echo ""
        echo "Tus Function Apps solo podrán acceder a bases de datos"
        echo "con endpoints públicos."
        echo ""
        echo "Para configurarlo después, ejecuta:"
        echo -e "  ${CYAN}curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-vnet.sh | bash${NC}"
        echo ""
        exit 0
    fi
}

# ============================================================================
# Select Resource Group
# ============================================================================

select_resource_group() {
    print_step "1/5" "Seleccionar Resource Group de Dilux"

    echo ""
    echo "Buscando deployments de Dilux..."

    # Find resource groups with Dilux function apps
    DILUX_RGS=$(az functionapp list --query "[?contains(name, '-api')].resourceGroup" -o tsv 2>/dev/null | sort -u)

    if [ -z "$DILUX_RGS" ]; then
        print_warning "No se encontraron deployments de Dilux automáticamente."
        echo ""
        echo -en "${BOLD}Ingresa el nombre del Resource Group:${NC} "
        read RESOURCE_GROUP < /dev/tty

        if [ -z "$RESOURCE_GROUP" ]; then
            print_error "Resource Group requerido"
            exit 1
        fi
    else
        echo ""
        echo "Resource Groups con Dilux encontrados:"
        echo ""

        # Convert to array
        RG_ARRAY=()
        INDEX=1
        while IFS= read -r rg; do
            if [ -n "$rg" ]; then
                RG_ARRAY+=("$rg")
                echo -e "  ${GREEN}$INDEX)${NC} $rg"
                INDEX=$((INDEX + 1))
            fi
        done <<< "$DILUX_RGS"

        echo -e "  ${YELLOW}0)${NC} Cancelar"
        echo ""
        echo -en "${BOLD}Selecciona [0-$((INDEX-1))]:${NC} "
        read RG_CHOICE < /dev/tty

        if [ "$RG_CHOICE" == "0" ] || [ -z "$RG_CHOICE" ]; then
            echo ""
            print_warning "Operación cancelada."
            exit 0
        fi

        # Validate selection
        if [ "$RG_CHOICE" -ge 1 ] && [ "$RG_CHOICE" -lt "$INDEX" ] 2>/dev/null; then
            RESOURCE_GROUP="${RG_ARRAY[$((RG_CHOICE-1))]}"
        else
            print_error "Selección inválida"
            exit 1
        fi
    fi

    # Verify resource group exists
    if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
        print_error "Resource Group '$RESOURCE_GROUP' no existe"
        exit 1
    fi

    print_success "Resource Group: $RESOURCE_GROUP"

    # Get Function App names
    API_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[?contains(name, '-api')].name" -o tsv | head -1)
    SCHEDULER_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[?contains(name, '-scheduler')].name" -o tsv | head -1)
    PROCESSOR_APP=$(az functionapp list --resource-group "$RESOURCE_GROUP" --query "[?contains(name, '-processor')].name" -o tsv | head -1)

    if [ -z "$API_APP" ] || [ -z "$SCHEDULER_APP" ] || [ -z "$PROCESSOR_APP" ]; then
        print_error "No se encontraron las 3 Function Apps de Dilux en $RESOURCE_GROUP"
        exit 1
    fi

    # Get Function App location (all 3 should be in same region)
    APP_LOCATION_DISPLAY=$(az functionapp show \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --query "location" -o tsv 2>/dev/null)

    if [ -z "$APP_LOCATION_DISPLAY" ]; then
        print_error "No se pudo obtener la ubicación de las Function Apps"
        exit 1
    fi

    # Normalize location to match VNet format (e.g., "East US" -> "eastus")
    APP_LOCATION=$(echo "$APP_LOCATION_DISPLAY" | tr '[:upper:]' '[:lower:]' | tr -d ' ')

    print_info "Function Apps encontradas (región: ${APP_LOCATION_DISPLAY}):"
    echo "  - $API_APP"
    echo "  - $SCHEDULER_APP"
    echo "  - $PROCESSOR_APP"
}

# ============================================================================
# Select VNet
# ============================================================================

select_vnet() {
    print_step "2/5" "Seleccionar Virtual Network"

    echo ""
    echo -e "Buscando VNets en la región ${CYAN}${APP_LOCATION_DISPLAY}${NC}..."
    echo "(Solo se muestran VNets en la misma región que las Function Apps)"
    echo ""

    # List VNets ONLY in the same region as the Function Apps
    VNETS=$(az network vnet list \
        --query "[?location=='${APP_LOCATION}'].{name:name, rg:resourceGroup, location:location, address:addressSpace.addressPrefixes[0]}" \
        -o json 2>/dev/null)
    VNET_COUNT=$(echo "$VNETS" | jq 'length')

    if [ "$VNET_COUNT" == "0" ] || [ -z "$VNETS" ] || [ "$VNETS" == "[]" ]; then
        print_error "No se encontraron VNets en la región ${APP_LOCATION_DISPLAY}"
        echo ""
        echo -e "Tus Function Apps están desplegadas en ${CYAN}${APP_LOCATION_DISPLAY}${NC}."
        echo ""
        echo "Para usar VNet Integration, tienes dos opciones:"
        echo ""
        echo -e "  1) Crear una VNet en ${CYAN}${APP_LOCATION_DISPLAY}${NC} con tus bases de datos"
        echo ""
        echo "  2) Redesplegar Dilux en la región donde está tu VNet:"
        echo -e "     - Elimina el Resource Group: ${CYAN}az group delete -n $RESOURCE_GROUP${NC}"
        echo "     - Ejecuta el instalador de nuevo eligiendo la VNet correcta"
        echo ""
        exit 1
    fi

    echo -e "VNets disponibles en ${CYAN}${APP_LOCATION_DISPLAY}${NC}:"
    echo ""

    # Display VNets
    INDEX=1
    while IFS='|' read -r name rg address; do
        echo -e "  ${GREEN}$INDEX)${NC} $name ($address) - RG: $rg"
        INDEX=$((INDEX + 1))
    done < <(echo "$VNETS" | jq -r '.[] | "\(.name)|\(.rg)|\(.address)"')

    echo -e "  ${YELLOW}0)${NC} Cancelar"
    echo ""
    echo -en "${BOLD}Selecciona [0-$VNET_COUNT]:${NC} "
    read VNET_CHOICE < /dev/tty

    if [ "$VNET_CHOICE" == "0" ] || [ -z "$VNET_CHOICE" ]; then
        echo ""
        print_warning "Operación cancelada."
        exit 0
    fi

    # Validate selection
    if ! [[ "$VNET_CHOICE" =~ ^[0-9]+$ ]] || [ "$VNET_CHOICE" -lt 1 ] || [ "$VNET_CHOICE" -gt "$VNET_COUNT" ]; then
        print_error "Selección inválida"
        exit 1
    fi

    # Get selected VNet details
    VNET_INDEX=$((VNET_CHOICE - 1))
    VNET_NAME=$(echo "$VNETS" | jq -r ".[$VNET_INDEX].name")
    VNET_RG=$(echo "$VNETS" | jq -r ".[$VNET_INDEX].rg")
    VNET_ADDRESS=$(echo "$VNETS" | jq -r ".[$VNET_INDEX].address")

    if [ "$VNET_NAME" == "null" ] || [ -z "$VNET_NAME" ]; then
        print_error "Selección inválida"
        exit 1
    fi

    print_success "VNet seleccionada: $VNET_NAME ($VNET_ADDRESS)"

    # Get VNet ID for later use
    VNET_ID=$(az network vnet show --name "$VNET_NAME" --resource-group "$VNET_RG" --query "id" -o tsv)
}

# ============================================================================
# Select or Create Subnet
# ============================================================================

select_subnet() {
    print_step "3/5" "Seleccionar o crear Subnet"

    echo ""
    echo "Buscando subnets en $VNET_NAME..."

    # List subnets with delegation info (note: addressPrefixes is an array)
    SUBNETS=$(az network vnet subnet list \
        --vnet-name "$VNET_NAME" \
        --resource-group "$VNET_RG" \
        --query "[].{name:name, address:addressPrefixes[0], delegation:delegations[0].serviceName}" \
        -o json 2>/dev/null)

    SUBNET_COUNT=$(echo "$SUBNETS" | jq 'length')

    echo ""

    # Check for compatible subnets
    COMPATIBLE_FOUND=false

    if [ "$SUBNET_COUNT" != "0" ] && [ -n "$SUBNETS" ]; then
        echo "Subnets existentes:"
        echo ""

        INDEX=1
        echo "$SUBNETS" | jq -r '.[] | "\(.name)|\(.address)|\(.delegation)"' | while IFS='|' read -r name address delegation; do
            if [ "$delegation" == "Microsoft.Web/serverFarms" ]; then
                echo -e "  ${GREEN}$INDEX)${NC} $name ($address) - ${GREEN}✓ Compatible${NC}"
                COMPATIBLE_FOUND=true
            elif [ "$delegation" == "null" ] || [ -z "$delegation" ]; then
                echo -e "  ${YELLOW}$INDEX)${NC} $name ($address) - Sin delegación (se puede usar)"
            else
                echo -e "  ${RED}$INDEX)${NC} $name ($address) - Delegado a: $delegation ${RED}✗${NC}"
            fi
            INDEX=$((INDEX + 1))
        done

        echo ""
    fi

    echo -e "  ${CYAN}N)${NC} ✨ Crear nuevo subnet"
    echo -e "  ${YELLOW}0)${NC} Cancelar"
    echo ""
    echo -en "${BOLD}Selecciona [0-$SUBNET_COUNT/N]:${NC} "
    read SUBNET_CHOICE < /dev/tty

    if [ "$SUBNET_CHOICE" == "0" ]; then
        echo ""
        print_warning "Operación cancelada."
        exit 0
    fi

    if [ "$SUBNET_CHOICE" == "N" ] || [ "$SUBNET_CHOICE" == "n" ]; then
        create_new_subnet
    else
        # Select existing subnet
        SUBNET_INDEX=$((SUBNET_CHOICE - 1))
        SUBNET_NAME=$(echo "$SUBNETS" | jq -r ".[$SUBNET_INDEX].name")
        SUBNET_ADDRESS=$(echo "$SUBNETS" | jq -r ".[$SUBNET_INDEX].address")
        SUBNET_DELEGATION=$(echo "$SUBNETS" | jq -r ".[$SUBNET_INDEX].delegation")

        if [ "$SUBNET_NAME" == "null" ] || [ -z "$SUBNET_NAME" ]; then
            print_error "Selección inválida"
            exit 1
        fi

        # Check if delegation is to another service
        if [ "$SUBNET_DELEGATION" != "null" ] && [ "$SUBNET_DELEGATION" != "Microsoft.Web/serverFarms" ] && [ -n "$SUBNET_DELEGATION" ]; then
            print_error "Este subnet está delegado a $SUBNET_DELEGATION"
            echo "No puede usarse para Function Apps."
            exit 1
        fi

        # Add delegation if not present
        if [ "$SUBNET_DELEGATION" == "null" ] || [ -z "$SUBNET_DELEGATION" ]; then
            echo ""
            echo "Agregando delegación a Microsoft.Web/serverFarms..."
            az network vnet subnet update \
                --name "$SUBNET_NAME" \
                --vnet-name "$VNET_NAME" \
                --resource-group "$VNET_RG" \
                --delegations "Microsoft.Web/serverFarms" \
                --output none 2>/dev/null
            print_success "Delegación agregada"
        fi

        print_success "Subnet seleccionado: $SUBNET_NAME ($SUBNET_ADDRESS)"
    fi

    # Get Subnet ID
    SUBNET_ID=$(az network vnet subnet show \
        --name "$SUBNET_NAME" \
        --vnet-name "$VNET_NAME" \
        --resource-group "$VNET_RG" \
        --query "id" -o tsv)
}

# ============================================================================
# Create New Subnet
# ============================================================================

create_new_subnet() {
    print_step "3b/5" "Crear nuevo Subnet"

    echo ""
    echo "Calculando espacio de direcciones disponible..."

    # Get VNet address space
    VNET_PREFIX=$(az network vnet show \
        --name "$VNET_NAME" \
        --resource-group "$VNET_RG" \
        --query "addressSpace.addressPrefixes[0]" -o tsv)

    # Get all existing subnet prefixes (use addressPrefixes[0] as it's an array)
    EXISTING_SUBNETS=$(az network vnet subnet list \
        --vnet-name "$VNET_NAME" \
        --resource-group "$VNET_RG" \
        --query "[].addressPrefixes[0]" -o tsv | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n)

    # Extract base from VNet (first two octets)
    VNET_BASE=$(echo "$VNET_PREFIX" | cut -d'.' -f1-2)

    # Find the highest third octet in use and add 1
    if [ -n "$EXISTING_SUBNETS" ]; then
        # Get all third octets, find the maximum, and add 1
        MAX_THIRD_OCTET=$(echo "$EXISTING_SUBNETS" | cut -d'.' -f3 | sort -n | tail -1)
        NEXT_THIRD_OCTET=$((MAX_THIRD_OCTET + 1))
        SUGGESTED_PREFIX="${VNET_BASE}.${NEXT_THIRD_OCTET}.0"
    else
        # No subnets, suggest first block after .0
        SUGGESTED_PREFIX="${VNET_BASE}.1.0"
    fi

    # Validate the suggested prefix is within VNet range
    if [ "$NEXT_THIRD_OCTET" -gt 255 ]; then
        print_error "No hay espacio disponible en la VNet"
        exit 1
    fi

    echo ""
    echo -e "${CYAN}Espacio de VNet:${NC} $VNET_PREFIX"
    echo -e "${CYAN}Siguiente bloque disponible:${NC} $SUGGESTED_PREFIX"
    echo ""

    echo "Selecciona el tamaño del subnet:"
    echo ""
    echo -e "  ${GREEN}1)${NC} /28 = 16 IPs   (mínimo para Dilux)"
    echo -e "  ${GREEN}2)${NC} /27 = 32 IPs   ${GREEN}(recomendado)${NC}"
    echo -e "  ${YELLOW}3)${NC} /26 = 64 IPs   (para futuras apps)"
    echo -e "  ${YELLOW}4)${NC} /24 = 256 IPs  (grande)"
    echo -e "  ${YELLOW}0)${NC} Cancelar"
    echo ""
    echo -en "${BOLD}Selecciona [0-4] (default: 2):${NC} "
    read SIZE_CHOICE < /dev/tty
    SIZE_CHOICE="${SIZE_CHOICE:-2}"

    case $SIZE_CHOICE in
        0)
            print_warning "Operación cancelada."
            exit 0
            ;;
        1) SUBNET_CIDR="/28" ;;
        2) SUBNET_CIDR="/27" ;;
        3) SUBNET_CIDR="/26" ;;
        4) SUBNET_CIDR="/24" ;;
        *)
            print_warning "Opción inválida, usando /27"
            SUBNET_CIDR="/27"
            ;;
    esac

    NEW_SUBNET_ADDRESS="${SUGGESTED_PREFIX}${SUBNET_CIDR}"

    echo ""
    echo -en "${BOLD}Nombre del subnet [dilux-functions]:${NC} "
    read NEW_SUBNET_NAME < /dev/tty
    NEW_SUBNET_NAME="${NEW_SUBNET_NAME:-dilux-functions}"

    echo ""
    echo "Creando subnet '$NEW_SUBNET_NAME' ($NEW_SUBNET_ADDRESS)..."
    echo ""

    # Crear el subnet (capturando errores)
    CREATE_OUTPUT=$(az network vnet subnet create \
        --name "$NEW_SUBNET_NAME" \
        --vnet-name "$VNET_NAME" \
        --resource-group "$VNET_RG" \
        --address-prefixes "$NEW_SUBNET_ADDRESS" \
        --delegations "Microsoft.Web/serverFarms" \
        -o json 2>&1)

    CREATE_RESULT=$?

    if [ $CREATE_RESULT -ne 0 ]; then
        print_error "Error al crear el subnet"
        echo ""
        echo "Detalle del error:"
        echo "$CREATE_OUTPUT"
        echo ""
        echo "Puede que el rango de direcciones esté en uso o sea inválido."
        echo "Intenta con otro rango o crea el subnet manualmente."
        exit 1
    fi

    SUBNET_NAME="$NEW_SUBNET_NAME"
    SUBNET_ADDRESS="$NEW_SUBNET_ADDRESS"

    print_success "Subnet '$SUBNET_NAME' creado correctamente ($SUBNET_ADDRESS)"
    echo ""

    # Get Subnet ID
    SUBNET_ID=$(az network vnet subnet show \
        --name "$SUBNET_NAME" \
        --vnet-name "$VNET_NAME" \
        --resource-group "$VNET_RG" \
        --query "id" -o tsv)

    if [ -z "$SUBNET_ID" ]; then
        print_error "No se pudo obtener el ID del subnet"
        exit 1
    fi

    print_info "Subnet ID obtenido, continuando con la integración..."
}

# ============================================================================
# Apply VNet Integration
# ============================================================================

apply_vnet_integration() {
    print_step "4/5" "Aplicando VNet Integration"

    echo ""
    echo "Integrando las 3 Function Apps con el subnet..."
    echo "Esto puede tomar 1-2 minutos..."
    echo ""

    INTEGRATION_SUCCESS=0
    INTEGRATION_ERRORS=0

    # Integrate API
    echo -n "  [1/3] Integrando $API_APP... "
    API_OUTPUT=$(az functionapp vnet-integration add \
        --name "$API_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --vnet "$VNET_ID" \
        --subnet "$SUBNET_NAME" \
        -o json 2>&1)

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ OK${NC}"
        INTEGRATION_SUCCESS=$((INTEGRATION_SUCCESS + 1))
    else
        if echo "$API_OUTPUT" | grep -qi "already"; then
            echo -e "${YELLOW}⚠️  Ya estaba integrado${NC}"
            INTEGRATION_SUCCESS=$((INTEGRATION_SUCCESS + 1))
        else
            echo -e "${RED}❌ Error${NC}"
            INTEGRATION_ERRORS=$((INTEGRATION_ERRORS + 1))
        fi
    fi

    # Integrate Scheduler
    echo -n "  [2/3] Integrando $SCHEDULER_APP... "
    SCHEDULER_OUTPUT=$(az functionapp vnet-integration add \
        --name "$SCHEDULER_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --vnet "$VNET_ID" \
        --subnet "$SUBNET_NAME" \
        -o json 2>&1)

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ OK${NC}"
        INTEGRATION_SUCCESS=$((INTEGRATION_SUCCESS + 1))
    else
        if echo "$SCHEDULER_OUTPUT" | grep -qi "already"; then
            echo -e "${YELLOW}⚠️  Ya estaba integrado${NC}"
            INTEGRATION_SUCCESS=$((INTEGRATION_SUCCESS + 1))
        else
            echo -e "${RED}❌ Error${NC}"
            INTEGRATION_ERRORS=$((INTEGRATION_ERRORS + 1))
        fi
    fi

    # Integrate Processor
    echo -n "  [3/3] Integrando $PROCESSOR_APP... "
    PROCESSOR_OUTPUT=$(az functionapp vnet-integration add \
        --name "$PROCESSOR_APP" \
        --resource-group "$RESOURCE_GROUP" \
        --vnet "$VNET_ID" \
        --subnet "$SUBNET_NAME" \
        -o json 2>&1)

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ OK${NC}"
        INTEGRATION_SUCCESS=$((INTEGRATION_SUCCESS + 1))
    else
        if echo "$PROCESSOR_OUTPUT" | grep -qi "already"; then
            echo -e "${YELLOW}⚠️  Ya estaba integrado${NC}"
            INTEGRATION_SUCCESS=$((INTEGRATION_SUCCESS + 1))
        else
            echo -e "${RED}❌ Error${NC}"
            INTEGRATION_ERRORS=$((INTEGRATION_ERRORS + 1))
        fi
    fi

    echo ""

    if [ $INTEGRATION_ERRORS -gt 0 ]; then
        print_warning "$INTEGRATION_SUCCESS/3 apps integradas, $INTEGRATION_ERRORS con errores"
    else
        print_success "Las 3 Function Apps fueron integradas correctamente"
    fi
}

# ============================================================================
# Print Summary
# ============================================================================

print_summary() {
    print_step "5/5" "Resumen"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}   ✅ VNet Integration Configurado${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}Configuración:${NC}"
    echo -e "  VNet:   ${CYAN}$VNET_NAME${NC} ($VNET_RG)"
    echo -e "  Subnet: ${CYAN}$SUBNET_NAME${NC} ($SUBNET_ADDRESS)"
    echo ""
    echo -e "${BOLD}Function Apps integradas:${NC}"
    echo -e "  ✅ $API_APP"
    echo -e "  ✅ $SCHEDULER_APP"
    echo -e "  ✅ $PROCESSOR_APP"
    echo ""
    echo -e "${CYAN}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${BOLD}Próximos pasos:${NC}"
    echo ""
    echo "1. En Dilux, agrega tus servidores de base de datos usando"
    echo "   el hostname del Private Endpoint:"
    echo ""
    echo -e "   ${CYAN}mydb.mysql.database.azure.com${NC}"
    echo -e "   ${CYAN}mydb.postgres.database.azure.com${NC}"
    echo -e "   ${CYAN}myserver.database.windows.net${NC}"
    echo ""
    echo "2. Asegúrate de que la Private DNS Zone esté vinculada"
    echo "   a la VNet '$VNET_NAME'."
    echo ""
    echo "3. Verifica la conectividad ejecutando un backup de prueba."
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
    ask_initial_question
    select_resource_group
    select_vnet
    select_subnet
    apply_vnet_integration
    print_summary

    # Mensaje final claro
    echo ""
    echo -e "${GREEN}${BOLD}¡Script finalizado correctamente!${NC}"
    echo ""
}

# Manejar errores inesperados
trap 'echo ""; echo -e "${RED}❌ El script terminó inesperadamente.${NC}"; echo "Si el error no es claro, ejecuta el script de nuevo."; echo ""' ERR

# Run main function
main "$@"
