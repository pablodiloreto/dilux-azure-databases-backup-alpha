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

@description('SKU for the App Service Plan.')
@allowed(['Y1', 'EP1', 'EP2', 'EP3'])
param functionAppSku string = 'Y1'

@description('Enable Application Insights.')
param enableAppInsights bool = true

@description('Version to deploy ("latest" for most recent release, or specific tag like "v1.0.0")')
param appVersion string = 'latest'

@description('Skip App Registration creation (for manual setup)')
param skipAppRegistration bool = false

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

// App Service Plan (shared by all Function Apps)
module appServicePlan 'modules/appserviceplan.bicep' = {
  name: 'appserviceplan-deployment'
  params: {
    planName: appServicePlanName
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

// Get client ID from App Registration or use empty string if skipped
var clientId = skipAppRegistration ? '' : (appRegistration.outputs.success ? appRegistration.outputs.clientId : '')

// Function App: API
module functionAppApi 'modules/functionapp.bicep' = {
  name: 'functionapp-api-deployment'
  dependsOn: skipAppRegistration ? [] : [appRegistration]
  params: {
    functionAppName: functionAppApiName
    location: location
    tags: tags
    appServicePlanId: appServicePlan.outputs.planId
    sku: functionAppSku
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
  dependsOn: skipAppRegistration ? [] : [appRegistration]
  params: {
    functionAppName: functionAppSchedulerName
    location: location
    tags: tags
    appServicePlanId: appServicePlan.outputs.planId
    sku: functionAppSku
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
  dependsOn: skipAppRegistration ? [] : [appRegistration]
  params: {
    functionAppName: functionAppProcessorName
    location: location
    tags: tags
    appServicePlanId: appServicePlan.outputs.planId
    sku: functionAppSku
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
// Step 5: RBAC for Function Apps (Resilient - won't fail on re-deploy)
// ============================================================================

// Role definition IDs
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

// All role assignments in one resilient module
module rbacAssignments 'modules/rbac-resilient.bicep' = {
  name: 'rbac-all-assignments'
  dependsOn: [
    functionAppApi
    functionAppScheduler
    functionAppProcessor
    rbacDeploymentContributor  // Ensure Contributor role is assigned before this script runs
  ]
  params: {
    location: location
    tags: tags
    identityId: deploymentIdentity.outputs.identityId
    resourceGroupName: resourceGroup().name
    roleAssignments: [
      // NOTE: Deployment Identity Contributor role is now assigned via native Bicep
      // (see rbac-contributor.bicep) to ensure it exists BEFORE any scripts run

      // API Function App - Key Vault
      {
        principalId: functionAppApi.outputs.principalId
        scope: keyVault.outputs.keyVaultId
        roleId: keyVaultSecretsUserRoleId
        description: 'API - Key Vault Secrets User'
      }
      // API Function App - Storage
      {
        principalId: functionAppApi.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageBlobDataContributorRoleId
        description: 'API - Storage Blob Contributor'
      }
      {
        principalId: functionAppApi.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageQueueDataContributorRoleId
        description: 'API - Storage Queue Contributor'
      }
      {
        principalId: functionAppApi.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageTableDataContributorRoleId
        description: 'API - Storage Table Contributor'
      }
      // Scheduler Function App - Key Vault
      {
        principalId: functionAppScheduler.outputs.principalId
        scope: keyVault.outputs.keyVaultId
        roleId: keyVaultSecretsUserRoleId
        description: 'Scheduler - Key Vault Secrets User'
      }
      // Scheduler Function App - Storage
      {
        principalId: functionAppScheduler.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageBlobDataContributorRoleId
        description: 'Scheduler - Storage Blob Contributor'
      }
      {
        principalId: functionAppScheduler.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageQueueDataContributorRoleId
        description: 'Scheduler - Storage Queue Contributor'
      }
      {
        principalId: functionAppScheduler.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageTableDataContributorRoleId
        description: 'Scheduler - Storage Table Contributor'
      }
      // Processor Function App - Key Vault
      {
        principalId: functionAppProcessor.outputs.principalId
        scope: keyVault.outputs.keyVaultId
        roleId: keyVaultSecretsUserRoleId
        description: 'Processor - Key Vault Secrets User'
      }
      // Processor Function App - Storage
      {
        principalId: functionAppProcessor.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageBlobDataContributorRoleId
        description: 'Processor - Storage Blob Contributor'
      }
      {
        principalId: functionAppProcessor.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageQueueDataContributorRoleId
        description: 'Processor - Storage Queue Contributor'
      }
      {
        principalId: functionAppProcessor.outputs.principalId
        scope: storage.outputs.storageAccountId
        roleId: storageTableDataContributorRoleId
        description: 'Processor - Storage Table Contributor'
      }
    ]
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
    apiBaseUrl: 'https://${functionAppApiName}.azurewebsites.net'
    azureAdTenantId: tenantId
    azureAdClientId: clientId
    storageAccountName: storage.outputs.storageAccountName
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
output nextSteps string = (skipAppRegistration || !appRegistration.outputs.success) ? 'App Registration requires manual setup. Check deployment logs for instructions.' : 'Deployment complete! Check deployment logs for frontend URL.'

@description('Code deployment status')
output codeDeploymentStatus string = codeDeployment.outputs.status
