// ============================================================================
// Key Vault Module
// ============================================================================
// Creates an Azure Key Vault for storing:
// - Database credentials
// - Connection strings
// - Other secrets
// ============================================================================

@description('Name of the Key Vault')
param keyVaultName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('Azure AD Tenant ID')
param tenantId string

// ============================================================================
// Key Vault
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // Note: enablePurgeProtection is not set - defaults to false for new vaults
    // Set to true in production for extra protection against accidental deletion
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Key Vault name')
output keyVaultName string = keyVault.name

@description('Key Vault URI')
output keyVaultUri string = keyVault.properties.vaultUri

@description('Key Vault resource ID')
output keyVaultId string = keyVault.id
