// ============================================================================
// Code Deployment Module
// ============================================================================
// Downloads PRE-BUILT release assets from GitHub and deploys them:
// - api.zip -> API Function App
// - scheduler.zip -> Scheduler Function App
// - processor.zip -> Processor Function App
//
// NOTE: Static Web App (frontend) deployment is handled separately via GitHub
// Actions workflow, as SWA requires Node.js/SWA CLI which isn't available in
// the Azure CLI container.
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
    timeout: 'PT15M'
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

# Download Function App ZIPs
echo "[1/3] Downloading api.zip..."
if ! curl -L -f -s -o api.zip "$RELEASE_URL/api.zip"; then
  echo "ERROR: Could not download api.zip"
  echo "URL: $RELEASE_URL/api.zip"
  echo ""
  echo "Make sure:"
  echo "1. The release $VERSION exists"
  echo "2. The release has api.zip, scheduler.zip, processor.zip assets"
  echo "3. Run the Build Release Assets GitHub Action first"
  echo ""
  echo '{"status": "failed", "error": "Could not download api.zip"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi
echo "    Downloaded api.zip"

echo "[2/3] Downloading scheduler.zip..."
if ! curl -L -f -s -o scheduler.zip "$RELEASE_URL/scheduler.zip"; then
  echo "ERROR: Could not download scheduler.zip"
  echo '{"status": "failed", "error": "Could not download scheduler.zip"}' > $AZ_SCRIPTS_OUTPUT_PATH
  exit 1
fi
echo "    Downloaded scheduler.zip"

echo "[3/3] Downloading processor.zip..."
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
# Deploy Function Apps
# ========================================
echo "=========================================="
echo "Deploying Function Apps..."
echo "=========================================="

echo ""
echo "[1/3] Deploying API Function App: $API_FUNCTION_APP_NAME"
az functionapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $API_FUNCTION_APP_NAME \
  --src api.zip \
  --timeout 300
echo "    API Function App deployed"

echo ""
echo "[2/3] Deploying Scheduler Function App: $SCHEDULER_FUNCTION_APP_NAME"
az functionapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $SCHEDULER_FUNCTION_APP_NAME \
  --src scheduler.zip \
  --timeout 300
echo "    Scheduler Function App deployed"

echo ""
echo "[3/3] Deploying Processor Function App: $PROCESSOR_FUNCTION_APP_NAME"
az functionapp deployment source config-zip \
  --resource-group $RESOURCE_GROUP \
  --name $PROCESSOR_FUNCTION_APP_NAME \
  --src processor.zip \
  --timeout 300
echo "    Processor Function App deployed"

# ========================================
# Static Web App Info
# ========================================
echo ""
echo "=========================================="
echo "Static Web App Deployment"
echo "=========================================="
echo ""
echo "Static Web App: $STATIC_WEB_APP_NAME"
echo ""
echo "The frontend will be deployed automatically via GitHub Actions"
echo "when you connect the Static Web App to your GitHub repository."
echo ""
echo "Alternatively, get the deployment token from Azure Portal and"
echo "use the SWA CLI locally: swa deploy ./dist --deployment-token <token>"
echo ""

# Get SWA hostname for output
SWA_URL=$(az staticwebapp show \
  --name $STATIC_WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostname" -o tsv 2>/dev/null || echo "")

API_URL=$(az functionapp show \
  --name $API_FUNCTION_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "defaultHostName" -o tsv 2>/dev/null || echo "")

echo "=========================================="
echo "DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Function Apps deployed successfully!"
echo ""
echo "URLs:"
echo "  API:      https://$API_URL"
echo "  Frontend: https://$SWA_URL"
echo ""

# Output results
cat > $AZ_SCRIPTS_OUTPUT_PATH << EOF
{
  "status": "success",
  "version": "$VERSION",
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
