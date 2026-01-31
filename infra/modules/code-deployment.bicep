// ============================================================================
// Code Deployment Module
// ============================================================================
// Downloads release assets from GitHub and deploys them:
// - frontend.zip -> Blob Storage Static Website ($web container)
// - api.zip -> API Function App (source only, deps via remote build)
// - scheduler.zip -> Scheduler Function App (source only)
// - processor.zip -> Processor Function App (source only)
//
// IMPORTANT: Function App ZIPs contain source code only (no .python_packages/).
// Dependencies are installed via Azure's remote build using requirements.txt.
// This avoids GLIBC version mismatch errors with the cryptography package.
//
// Frontend is deployed to Azure Blob Storage Static Website which provides
// HTTPS automatically without requiring Azure CDN.
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

@description('Storage Account name for uploading frontend ZIP')
param storageAccountName string = ''

@description('Storage Account blob endpoint')
param storageBlobEndpoint string = ''

@description('Is Flex Consumption plan (requires different deployment method)')
param isFlexConsumption bool = false

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
      { name: 'API_FUNCTION_APP_NAME', value: apiFunctionAppName }
      { name: 'SCHEDULER_FUNCTION_APP_NAME', value: schedulerFunctionAppName }
      { name: 'PROCESSOR_FUNCTION_APP_NAME', value: processorFunctionAppName }
      { name: 'RESOURCE_GROUP', value: resourceGroupName }
      { name: 'API_BASE_URL', value: apiBaseUrl }
      { name: 'AZURE_AD_TENANT_ID', value: azureAdTenantId }
      { name: 'AZURE_AD_CLIENT_ID', value: azureAdClientId }
      { name: 'STORAGE_ACCOUNT_NAME', value: storageAccountName }
      { name: 'STORAGE_BLOB_ENDPOINT', value: storageBlobEndpoint }
      { name: 'IS_FLEX_CONSUMPTION', value: string(isFlexConsumption) }
    ]
    scriptContent: '''
#!/bin/bash
set -e

echo "=========================================="
echo "Deploying Dilux Database Backup"
echo "=========================================="

# Function to deploy to Flex Consumption (FC1)
# FC1 does NOT support SCM_DO_BUILD_DURING_DEPLOYMENT setting (neither true nor false)
# The fix is: delete the setting, restart, wait, then deploy WITHOUT --build-remote flag
deploy_flex_consumption() {
  local app_name=$1
  local zip_file=$2
  local max_attempts=5
  local attempt=1
  local wait_time=30

  echo "    [FC1] Deploying via config-zip..."

  # CRITICAL: Delete SCM_DO_BUILD_DURING_DEPLOYMENT and ENABLE_ORYX_BUILD settings
  # These settings are NOT supported by FC1 and cause deployment failures
  echo "    [FC1] Removing incompatible settings..."
  az functionapp config appsettings delete \
    --name $app_name \
    --resource-group $RESOURCE_GROUP \
    --setting-names SCM_DO_BUILD_DURING_DEPLOYMENT ENABLE_ORYX_BUILD \
    --only-show-errors \
    -o none 2>/dev/null || true

  # Restart to clear any cached deployment state
  echo "    [FC1] Restarting Function App..."
  az functionapp restart \
    --name $app_name \
    --resource-group $RESOURCE_GROUP \
    --only-show-errors 2>/dev/null || true

  echo "    [FC1] Waiting 30s for restart to complete..."
  sleep 30

  while [ $attempt -le $max_attempts ]; do
    echo "    [FC1] Attempt $attempt of $max_attempts..."

    # IMPORTANT: Do NOT use --build-remote flag at all (neither true nor false)
    # FC1 handles remote build automatically without the flag
    if az functionapp deployment source config-zip \
      --resource-group $RESOURCE_GROUP \
      --name $app_name \
      --src $zip_file \
      --timeout 600 2>&1; then
      echo "    [FC1] Success!"
      return 0
    fi

    if [ $attempt -lt $max_attempts ]; then
      echo "    [FC1] Failed. Cleaning settings and waiting ${wait_time}s before retry..."
      az functionapp config appsettings delete \
        --name $app_name \
        --resource-group $RESOURCE_GROUP \
        --setting-names SCM_DO_BUILD_DURING_DEPLOYMENT ENABLE_ORYX_BUILD \
        --only-show-errors \
        -o none 2>/dev/null || true
      az functionapp restart --name $app_name --resource-group $RESOURCE_GROUP --only-show-errors 2>/dev/null || true
      sleep $wait_time
      wait_time=$((wait_time + 30))
    fi

    attempt=$((attempt + 1))
  done

  echo "    [FC1] ERROR: Failed after $max_attempts attempts"
  return 1
}

# Function to deploy with remote build (for Y1/EP* plans)
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

# Function to deploy Function App (auto-detects plan type)
deploy_function_app() {
  local app_name=$1
  local zip_file=$2

  # Bicep string(true) returns "True" (capital T), so compare case-insensitive
  local is_flex=$(echo "$IS_FLEX_CONSUMPTION" | tr '[:upper:]' '[:lower:]')

  if [ "$is_flex" == "true" ]; then
    deploy_flex_consumption $app_name $zip_file
  else
    deploy_with_remote_build $app_name $zip_file
  fi
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
# Deploy Frontend to Blob Storage Static Website
# ========================================
echo "=========================================="
echo "Deploying Frontend to Blob Storage Static Website..."
echo "=========================================="
echo ""

# Get storage account
if [ -n "$STORAGE_ACCOUNT_NAME" ]; then
  STORAGE_ACCOUNT="$STORAGE_ACCOUNT_NAME"
else
  STORAGE_ACCOUNT=$(az storage account list --resource-group $RESOURCE_GROUP --query "[0].name" -o tsv 2>/dev/null || echo "")
fi

if [ -z "$STORAGE_ACCOUNT" ]; then
  echo "ERROR: Could not find storage account"
  FRONTEND_DEPLOYED=false
  FRONTEND_URL=""
else
  echo "Storage Account: $STORAGE_ACCOUNT"

  # Get storage account key
  echo "Getting storage account key..."
  ACCOUNT_KEY=$(az storage account keys list --account-name $STORAGE_ACCOUNT --resource-group $RESOURCE_GROUP --query "[0].value" -o tsv 2>/dev/null)

  if [ -z "$ACCOUNT_KEY" ]; then
    echo "ERROR: Could not get storage account key"
    FRONTEND_DEPLOYED=false
    FRONTEND_URL=""
  else
    # Enable static website on storage account
    echo "Enabling static website on storage account..."
    az storage blob service-properties update \
      --account-name $STORAGE_ACCOUNT \
      --account-key "$ACCOUNT_KEY" \
      --static-website \
      --index-document index.html \
      --404-document index.html \
      --only-show-errors

    echo "    Static website enabled"

    # Get the static website URL
    FRONTEND_URL=$(az storage account show \
      --name $STORAGE_ACCOUNT \
      --resource-group $RESOURCE_GROUP \
      --query "primaryEndpoints.web" -o tsv 2>/dev/null | sed 's:/*$::')

    echo "    Static Website URL: $FRONTEND_URL"

    # Extract frontend.zip
    echo "Extracting frontend.zip..."
    mkdir -p frontend_dist
    unzip -q frontend.zip -d frontend_dist

    # Determine auth mode based on client ID availability
    if [ -n "$AZURE_AD_CLIENT_ID" ] && [ "$AZURE_AD_CLIENT_ID" != "" ]; then
      AUTH_MODE="azure"

      # Clean up mock users from Table Storage to allow real "first run"
      # This prevents the dev-user from blocking real Azure AD users
      echo "    Cleaning up mock users from Table Storage..."

      # Delete mock dev user if exists (RowKey = dev-user-00000000-0000-0000-0000-000000000000)
      az storage entity delete \
        --account-name $STORAGE_ACCOUNT \
        --account-key "$ACCOUNT_KEY" \
        --table-name users \
        --partition-key "users" \
        --row-key "dev-user-00000000-0000-0000-0000-000000000000" \
        2>/dev/null || true

      echo "    Mock users cleaned up (first login will be admin)"
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
  "azureRedirectUri": "$FRONTEND_URL",
  "authMode": "$AUTH_MODE"
}
CONFIGEOF

    echo "    config.json created:"
    cat frontend_dist/config.json
    echo ""

    # Upload all files to $web container using batch upload
    echo "Uploading frontend files to \$web container..."

    az storage blob upload-batch \
      --account-name $STORAGE_ACCOUNT \
      --account-key "$ACCOUNT_KEY" \
      --destination '$web' \
      --source frontend_dist \
      --overwrite \
      --only-show-errors 2>/dev/null

    echo "    Frontend files uploaded successfully!"
    FRONTEND_DEPLOYED=true
  fi
fi

echo ""

# ========================================
# Deploy Function Apps (with retry)
# ========================================
echo "=========================================="
echo "Deploying Function Apps..."
echo "=========================================="

echo ""
IS_FLEX_LOWER=$(echo "$IS_FLEX_CONSUMPTION" | tr '[:upper:]' '[:lower:]')
echo "Deployment mode: $([ "$IS_FLEX_LOWER" == "true" ] && echo "Flex Consumption (config-zip + restart)" || echo "Standard (config-zip --build-remote)")"
echo ""

echo "[1/3] Deploying API Function App: $API_FUNCTION_APP_NAME"
if ! deploy_function_app $API_FUNCTION_APP_NAME api.zip; then
  echo '{"status": "failed", "error": "Failed to deploy API Function App"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi

echo ""
echo "[2/3] Deploying Scheduler Function App: $SCHEDULER_FUNCTION_APP_NAME"
if ! deploy_function_app $SCHEDULER_FUNCTION_APP_NAME scheduler.zip; then
  echo '{"status": "failed", "error": "Failed to deploy Scheduler Function App"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi

echo ""
echo "[3/3] Deploying Processor Function App: $PROCESSOR_FUNCTION_APP_NAME"
if ! deploy_function_app $PROCESSOR_FUNCTION_APP_NAME processor.zip; then
  echo '{"status": "failed", "error": "Failed to deploy Processor Function App"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi

# Get API URL for output
API_URL=$(az functionapp show \
  --name $API_FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostName" -o tsv 2>/dev/null || echo "")

# ========================================
# Configure CORS for API Function App
# ========================================
if [ -n "$FRONTEND_URL" ]; then
  echo ""
  echo "=========================================="
  echo "Configuring CORS..."
  echo "=========================================="

  # Add specific frontend URL to CORS (required for credentials)
  az functionapp cors add \
    --name $API_FUNCTION_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --allowed-origins "$FRONTEND_URL" \
    -o none 2>/dev/null && echo "  ✅ CORS configured for $FRONTEND_URL" || echo "  ⚠️ CORS may already be configured"
fi

echo ""
echo "=========================================="
echo "DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "All components deployed successfully!"
echo ""
echo "URLs:"
echo "  Frontend: $FRONTEND_URL"
echo "  API:      https://$API_URL"
echo ""

if [ "$FRONTEND_DEPLOYED" != true ]; then
  echo "NOTE: Frontend deployment failed."
  echo "Check the storage account permissions and try again."
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
  "frontendUrl": "$FRONTEND_URL"
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
