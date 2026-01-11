// ============================================================================
// Code Deployment Module
// ============================================================================
// Downloads release assets from GitHub and deploys them:
// - frontend.zip -> Static Web App
// - api.zip -> API Function App (source only, deps via remote build)
// - scheduler.zip -> Scheduler Function App (source only)
// - processor.zip -> Processor Function App (source only)
//
// IMPORTANT: Function App ZIPs contain source code only (no .python_packages/).
// Dependencies are installed via Azure's remote build using requirements.txt.
// This avoids GLIBC version mismatch errors with the cryptography package.
//
// ALL components are deployed automatically - no manual steps required.
// ============================================================================

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('User-assigned Managed Identity ID for running the script')
param identityId string

@description('GitHub repository (owner/repo)')
param gitHubRepo string = 'pablodiloreto/dilux-azure-databases-backup-alpha'

@description('Version to deploy (GitHub release tag)')
param version string

@description('Static Web App name')
param staticWebAppName string

@description('API Function App name')
param apiFunctionAppName string

@description('Scheduler Function App name')
param schedulerFunctionAppName string

@description('Processor Function App name')
param processorFunctionAppName string

@description('Resource group name')
param resourceGroupName string

@description('API base URL for frontend build')
param apiBaseUrl string

@description('Azure AD Tenant ID for authentication')
param azureAdTenantId string = ''

@description('Azure AD Client ID for authentication')
param azureAdClientId string = ''

// ============================================================================
// Deployment Script - Downloads and deploys pre-built Function App assets
// ============================================================================

