// ============================================================================
// RBAC - Contributor Role Assignment (Native Bicep)
// ============================================================================
// Assigns Contributor role to a principal on the resource group.
// Uses native Bicep role assignment (not deployment script).
// This ensures the role is assigned BEFORE any scripts run.
// ============================================================================

@description('Principal ID to assign the role to')
param principalId string

@description('Principal type (ServicePrincipal, User, Group)')
param principalType string = 'ServicePrincipal'

// Contributor role definition ID
var contributorRoleId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

// Create role assignment at resource group scope
resource contributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, principalId, contributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', contributorRoleId)
    principalId: principalId
    principalType: principalType
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Role assignment ID')
output roleAssignmentId string = contributorRoleAssignment.id
