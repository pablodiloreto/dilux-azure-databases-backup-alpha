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
      { name: 'VITE_API_BASE_URL', value: apiBaseUrl }
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
# Install Node.js and SWA CLI for frontend deployment
# ========================================
echo "=========================================="
echo "Installing Node.js and SWA CLI..."
echo "=========================================="

# Install Node.js (CBL-Mariner uses tdnf)
if command -v tdnf &> /dev/null; then
  echo "Installing Node.js via tdnf..."
  tdnf install -y nodejs npm 2>&1 || echo "Node.js may already be installed"
elif command -v dnf &> /dev/null; then
  echo "Installing Node.js via dnf..."
  dnf install -y nodejs npm 2>&1 || echo "Node.js may already be installed"
elif command -v apt-get &> /dev/null; then
  echo "Installing Node.js via apt..."
  apt-get update && apt-get install -y nodejs npm 2>&1 || echo "Node.js may already be installed"
else
  echo "WARNING: Could not find package manager to install Node.js"
  echo "Frontend deployment may fail"
fi

# Verify Node.js installation
if command -v node &> /dev/null; then
  echo "Node.js version: $(node --version)"
  echo "npm version: $(npm --version)"

  # Install SWA CLI
  echo "Installing Azure Static Web Apps CLI..."
  npm install -g @azure/static-web-apps-cli 2>&1 || echo "SWA CLI installation failed"

  if command -v swa &> /dev/null; then
    echo "SWA CLI installed successfully"
    SWA_CLI_AVAILABLE=true
  else
    echo "WARNING: SWA CLI not available"
    SWA_CLI_AVAILABLE=false
  fi
else
  echo "WARNING: Node.js not available"
  SWA_CLI_AVAILABLE=false
fi

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
# Deploy Static Web App (Frontend)
# ========================================
echo "=========================================="
echo "Deploying Static Web App (Frontend)..."
echo "=========================================="
echo ""
echo "Static Web App: $STATIC_WEB_APP_NAME"

if [ "$SWA_CLI_AVAILABLE" = true ]; then
  # Get deployment token
  echo "Getting deployment token..."
  DEPLOYMENT_TOKEN=$(az staticwebapp secrets list \
    --name $STATIC_WEB_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --query "properties.apiKey" -o tsv 2>/dev/null || echo "")

  if [ -n "$DEPLOYMENT_TOKEN" ]; then
    echo "Extracting frontend.zip..."
    mkdir -p frontend_dist
    unzip -q frontend.zip -d frontend_dist

    echo "Deploying frontend..."
    if swa deploy ./frontend_dist --deployment-token "$DEPLOYMENT_TOKEN" --env production 2>&1; then
      echo "    Frontend deployed successfully!"
      FRONTEND_DEPLOYED=true
    else
      echo "    WARNING: Frontend deployment failed, but continuing..."
      FRONTEND_DEPLOYED=false
    fi
  else
    echo "    WARNING: Could not get deployment token"
    FRONTEND_DEPLOYED=false
  fi
else
  echo "    WARNING: SWA CLI not available, skipping frontend deployment"
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
  echo "NOTE: Frontend deployment requires manual step."
  echo "Get the deployment token from Azure Portal and run:"
  echo "  swa deploy ./dist --deployment-token <token>"
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
