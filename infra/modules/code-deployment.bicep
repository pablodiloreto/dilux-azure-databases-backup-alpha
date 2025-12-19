// ============================================================================
// Code Deployment Module
// ============================================================================
// Downloads and deploys application code from GitHub Release:
// - Frontend to Static Web App
// - Python functions to Function Apps
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
// Deployment Script
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
    timeout: 'PT30M' // 30 minutes timeout
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
      echo "Version: $VERSION"
      echo "=========================================="

      # Install dependencies
      echo "Installing dependencies..."
      apk add --no-cache nodejs npm python3 py3-pip zip unzip curl

      # Download release from GitHub (use ZIP to avoid symlink issues)
      echo "Downloading release $VERSION from GitHub..."
      DOWNLOAD_URL="https://github.com/$GITHUB_REPO/archive/refs/tags/$VERSION.zip"
      curl -L -o release.zip "$DOWNLOAD_URL"

      # Extract
      echo "Extracting..."
      unzip -q release.zip
      REPO_NAME=$(echo $GITHUB_REPO | cut -d'/' -f2)
      cd "${REPO_NAME}-${VERSION#v}"

      # Fix symlinks - copy shared folder to each function directory
      echo "Setting up shared code..."
      rm -rf src/functions/api/shared 2>/dev/null || true
      rm -rf src/functions/scheduler/shared 2>/dev/null || true
      rm -rf src/functions/processor/shared 2>/dev/null || true
      cp -r src/shared src/functions/api/shared
      cp -r src/shared src/functions/scheduler/shared
      cp -r src/shared src/functions/processor/shared

      echo "=========================================="
      echo "Building Frontend..."
      echo "=========================================="
      cd src/frontend
      npm ci
      npm run build
      cd ../..

      echo "=========================================="
      echo "Deploying Frontend to Static Web App..."
      echo "=========================================="
      # Get deployment token
      SWA_TOKEN=$(az staticwebapp secrets list --name $STATIC_WEB_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.apiKey" -o tsv)

      # Install SWA CLI and deploy
      npm install -g @azure/static-web-apps-cli
      cd src/frontend
      swa deploy ./dist --deployment-token $SWA_TOKEN --env production
      cd ../..

      echo "=========================================="
      echo "Deploying API Function App..."
      echo "=========================================="
      cd src/functions/api
      # Create deployment package
      pip install --target=".python_packages/lib/site-packages" -r requirements.txt
      zip -r ../../../api.zip . -x "*.pyc" -x "__pycache__/*" -x ".venv/*" -x "local.settings.json"
      cd ../../..
      az functionapp deployment source config-zip \
        --resource-group $RESOURCE_GROUP \
        --name $API_FUNCTION_APP_NAME \
        --src api.zip

      echo "=========================================="
      echo "Deploying Scheduler Function App..."
      echo "=========================================="
      cd src/functions/scheduler
      pip install --target=".python_packages/lib/site-packages" -r requirements.txt
      zip -r ../../../scheduler.zip . -x "*.pyc" -x "__pycache__/*" -x ".venv/*" -x "local.settings.json"
      cd ../../..
      az functionapp deployment source config-zip \
        --resource-group $RESOURCE_GROUP \
        --name $SCHEDULER_FUNCTION_APP_NAME \
        --src scheduler.zip

      echo "=========================================="
      echo "Deploying Processor Function App..."
      echo "=========================================="
      cd src/functions/processor
      pip install --target=".python_packages/lib/site-packages" -r requirements.txt
      zip -r ../../../processor.zip . -x "*.pyc" -x "__pycache__/*" -x ".venv/*" -x "local.settings.json"
      cd ../../..
      az functionapp deployment source config-zip \
        --resource-group $RESOURCE_GROUP \
        --name $PROCESSOR_FUNCTION_APP_NAME \
        --src processor.zip

      echo "=========================================="
      echo "Deployment Complete!"
      echo "=========================================="

      # Output results
      echo "{\"status\": \"success\", \"version\": \"$VERSION\"}" > $AZ_SCRIPTS_OUTPUT_PATH
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
