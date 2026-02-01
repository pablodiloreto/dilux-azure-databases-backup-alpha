// ============================================================================
// Function App Module
// ============================================================================
// Creates an Azure Function App with:
// - Docker container with database tools (mysqldump, pg_dump, sqlcmd)
// - System-assigned Managed Identity
// - Support for FC1 (Flex Consumption) and EP1/EP2/EP3 (Premium)
// ============================================================================

@description('Name of the Function App')
param functionAppName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('App Service Plan resource ID')
param appServicePlanId string

@description('App Service Plan SKU (FC1, EP1, EP2, EP3)')
@allowed(['FC1', 'EP1', 'EP2', 'EP3'])
param sku string

@description('Is Flex Consumption plan')
param isFlexConsumption bool = false

@description('Maximum instance count for Flex Consumption')
param maximumInstanceCount int = 100

@description('Instance memory in MB for Flex Consumption (2048 or 4096)')
@allowed([2048, 4096])
param instanceMemoryMB int = 2048

@description('Storage Account name')
param storageAccountName string

@description('Storage Account blob endpoint')
param storageBlobEndpoint string

@description('Storage Account queue endpoint')
param storageQueueEndpoint string

@description('Storage Account table endpoint')
param storageTableEndpoint string

@description('Application Insights connection string')
param appInsightsConnectionString string = ''

@description('Application Insights instrumentation key')
param appInsightsInstrumentationKey string = ''

@description('Key Vault name')
param keyVaultName string

@description('Additional app settings')
param additionalAppSettings object = {}

@description('Frontend URL for CORS (specific origin required for credentials)')
param frontendUrl string = ''

@description('Function App type (api, scheduler, processor)')
@allowed(['api', 'scheduler', 'processor'])
param functionAppType string = 'api'

@description('Docker image URL (e.g., ghcr.io/owner/image:tag)')
param dockerImageUrl string

// ============================================================================
// Variables
// ============================================================================

// CORS allowed origins - include specific frontend URL if provided
var corsOrigins = empty(frontendUrl) ? [
  'https://portal.azure.com'
  'http://localhost:3000'
  'http://localhost:5173'
] : [
  'https://portal.azure.com'
  'http://localhost:3000'
  'http://localhost:5173'
  frontendUrl
]

// Storage settings for Flex Consumption (FC1) - uses Managed Identity
var flexConsumptionStorageSettings = {
  AzureWebJobsStorage__accountName: storageAccountName
}

// Storage settings for Premium plan (EP1/EP2/EP3) - uses Managed Identity
var premiumStorageSettings = {
  AzureWebJobsStorage__accountName: storageAccountName
  AzureWebJobsStorage__blobServiceUri: storageBlobEndpoint
  AzureWebJobsStorage__queueServiceUri: storageQueueEndpoint
  AzureWebJobsStorage__tableServiceUri: storageTableEndpoint
}

// Select storage settings based on plan
var runtimeStorageSettings = isFlexConsumption ? flexConsumptionStorageSettings : premiumStorageSettings

// Runtime settings for Docker
var runtimeSettings = {
  FUNCTIONS_EXTENSION_VERSION: '~4'
  FUNCTIONS_WORKER_RUNTIME: 'python'
  // Docker configuration
  DOCKER_REGISTRY_SERVER_URL: 'https://ghcr.io'
  WEBSITES_ENABLE_APP_SERVICE_STORAGE: 'false'
}

// Base app settings (common to all plans)
var baseAppSettings = {
  // App settings for our code (always uses Managed Identity via DefaultAzureCredential)
  STORAGE_ACCOUNT_NAME: storageAccountName
  STORAGE_BLOB_ENDPOINT: storageBlobEndpoint
  STORAGE_QUEUE_ENDPOINT: storageQueueEndpoint
  STORAGE_TABLE_ENDPOINT: storageTableEndpoint

  // Key Vault (also uses Managed Identity)
  KEY_VAULT_NAME: keyVaultName

  // Environment marker
  ENVIRONMENT: 'production'
}

// App Insights settings (if enabled)
var appInsightsSettings = !empty(appInsightsConnectionString) ? {
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  APPINSIGHTS_INSTRUMENTATIONKEY: appInsightsInstrumentationKey
} : {}

// Merge all settings
var appSettings = union(runtimeStorageSettings, runtimeSettings, baseAppSettings, appInsightsSettings, additionalAppSettings)

// ============================================================================
// Function App - Standard (EP1, EP2, EP3)
// ============================================================================

resource functionAppStandard 'Microsoft.Web/sites@2023-12-01' = if (!isFlexConsumption) {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    reserved: true // Required for Linux
    siteConfig: {
      linuxFxVersion: 'DOCKER|${dockerImageUrl}'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: corsOrigins
        supportCredentials: true
      }
      appSettings: [for setting in items(appSettings): {
        name: setting.key
        value: string(setting.value)
      }]
    }
  }
}

// ============================================================================
// Function App - Flex Consumption (FC1)
// ============================================================================

resource functionAppFlex 'Microsoft.Web/sites@2024-04-01' = if (isFlexConsumption) {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    reserved: true // Required for Linux
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageBlobEndpoint}deployments-${functionAppType}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
      runtime: {
        name: 'custom'
        version: ''
      }
    }
    siteConfig: {
      linuxFxVersion: 'DOCKER|${dockerImageUrl}'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: corsOrigins
        supportCredentials: true
      }
      appSettings: [for setting in items(appSettings): {
        name: setting.key
        value: string(setting.value)
      }]
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Function App name')
output functionAppName string = isFlexConsumption ? functionAppFlex.name : functionAppStandard.name

@description('Function App default hostname')
output defaultHostname string = isFlexConsumption ? functionAppFlex.properties.defaultHostName : functionAppStandard.properties.defaultHostName

@description('Function App principal ID (Managed Identity)')
output principalId string = isFlexConsumption ? functionAppFlex.identity.principalId : functionAppStandard.identity.principalId

@description('Function App resource ID')
output resourceId string = isFlexConsumption ? functionAppFlex.id : functionAppStandard.id

@description('Is using Flex Consumption plan (FC1)')
output isFlexConsumptionPlan bool = isFlexConsumption
