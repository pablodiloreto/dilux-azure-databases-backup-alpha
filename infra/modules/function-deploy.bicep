// ============================================================================
// Function App OneDeploy Module
// ============================================================================
// Deploys code to a Function App using OneDeploy extension.
// This is the ONLY supported deployment method for Flex Consumption (FC1).
//
// Azure CLI's `az functionapp deployment source config-zip` uses Zip Deploy,
// which is NOT OneDeploy. Zip Deploy automatically sets SCM_DO_BUILD_DURING_DEPLOYMENT
// which FC1 rejects.
//
// OneDeploy is a native Bicep extension that handles remote build correctly.
// ============================================================================

@description('Function App name')
param functionAppName string

@description('Package URI (blob URL with SAS token or accessible via managed identity)')
param packageUri string

@description('Enable remote build (required for Python)')
param remoteBuild bool = true

// Reference to existing Function App
resource functionApp 'Microsoft.Web/sites@2023-01-01' existing = {
  name: functionAppName
}

// OneDeploy extension - the only supported method for Flex Consumption
resource oneDeploy 'Microsoft.Web/sites/extensions@2022-09-01' = {
  parent: functionApp
  name: 'onedeploy'
  properties: {
    packageUri: packageUri
    remoteBuild: remoteBuild
  }
}

output deploymentStatus string = 'OneDeploy initiated for ${functionAppName}'