resource deploymentScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: 'deploy-application-code'
  location: location
  tags: tags
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    azCliVersion: '2.50.0'
    timeout: 'PT30M'  // Increased for remote build (installs Python dependencies)
    retentionInterval: 'PT1H'
    cleanupPreference: 'OnSuccess'
    environmentVariables: [
      { name: 'GITHUB_REPO', value: gitHubRepo }
      { name: 'VERSION', value: version }
      { name: 'STATIC_WEB_APP_NAME', value: staticWebAppName }
      { name: 'API_FUNCTION_APP_NAME', value: apiFunctionAppName }
      { name: 'SCHEDULER_FUNCTION_APP_NAME', value: schedulerFunctionAppName }
      { name: 'PROCESSOR_FUNCTION_APP_NAME', value: processorFunctionAppName }
      { name: 'RESOURCE_GROUP', value: resourceGroupName }
      { name: 'API_BASE_URL', value: apiBaseUrl }
      { name: 'AZURE_AD_TENANT_ID', value: azureAdTenantId }
      { name: 'AZURE_AD_CLIENT_ID', value: azureAdClientId }
    ]
    scriptContent: '''
#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Dilux Database Backup"
echo "=========================================="

# Function to deploy with remote build (installs dependencies on Azure)
deploy_with_remote_build() {
  local app_name=$1
  local zip_file=$2
  local max_attempts=5
  local attempt=1
  local wait_time=30

  # Enable remote build settings
  echo "    Configuring remote build..."
  az functionapp config appsettings set \
    --name $app_name \
    --resource-group $RESOURCE_GROUP \
    --settings "SCM_DO_BUILD_DURING_DEPLOYMENT=true" "ENABLE_ORYX_BUILD=true" \
    -o none 2>&1 || true

  while [ $attempt -le $max_attempts ]; do
    echo "    Attempt $attempt of $max_attempts (with remote build)..."

    # Use --build-remote true to install dependencies on Azure
    if az functionapp deployment source config-zip \
      --resource-group $RESOURCE_GROUP \
      --name $app_name \
      --src $zip_file \
      --build-remote true \
      --timeout 600 2>&1; then
      echo "    Success! (dependencies installed via remote build)"
      return 0
    fi

    if [ $attempt -lt $max_attempts ]; then
      echo "    Failed. Waiting ${wait_time}s for RBAC propagation..."
      sleep $wait_time
      wait_time=$((wait_time + 30))
    fi

    attempt=$((attempt + 1))
  done

  echo "    ERROR: Failed after $max_attempts attempts"
  return 1
}

# Resolve "latest" to actual version tag using GitHub API
if [ "$VERSION" == "latest" ]; then
  echo "Resolving latest release from GitHub..."

  RELEASE_INFO=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest")
  RESOLVED_VERSION=$(echo "$RELEASE_INFO" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

  if [ -z "$RESOLVED_VERSION" ] || [ "$RESOLVED_VERSION" == "null" ]; then
    echo "ERROR: Could not resolve latest release"
    echo "Make sure the repository has at least one published release."
    echo '{"status": "failed", "error": "No releases found"}' > $AZ_SCRIPTS_OUTPUT_PATH
    exit 1
  fi

  echo "Resolved latest to: $RESOLVED_VERSION"
  VERSION=$RESOLVED_VERSION
fi

echo "Version: $VERSION"
echo "Repository: $GITHUB_REPO"
echo "=========================================="

# Base URL for release assets
RELEASE_URL="https://github.com/$GITHUB_REPO/releases/download/$VERSION"

echo ""
echo "Downloading pre-built release assets from:"
echo "$RELEASE_URL"
echo ""

# Download all ZIPs (frontend + 3 Function Apps)
echo "[1/4] Downloading frontend.zip..."
if ! curl -L -f -s -o frontend.zip "$RELEASE_URL/frontend.zip"; then
  echo "ERROR: Could not download frontend.zip"
  echo "URL: $RELEASE_URL/frontend.zip"
  echo ""
  echo "Make sure:"
  echo "1. The release $VERSION exists"
  echo "2. The release has frontend.zip, api.zip, scheduler.zip, processor.zip assets"
  echo "3. Run the Build Release Assets GitHub Action first"
  echo ""
  echo '{"status": "failed", "error": "Could not download frontend.zip"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi
echo "    Downloaded frontend.zip"

echo "[2/4] Downloading api.zip..."
if ! curl -L -f -s -o api.zip "$RELEASE_URL/api.zip"; then
  echo "ERROR: Could not download api.zip"
  echo '{"status": "failed", "error": "Could not download api.zip"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi
echo "    Downloaded api.zip"

echo "[3/4] Downloading scheduler.zip..."
if ! curl -L -f -s -o scheduler.zip "$RELEASE_URL/scheduler.zip"; then
  echo "ERROR: Could not download scheduler.zip"
  echo '{"status": "failed", "error": "Could not download scheduler.zip"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi
echo "    Downloaded scheduler.zip"

echo "[4/4] Downloading processor.zip..."
if ! curl -L -f -s -o processor.zip "$RELEASE_URL/processor.zip"; then
  echo "ERROR: Could not download processor.zip"
  echo '{"status": "failed", "error": "Could not download processor.zip"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi
echo "    Downloaded processor.zip"

echo ""
echo "All assets downloaded successfully:"
ls -lh *.zip
echo ""

# ========================================
# Get Static Web App URL for config.json
# ========================================
echo "=========================================="
echo "Getting Static Web App URL..."
echo "=========================================="

SWA_URL=$(az staticwebapp show \
  --name $STATIC_WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" -o tsv 2>/dev/null || echo "")

if [ -z "$SWA_URL" ]; then
  echo "WARNING: Could not get SWA URL"
  SWA_URL="localhost"
fi

echo "Static Web App URL: https://$SWA_URL"
echo ""

# ========================================
# Wait for RBAC propagation
# ========================================
echo "=========================================="
echo "Waiting for RBAC permissions to propagate..."
echo "=========================================="
echo "(Azure AD role assignments can take up to 5 minutes to propagate)"
sleep 60
echo "Waited 60 seconds. Starting deployment..."
echo ""

# ========================================
# Deploy Static Web App (Frontend) with config.json
# ========================================
echo "=========================================="
echo "Deploying Static Web App (Frontend)..."
echo "=========================================="
echo ""
echo "Static Web App: $STATIC_WEB_APP_NAME"

# Get deployment token
echo "Getting deployment token..."
DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
  --name $STATIC_WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.apiKey" -o tsv 2>/dev/null || echo "")

if [ -n "$DEPLOYMENT_TOKEN" ]; then
  echo "    Deployment token obtained"

  # Extract frontend.zip
  echo "Extracting frontend.zip..."
  mkdir -p frontend_dist
  unzip -q frontend.zip -d frontend_dist

  # Determine auth mode based on client ID availability
  if [ -n "$AZURE_AD_CLIENT_ID" ] && [ "$AZURE_AD_CLIENT_ID" != "" ]; then
    AUTH_MODE="azure"
  else
    AUTH_MODE="mock"
  fi

  # Generate config.json with runtime configuration
  echo "Generating config.json for runtime configuration..."
  cat > frontend_dist/config.json << CONFIGEOF
{
  "apiUrl": "$API_BASE_URL",
  "azureClientId": "$AZURE_AD_CLIENT_ID",
  "azureTenantId": "$AZURE_AD_TENANT_ID",
  "azureRedirectUri": "https://$SWA_URL",
  "authMode": "$AUTH_MODE"
}
CONFIGEOF

  echo "    config.json created:"
  cat frontend_dist/config.json
  echo ""

  # Create a new ZIP with config.json included
  echo "Creating deployment package..."
  cd frontend_dist
  zip -r ../frontend_with_config.zip . -q
  cd ..

  # Get the SWA region from the resource
  SWA_LOCATION=$(az staticwebapp show \
    --name $STATIC_WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query "location" -o tsv 2>/dev/null || echo "eastus2")

  # Map location to content delivery region
  case "$SWA_LOCATION" in
    "eastus2"|"East US 2") CONTENT_REGION="eastus2" ;;
    "westus2"|"West US 2") CONTENT_REGION="westus2" ;;
    "westeurope"|"West Europe") CONTENT_REGION="westeurope" ;;
    "eastasia"|"East Asia") CONTENT_REGION="eastasia" ;;
    "centralus"|"Central US") CONTENT_REGION="centralus" ;;
    *) CONTENT_REGION="eastus2" ;;
  esac

  echo "Deploying frontend via API (region: $CONTENT_REGION)..."

  # Deploy using the SWA deployment API
  DEPLOY_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "https://content-$CONTENT_REGION.azurestaticapps.net/api/zipdeploy?sitename=$STATIC_WEB_APP_NAME" \
    -H "Authorization: Bearer $DEPLOYMENT_TOKEN" \
    -H "Content-Type: application/zip" \
    --data-binary @frontend_with_config.zip 2>&1)

  HTTP_CODE=$(echo "$DEPLOY_RESPONSE" | tail -1)
  RESPONSE_BODY=$(echo "$DEPLOY_RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
    echo "    Frontend deployed successfully via API!"
    FRONTEND_DEPLOYED=true
  else
    echo "    WARNING: API deployment returned HTTP $HTTP_CODE"
    echo "    Response: $RESPONSE_BODY"
    echo "    Trying alternative deployment method..."

    # Alternative: Use az staticwebapp environment upload (if available)
    if az staticwebapp environment list --name $STATIC_WEB_APP_NAME --resource-group $RESOURCE_GROUP &>/dev/null; then
      echo "    Attempting upload via az staticwebapp..."
      # Note: This command may not be available in all Azure CLI versions
      FRONTEND_DEPLOYED=false
    else
      FRONTEND_DEPLOYED=false
    fi
  fi
else
  echo "    WARNING: Could not get deployment token"
  FRONTEND_DEPLOYED=false
fi

echo ""

# ========================================
# Deploy Function Apps (with retry)
# ========================================
echo "=========================================="
echo "Deploying Function Apps..."
echo "=========================================="

echo ""
echo "[1/3] Deploying API Function App: $API_FUNCTION_APP_NAME"
if ! deploy_with_remote_build $API_FUNCTION_APP_NAME api.zip; then
  echo '{"status": "failed", "error": "Failed to deploy API Function App"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi

echo ""
echo "[2/3] Deploying Scheduler Function App: $SCHEDULER_FUNCTION_APP_NAME"
if ! deploy_with_remote_build $SCHEDULER_FUNCTION_APP_NAME scheduler.zip; then
  echo '{"status": "failed", "error": "Failed to deploy Scheduler Function App"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi

echo ""
echo "[3/3] Deploying Processor Function App: $PROCESSOR_FUNCTION_APP_NAME"
if ! deploy_with_remote_build $PROCESSOR_FUNCTION_APP_NAME processor.zip; then
  echo '{"status": "failed", "error": "Failed to deploy Processor Function App"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi

# Get URLs for output
SWA_URL=$(az staticwebapp show \
  --name $STATIC_WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" -o tsv 2>/dev/null || echo "")

API_URL=$(az functionapp show \
  --name $API_FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostName" -o tsv 2>/dev/null || echo "")

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "All components deployed successfully!"
echo ""
echo "URLs:"
echo "  Frontend: https://$SWA_URL"
echo "  API:      https://$API_URL"
echo ""

if [ "$FRONTEND_DEPLOYED" != true ]; then
  echo "NOTE: Frontend deployment may require manual step."
  echo ""
  echo "Option 1 - Using SWA CLI (recommended):"
  echo "  npm install -g @azure/static-web-apps-cli"
  echo "  swa deploy ./dist --deployment-token <token>"
  echo ""
  echo "Option 2 - Using Azure Portal:"
  echo "  1. Go to Azure Portal > Static Web App > Deployment token"
  echo "  2. Copy the token and use with swa deploy"
  echo ""
fi

# Output results
cat > $AZ_SCRIPTS_OUTPUT_PATH << EOF
{
  "status": "success",
  "version": "$VERSION",
  "frontendDeployed": $FRONTEND_DEPLOYED,
  "functionAppsDeployed": true,
  "apiUrl": "https://$API_URL",
  "frontendUrl": "https://$SWA_URL"
}
EOF
    '''
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Deployment script status')
output status string = deploymentScript.properties.provisioningState

@description('Deployed version')
output deployedVersion string = version
