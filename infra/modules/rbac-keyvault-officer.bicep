// ============================================================================
// RBAC - Key Vault Secrets Officer Module
// ============================================================================
// Grants a principal (Managed Identity) officer access to Key Vault secrets.
// This allows creating/updating secrets (needed for deployment scripts).
// ============================================================================

@description('Name of the Key Vault')
param keyVaultName string

@description('Principal ID to grant access to')
param principalId string

// ============================================================================
// Role Definitions
// ============================================================================

// Key Vault Secrets Officer - Allows full CRUD on secrets
var keyVaultSecretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

// ============================================================================
// Existing Key Vault Reference
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// ============================================================================
// Role Assignment
// ============================================================================

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, principalId, keyVaultSecretsOfficerRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsOfficerRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Role assignment ID')
output roleAssignmentId string = roleAssignment.id
