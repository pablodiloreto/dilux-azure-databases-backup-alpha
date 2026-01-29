// ============================================================================
// Dilux Database Backup - Main Deployment Template
// ============================================================================
// This template deploys all resources needed for the Dilux Database Backup solution.
//
// Usage via Azure CLI:
//   az deployment group create \
//     --resource-group <rg-name> \
//     --template-file main.bicep \
//     --parameters appName=diluxbackup adminEmail=admin@example.com
//
// Usage via GitHub Actions: See .github/workflows/deploy.yml
// ============================================================================

@description('Base name for all resources. Must be unique.')
@minLength(3)
@maxLength(20)
param appName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Email of the first admin user.')
param adminEmail string

@description('''
SKU for the Function Apps hosting plan.

Available options:
- FC1: Flex Consumption (RECOMMENDED) - Serverless, VNet integration, fast cold starts, ~$0-10/month
- Y1:  Consumption (Legacy) - Serverless, NO VNet support, EOL September 2028, ~$0-5/month
- EP1: Premium - Reserved instances, VNet support, no cold starts, ~$150/month
- EP2: Premium - Higher performance, VNet support, ~$300/month
- EP3: Premium - Maximum performance, VNet support, ~$600/month

IMPORTANT: If you need to connect to databases in Azure Virtual Networks (Private Endpoints),
you MUST use FC1 (Flex Consumption) or EP1/EP2/EP3 (Premium). Y1 does NOT support VNet integration.
''')
@allowed(['FC1', 'Y1', 'EP1', 'EP2', 'EP3'])
param functionAppSku string = 'FC1'

@description('Enable Application Insights.')
param enableAppInsights bool = true

@description('Version to deploy ("latest" for most recent release, or specific tag like "v1.0.0")')
param appVersion string = 'latest'

@description('Skip App Registration creation (for manual setup)')
param skipAppRegistration bool = false

@description('Existing Azure AD Client ID (if provided, skips App Registration creation)')
param azureAdClientId string = ''

// ============================================================================
// Variables
// ============================================================================

var uniqueSuffix = uniqueString(resourceGroup().id, appName)
var shortSuffix = take(uniqueSuffix, 6)

// Storage and Key Vault (globally unique)
var storageAccountName = toLower('${take(appName, 10)}st${uniqueSuffix}')
var keyVaultName = '${appName}-kv-${take(uniqueSuffix, 8)}'

// Function Apps (globally unique - need suffix)
var functionAppApiName = '${appName}-${shortSuffix}-api'
var functionAppSchedulerName = '${appName}-${shortSuffix}-scheduler'
var functionAppProcessorName = '${appName}-${shortSuffix}-processor'

// These are resource-group scoped (don't need unique suffix)
var appInsightsName = '${appName}-insights'
var appServicePlanName = '${appName}-plan'
var deploymentIdentityName = '${appName}-deploy-identity'

// Generate installation ID (unique per deployment)
var installationId = uniqueSuffix
var tenantId = subscription().tenantId

// Tags applied to all resources
var tags = {
  Application: 'Dilux Database Backup'
  Environment: 'Production'
  ManagedBy: 'Bicep'
  Version: appVersion
}

// ============================================================================
// Step 1: Core Infrastructure (no dependencies)
// ============================================================================

// Storage Account (Blobs, Queues, Tables)
module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    storageAccountName: storageAccountName
    location: location
    tags: tags
  }
}

// Key Vault for secrets
module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault-deployment'
  params: {
    keyVaultName: keyVaultName
    location: location
    tags: tags
    tenantId: tenantId
  }
}

// Application Insights (optional)
module appInsights 'modules/appinsights.bicep' = if (enableAppInsights) {
  name: 'appinsights-deployment'
  params: {
    appInsightsName: appInsightsName
    location: location
    tags: tags
  }
}

// Determine if Flex Consumption (requires separate plan per Function App)
var isFlexConsumption = functionAppSku == 'FC1'

// App Service Plan - shared for Y1/EP* or separate for FC1
// For Flex Consumption: one plan per Function App (Azure limitation)
// For other SKUs: one shared plan

module appServicePlanApi 'modules/appserviceplan.bicep' = {
  name: 'appserviceplan-api-deployment'
  params: {
    planName: isFlexConsumption ? '${appServicePlanName}-api' : appServicePlanName
    location: location
    tags: tags
    sku: functionAppSku
  }
}

module appServicePlanScheduler 'modules/appserviceplan.bicep' = if (isFlexConsumption) {
  name: 'appserviceplan-scheduler-deployment'
  params: {
    planName: '${appServicePlanName}-scheduler'
    location: location
    tags: tags
    sku: functionAppSku
  }
}

