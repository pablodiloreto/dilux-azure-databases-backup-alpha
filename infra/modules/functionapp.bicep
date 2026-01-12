// ============================================================================
// Function App Module
// ============================================================================
// Creates an Azure Function App with:
// - Python 3.10 runtime
// - System-assigned Managed Identity
// - Conditional auth based on SKU:
//   - Y1 (Consumption): Connection String for runtime
//   - EP1/EP2/EP3 (Premium): Managed Identity for runtime
// ============================================================================

@description('Name of the Function App')
param functionAppName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('App Service Plan resource ID')
param appServicePlanId string

@description('App Service Plan SKU (Y1, EP1, EP2, EP3)')
param sku string

@description('Storage Account name')
param storageAccountName string

@description('Storage Account connection string (for Y1/Consumption plan)')
@secure()
param storageConnectionString string

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

// ============================================================================
// Variables
// ============================================================================

// Determine if using Consumption plan (requires connection string)
var isConsumptionPlan = sku == 'Y1'

// Storage settings for Consumption plan (Y1) - uses connection string
var consumptionStorageSettings = {
  AzureWebJobsStorage: storageConnectionString
  WEBSITE_CONTENTAZUREFILECONNECTIONSTRING: storageConnectionString
  WEBSITE_CONTENTSHARE: toLower(functionAppName)
}

// Storage settings for Premium plan (EP1/EP2/EP3) - uses Managed Identity
var premiumStorageSettings = {
  AzureWebJobsStorage__accountName: storageAccountName
  AzureWebJobsStorage__blobServiceUri: storageBlobEndpoint
  AzureWebJobsStorage__queueServiceUri: storageQueueEndpoint
  AzureWebJobsStorage__tableServiceUri: storageTableEndpoint
}

// Select storage settings based on plan
var runtimeStorageSettings = isConsumptionPlan ? consumptionStorageSettings : premiumStorageSettings

// Base app settings (common to all plans)
var baseAppSettings = {
  // Functions runtime settings
  FUNCTIONS_EXTENSION_VERSION: '~4'
  FUNCTIONS_WORKER_RUNTIME: 'python'

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
var appSettings = union(runtimeStorageSettings, baseAppSettings, appInsightsSettings, additionalAppSettings)

// ============================================================================
// Function App
// ============================================================================

resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    reserved: true // Required for Linux
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.10'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
          'https://*.web.core.windows.net'  // Azure Blob Storage Static Website
          'http://localhost:3000'
          'http://localhost:5173'
        ]
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
output functionAppName string = functionApp.name

@description('Function App default hostname')
output defaultHostname string = functionApp.properties.defaultHostName

@description('Function App principal ID (Managed Identity)')
output principalId string = functionApp.identity.principalId

@description('Function App resource ID')
output resourceId string = functionApp.id

@description('Is using Consumption plan')
output isConsumptionPlan bool = isConsumptionPlan
