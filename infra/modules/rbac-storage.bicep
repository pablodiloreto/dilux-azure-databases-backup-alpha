// ============================================================================
// RBAC - Storage Account Access Module
// ============================================================================
// Grants a principal (Managed Identity) full access to Storage:
// - Storage Blob Data Contributor (read/write blobs)
// - Storage Queue Data Contributor (read/write queues)
// - Storage Table Data Contributor (read/write tables)
// ============================================================================

@description('Name of the Storage Account')
param storageAccountName string

@description('Principal ID to grant access to')
param principalId string

// ============================================================================
// Role Definitions
// ============================================================================

// Storage Blob Data Contributor - Read, write, delete blobs and containers
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// Storage Queue Data Contributor - Read, write, delete queues and messages
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'

// Storage Table Data Contributor - Read, write, delete tables and entities
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

// ============================================================================
// Existing Storage Account Reference
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// ============================================================================
// Role Assignments
// ============================================================================

resource blobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

resource queueRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageQueueDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

resource tableRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Blob role assignment ID')
output blobRoleAssignmentId string = blobRoleAssignment.id

@description('Queue role assignment ID')
output queueRoleAssignmentId string = queueRoleAssignment.id

@description('Table role assignment ID')
output tableRoleAssignmentId string = tableRoleAssignment.id