module appServicePlanProcessor 'modules/appserviceplan.bicep' = if (isFlexConsumption) {
  name: 'appserviceplan-processor-deployment'
  params: {
    planName: '${appServicePlanName}-processor'
    location: location
    tags: tags
    sku: functionAppSku
  }
}

// User Assigned Managed Identity for deployment scripts
module deploymentIdentity 'modules/identity.bicep' = {
  name: 'deployment-identity'
  params: {
    identityName: deploymentIdentityName
    location: location
    tags: tags
  }
}

// Contributor role for deployment identity (MUST be native Bicep, not script)
// This ensures the identity has permissions BEFORE any deployment scripts run
module rbacDeploymentContributor 'modules/rbac-contributor.bicep' = {
  name: 'rbac-deployment-contributor'
  params: {
    principalId: deploymentIdentity.outputs.principalId
  }
}

// ============================================================================
// Step 2: RBAC for Deployment Identity
// ============================================================================

// Give deployment identity Key Vault Secrets Officer role
module rbacDeploymentKeyVault 'modules/rbac-keyvault-officer.bicep' = {
  name: 'rbac-deployment-keyvault'
  params: {
    keyVaultName: keyVault.outputs.keyVaultName
    principalId: deploymentIdentity.outputs.principalId
  }
}

// ============================================================================
// Step 3: App Registration (via Deployment Script)
// ============================================================================

module appRegistration 'modules/appregistration.bicep' = if (!skipAppRegistration) {
  name: 'appregistration-deployment'
  dependsOn: [
    rbacDeploymentKeyVault
    rbacDeploymentContributor
  ]
  params: {
    appName: appName
    location: location
    tags: tags
    storageAccountName: storage.outputs.storageAccountName
    apiFunctionAppHostname: '${functionAppApiName}.azurewebsites.net'
    keyVaultName: keyVault.outputs.keyVaultName
    managedIdentityId: deploymentIdentity.outputs.identityId
  }
}

// ============================================================================
// Step 4: Function Apps (depend on App Registration)
// ============================================================================

// Get client ID: use provided azureAdClientId, or from App Registration, or empty if skipped
var clientId = !empty(azureAdClientId) ? azureAdClientId : (skipAppRegistration ? '' : (appRegistration.outputs.success ? appRegistration.outputs.clientId : ''))

// Function App: API
module functionAppApi 'modules/functionapp.bicep' = {
  name: 'functionapp-api-deployment'
  dependsOn: (skipAppRegistration || !empty(azureAdClientId)) ? [] : [appRegistration]
  params: {
    functionAppName: functionAppApiName
    location: location
    tags: tags
    appServicePlanId: appServicePlanApi.outputs.planId
    sku: functionAppSku
    isFlexConsumption: isFlexConsumption
    storageAccountName: storage.outputs.storageAccountName
    storageConnectionString: storage.outputs.connectionString
    storageBlobEndpoint: storage.outputs.blobEndpoint
    storageQueueEndpoint: storage.outputs.queueEndpoint
    storageTableEndpoint: storage.outputs.tableEndpoint
    appInsightsConnectionString: enableAppInsights ? appInsights.outputs.connectionString : ''
    appInsightsInstrumentationKey: enableAppInsights ? appInsights.outputs.instrumentationKey : ''
    keyVaultName: keyVault.outputs.keyVaultName
    additionalAppSettings: {
      FUNCTION_APP_TYPE: 'api'
      ADMIN_EMAIL: adminEmail
      APP_VERSION: appVersion
      INSTALLATION_ID: installationId
      AZURE_AD_TENANT_ID: tenantId
      AZURE_AD_CLIENT_ID: clientId
      AUTH_MODE: empty(clientId) ? 'mock' : 'azure'
    }
  }
}

// Function App: Scheduler
module functionAppScheduler 'modules/functionapp.bicep' = {
  name: 'functionapp-scheduler-deployment'
  dependsOn: (skipAppRegistration || !empty(azureAdClientId)) ? [] : [appRegistration]
  params: {
    functionAppName: functionAppSchedulerName
    location: location
    tags: tags
    appServicePlanId: isFlexConsumption ? appServicePlanScheduler.outputs.planId : appServicePlanApi.outputs.planId
    sku: functionAppSku
    isFlexConsumption: isFlexConsumption
    storageAccountName: storage.outputs.storageAccountName
    storageConnectionString: storage.outputs.connectionString
    storageBlobEndpoint: storage.outputs.blobEndpoint
    storageQueueEndpoint: storage.outputs.queueEndpoint
    storageTableEndpoint: storage.outputs.tableEndpoint
    appInsightsConnectionString: enableAppInsights ? appInsights.outputs.connectionString : ''
    appInsightsInstrumentationKey: enableAppInsights ? appInsights.outputs.instrumentationKey : ''
    keyVaultName: keyVault.outputs.keyVaultName
    additionalAppSettings: {
      FUNCTION_APP_TYPE: 'scheduler'
      APP_VERSION: appVersion
      INSTALLATION_ID: installationId
      AUTH_MODE: empty(clientId) ? 'mock' : 'azure'
    }
  }
}

