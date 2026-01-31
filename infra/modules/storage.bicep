// ============================================================================
// Storage Account Module
// ============================================================================
// Creates an Azure Storage Account with:
// - Blob containers for backups
// - Queues for backup jobs
// - Tables for configuration and history
// ============================================================================

@description('Name of the storage account')
param storageAccountName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('Is Flex Consumption plan (requires deployment containers)')
param isFlexConsumption bool = false

// ============================================================================
// Storage Account
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true  // Required for Static Website
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Blob Service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

// Blob Container for backups
resource backupsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'backups'
  properties: {
    publicAccess: 'None'
  }
}

// Deployment containers for Flex Consumption (FC1)
// Each Function App needs its own container to avoid deployment conflicts
resource deploymentsApiContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (isFlexConsumption) {
  parent: blobService
  name: 'deployments-api'
  properties: {
    publicAccess: 'None'
  }
}

resource deploymentsSchedulerContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (isFlexConsumption) {
  parent: blobService
  name: 'deployments-scheduler'
  properties: {
    publicAccess: 'None'
  }
}

resource deploymentsProcessorContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (isFlexConsumption) {
  parent: blobService
  name: 'deployments-processor'
  properties: {
    publicAccess: 'None'
  }
}

// Container for Function App packages (used by OneDeploy for FC1)
resource functionPackagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = if (isFlexConsumption) {
  parent: blobService
  name: 'function-packages'
  properties: {
    publicAccess: 'None'
  }
}

// Queue Service
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

// Queue for backup jobs
resource backupJobsQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'backup-jobs'
}

// Table Service
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

// Tables for application data
resource databaseConfigsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'databaseconfigs'
}

resource backupHistoryTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'backuphistory'
}

resource auditLogsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'auditlogs'
}

resource usersTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'users'
}

resource settingsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'settings'
}

resource accessRequestsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'accessrequests'
}

resource backupPoliciesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: 'backuppolicies'
}

// ============================================================================
// Outputs
// ============================================================================

@description('Storage account name')
output storageAccountName string = storageAccount.name

@description('Storage account resource ID')
output storageAccountId string = storageAccount.id

@description('Storage account primary key')
output storageAccountKey string = storageAccount.listKeys().keys[0].value

@description('Storage account connection string')
output connectionString string = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

@description('Blob endpoint')
output blobEndpoint string = storageAccount.properties.primaryEndpoints.blob

@description('Queue endpoint')
output queueEndpoint string = storageAccount.properties.primaryEndpoints.queue

@description('Table endpoint')
output tableEndpoint string = storageAccount.properties.primaryEndpoints.table
