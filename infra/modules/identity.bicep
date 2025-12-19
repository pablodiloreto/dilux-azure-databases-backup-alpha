// ============================================================================
// User Assigned Managed Identity Module
// ============================================================================
// Creates a User Assigned Managed Identity for deployment scripts.
// This identity needs permissions to:
// - Create App Registrations in Azure AD
// - Write secrets to Key Vault
// ============================================================================

@description('Name of the managed identity')
param identityName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

// ============================================================================
// Managed Identity
// ============================================================================

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

// ============================================================================
// Outputs
// ============================================================================

@description('Managed Identity resource ID')
output identityId string = managedIdentity.id

@description('Managed Identity principal ID')
output principalId string = managedIdentity.properties.principalId

@description('Managed Identity client ID')
output clientId string = managedIdentity.properties.clientId
