// ============================================================================
// Static Web App Module
// ============================================================================
// Creates an Azure Static Web App for the React frontend.
// ============================================================================

@description('Name of the Static Web App')
param staticWebAppName string

@description('Azure region (Static Web Apps have limited regions)')
param location string

@description('Tags to apply')
param tags object

@description('API base URL for the backend')
param apiBaseUrl string

@description('Azure AD Tenant ID')
param tenantId string

@description('Azure AD Client ID')
param clientId string

// ============================================================================
// Static Web App
// ============================================================================

// Static Web Apps are only available in certain regions
var staticWebAppLocation = contains(['eastus2', 'westus2', 'westeurope', 'eastasia', 'centralus'], location) ? location : 'eastus2'

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: staticWebAppLocation
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      appLocation: 'src/frontend'
      apiLocation: ''
      outputLocation: 'dist'
    }
  }
}

// App Settings for the Static Web App
resource staticWebAppSettings 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    VITE_API_BASE_URL: apiBaseUrl
    VITE_AZURE_AD_TENANT_ID: tenantId
    VITE_AZURE_AD_CLIENT_ID: clientId
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Static Web App name')
output staticWebAppName string = staticWebApp.name

@description('Static Web App default hostname (with https)')
output defaultHostname string = 'https://${staticWebApp.properties.defaultHostname}'

@description('Static Web App default hostname (without protocol, for redirect URIs)')
output defaultHostnameClean string = staticWebApp.properties.defaultHostname

@description('Static Web App resource ID')
output resourceId string = staticWebApp.id

@description('Deployment token (for CI/CD)')
output deploymentToken string = staticWebApp.listSecrets().properties.apiKey
