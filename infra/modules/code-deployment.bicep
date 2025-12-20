// ============================================================================
// Code Deployment Module (Optimized)
// ============================================================================
// Downloads PRE-BUILT release assets from GitHub and deploys them:
// - frontend.zip → Static Web App
// - api.zip → API Function App
// - scheduler.zip → Scheduler Function App
// - processor.zip → Processor Function App
//
// IMPORTANT: This requires the release to have pre-built assets.
// Run the "Build Release Assets" GitHub Action before deploying.
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
// Deployment Script - Downloads and deploys pre-built assets
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
    timeout: 'PT15M' // 15 minutes should be more than enough now
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
        RESOLVED_VERSION=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')

        if [ -z "$RESOLVED_VERSION" ] || [ "$RESOLVED_VERSION" == "null" ]; then
          echo "❌ ERROR: Could not resolve latest release"
          echo "Make sure the repository has at least one published release."
          echo "{\"status\": \"failed\", \"error\": \"No releases found\"}" > $AZ_SCRIPTS_OUTPUT_PATH
          exit 1
        fi

        echo "✅ Resolved 'latest' to: $RESOLVED_VERSION"
        VERSION=$RESOLVED_VERSION
      fi

      echo "Version: $VERSION"
      echo "=========================================="

      # Base URL for release assets
      RELEASE_URL="https://github.com/$GITHUB_REPO/releases/download/$VERSION"

      echo ""
      echo "Downloading pre-built release assets..."
      echo "From: $RELEASE_URL"
      echo ""

      # Download all pre-built ZIPs
      echo "📦 Downloading frontend.zip..."
      curl -L -f -o frontend.zip "$RELEASE_URL/frontend.zip" || {
        echo "❌ ERROR: Could not download frontend.zip"
        echo ""
        echo "Make sure the release $VERSION has pre-built assets."
        echo "Run the 'Build Release Assets' GitHub Action first."
        echo ""
        echo "{\"status\": \"failed\", \"error\": \"Release assets not found\"}" > $AZ_SCRIPTS_OUTPUT_PATH
        exit 1
      }

      echo "📦 Downloading api.zip..."
      curl -L -f -o api.zip "$RELEASE_URL/api.zip"

      echo "📦 Downloading scheduler.zip..."
      curl -L -f -o scheduler.zip "$RELEASE_URL/scheduler.zip"

      echo "📦 Downloading processor.zip..."
      curl -L -f -o processor.zip "$RELEASE_URL/processor.zip"

      echo ""
      echo "✅ All assets downloaded"
      ls -lh *.zip
      echo ""

      # ========================================
      # Deploy Frontend to Static Web App
      # ========================================
      echo "=========================================="
      echo "Deploying Frontend to Static Web App..."
      echo "=========================================="

      # Get deployment token
      SWA_TOKEN=$(az staticwebapp secrets list \
        --name $STATIC_WEB_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --query "properties.apiKey" -o tsv)

      # Install SWA CLI
      apk add --no-cache nodejs npm > /dev/null 2>&1
      npm install -g @azure/static-web-apps-cli > /dev/null 2>&1

      # Extract and deploy frontend
      mkdir -p frontend-dist
      unzip -q frontend.zip -d frontend-dist
      cd frontend-dist
      swa deploy . --deployment-token $SWA_TOKEN --env production
      cd ..

      echo "✅ Frontend deployed"

      # ========================================
      # Deploy Function Apps
      # ========================================
      echo ""
      echo "=========================================="
      echo "Deploying API Function App..."
      echo "=========================================="
      az functionapp deployment source config-zip \
        --resource-group $RESOURCE_GROUP \
        --name $API_FUNCTION_APP_NAME \
        --src api.zip
      echo "✅ API deployed"

      echo ""
      echo "=========================================="
      echo "Deploying Scheduler Function App..."
      echo "=========================================="
      az functionapp deployment source config-zip \
        --resource-group $RESOURCE_GROUP \
        --name $SCHEDULER_FUNCTION_APP_NAME \
        --src scheduler.zip
      echo "✅ Scheduler deployed"

      echo ""
      echo "=========================================="
      echo "Deploying Processor Function App..."
      echo "=========================================="
      az functionapp deployment source config-zip \
        --resource-group $RESOURCE_GROUP \
        --name $PROCESSOR_FUNCTION_APP_NAME \
        --src processor.zip
      echo "✅ Processor deployed"

      echo ""
      echo "=========================================="
      echo "🎉 Deployment Complete!"
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
