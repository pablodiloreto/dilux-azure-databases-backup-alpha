// ============================================================================
// App Service Plan Module
// ============================================================================
// Creates an App Service Plan for hosting Function Apps.
// Supports Consumption (Y1) and Premium (EP1-EP3) SKUs.
// ============================================================================

@description('Name of the App Service Plan')
param planName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('SKU for the plan')
@allowed(['Y1', 'EP1', 'EP2', 'EP3'])
param sku string = 'Y1'

// ============================================================================
// SKU Configuration
// ============================================================================

var skuConfig = {
  Y1: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  EP1: {
    name: 'EP1'
    tier: 'ElasticPremium'
  }
  EP2: {
    name: 'EP2'
    tier: 'ElasticPremium'
  }
  EP3: {
    name: 'EP3'
    tier: 'ElasticPremium'
  }
}

// ============================================================================
// App Service Plan
// ============================================================================

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: skuConfig[sku].name
    tier: skuConfig[sku].tier
  }
  properties: {
    reserved: true // Linux
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('App Service Plan resource ID')
output planId string = appServicePlan.id

@description('App Service Plan name')
output planName string = appServicePlan.name
