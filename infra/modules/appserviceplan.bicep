// ============================================================================
// App Service Plan Module
// ============================================================================
// Creates an App Service Plan for hosting Function Apps.
//
// Supported SKUs:
// - FC1: Flex Consumption (RECOMMENDED) - Serverless, VNet support, fast cold starts
// - Y1:  Consumption (Legacy) - Serverless, NO VNet support, EOL Sept 2028
// - EP1/EP2/EP3: Premium - Reserved instances, VNet support, no cold starts
// ============================================================================

@description('Name of the App Service Plan')
param planName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('SKU for the plan')
@allowed(['FC1', 'Y1', 'EP1', 'EP2', 'EP3'])
param sku string = 'FC1'

// ============================================================================
// SKU Configuration
// ============================================================================

var skuConfig = {
  FC1: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
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

// Flex Consumption doesn't use traditional App Service Plan
var isFlexConsumption = sku == 'FC1'

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

@description('Is Flex Consumption plan')
output isFlexConsumption bool = isFlexConsumption

@description('SKU tier')
output skuTier string = skuConfig[sku].tier