// Function App: Processor
module functionAppProcessor 'modules/functionapp.bicep' = {
  name: 'functionapp-processor-deployment'
  dependsOn: (skipAppRegistration || !empty(azureAdClientId)) ? [] : [appRegistration]
  params: {
    functionAppName: functionAppProcessorName
    location: location
    tags: tags
    appServicePlanId: isFlexConsumption ? appServicePlanProcessor.outputs.planId : appServicePlanApi.outputs.planId
    sku: functionAppSku
    isFlexConsumption: isFlexConsumption
    storageAccountName: storage.outputs.storageAccountName
    storageConnectionString: storage.outputs.connectionString
    storageBlobEndpoint: storage.outputs.blobEndpoint
    storageQueueEndpoint: storage.outputs.queueEndpoint
    storageTableEndpoint: storage.outputs.tableEndpoint
    appInsightsConnectionString: enableAppInsights ? appInsights.outputs.connectionString : ''
    appInsightsInstrumentationKey: enableAppInsights ? appInsights.outputs.instrumentationKey : ''
    keyVaultName: keyVault.outputs.keyVaultName
    additionalAppSettings: {
      FUNCTION_APP_TYPE: 'processor'
      APP_VERSION: appVersion
      INSTALLATION_ID: installationId
      AUTH_MODE: empty(clientId) ? 'mock' : 'azure'
    }
  }
}

// ============================================================================
// Step 5: RBAC for Function Apps (Native Bicep - uses deployer's permissions)
// ============================================================================

// Role assignments using native Bicep (not deployment scripts)
// This uses the deploying user's permissions to create role assignments
module rbacAssignments 'modules/rbac-native.bicep' = {
  name: 'rbac-all-assignments'
  params: {
    storageAccountId: storage.outputs.storageAccountId
    keyVaultId: keyVault.outputs.keyVaultId
    apiPrincipalId: functionAppApi.outputs.principalId
    schedulerPrincipalId: functionAppScheduler.outputs.principalId
    processorPrincipalId: functionAppProcessor.outputs.principalId
  }
}

// ============================================================================
// Step 6: Code Deployment
// ============================================================================
// Deploy application code from GitHub Release
// Frontend is deployed to Blob Storage Static Website

// Deploy application code
module codeDeployment 'modules/code-deployment.bicep' = {
  name: 'code-deployment'
  dependsOn: [
    functionAppApi
    functionAppScheduler
    functionAppProcessor
    rbacAssignments
    rbacDeploymentContributor  // Ensure Contributor role exists before deployment
  ]
  params: {
    location: location
    tags: tags
    identityId: deploymentIdentity.outputs.identityId
    version: appVersion
    apiFunctionAppName: functionAppApiName
    schedulerFunctionAppName: functionAppSchedulerName
    processorFunctionAppName: functionAppProcessorName
    resourceGroupName: resourceGroup().name
    apiBaseUrl: 'https://${functionAppApiName}.azurewebsites.net/api'
    azureAdTenantId: tenantId
    azureAdClientId: clientId
    storageAccountName: storage.outputs.storageAccountName
    storageBlobEndpoint: storage.outputs.blobEndpoint
    isFlexConsumption: isFlexConsumption
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('URL of the API Function App')
output apiUrl string = 'https://${functionAppApiName}.azurewebsites.net'

@description('URL of the Frontend (Blob Storage Static Website - check deployment logs for exact URL)')
output frontendUrl string = 'See deployment logs for frontend URL (Blob Storage Static Website)'

@description('Storage Account name')
output storageAccountName string = storage.outputs.storageAccountName

@description('Key Vault name')
output keyVaultName string = keyVault.outputs.keyVaultName

@description('Application Insights name')
output appInsightsName string = enableAppInsights ? appInsights.outputs.appInsightsName : 'Not deployed'

@description('Installation ID (unique identifier for this deployment)')
output installationId string = installationId

@description('Application version')
output appVersion string = appVersion

@description('Admin email configured')
output adminEmail string = adminEmail

@description('Azure AD Client ID (empty if manual setup required)')
output azureAdClientId string = clientId

@description('Azure AD Tenant ID')
output azureAdTenantId string = tenantId

@description('App Registration created successfully')
output appRegistrationSuccess bool = skipAppRegistration ? false : appRegistration.outputs.success

@description('Next steps message')
output nextSteps string = (skipAppRegistration || !appRegistration.outputs.success) ? 'Auth not configured. Run: curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-auth.sh | bash' : 'Deployment complete! Frontend URL in outputs.'

@description('Code deployment status')
output codeDeploymentStatus string = codeDeployment.outputs.status
