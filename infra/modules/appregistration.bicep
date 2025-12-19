// ============================================================================
// App Registration Module (via Deployment Script)
// ============================================================================
// Creates an Azure AD App Registration for authentication using az cli.
//
// If the deploying user doesn't have permissions to create App Registrations,
// the script will fail gracefully and output instructions for manual setup.
// ============================================================================

@description('Base name for the application')
param appName string

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('Static Web App default hostname (for redirect URI)')
param staticWebAppHostname string

@description('API Function App hostname (for API permissions)')
param apiFunctionAppHostname string

@description('Key Vault name to store the client secret')
param keyVaultName string

@description('Managed Identity ID for the deployment script')
param managedIdentityId string

// ============================================================================
// Deployment Script to create App Registration
// ============================================================================

resource appRegistrationScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: '${appName}-create-app-registration'
  location: location
  tags: tags
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    azCliVersion: '2.50.0'
    timeout: 'PT10M'
    retentionInterval: 'PT1H'
    cleanupPreference: 'OnSuccess'
    environmentVariables: [
      {
        name: 'APP_NAME'
        value: appName
      }
      {
        name: 'STATIC_WEB_APP_HOSTNAME'
        value: staticWebAppHostname
      }
      {
        name: 'API_HOSTNAME'
        value: apiFunctionAppHostname
      }
      {
        name: 'KEY_VAULT_NAME'
        value: keyVaultName
      }
    ]
    scriptContent: '''
      #!/bin/bash
      set -e

      echo "=========================================="
      echo "Creating Azure AD App Registration"
      echo "=========================================="

      # Check if we have permissions to create app registrations
      echo "Checking permissions..."

      # Try to create the app registration
      APP_DISPLAY_NAME="Dilux Database Backup - ${APP_NAME}"

      # Check if app already exists
      EXISTING_APP=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].appId" -o tsv 2>/dev/null || echo "")

      if [ -n "$EXISTING_APP" ] && [ "$EXISTING_APP" != "None" ]; then
        echo "App Registration already exists: $EXISTING_APP"
        CLIENT_ID=$EXISTING_APP
      else
        echo "Creating new App Registration..."

        # Create the app registration
        CREATE_RESULT=$(az ad app create \
          --display-name "$APP_DISPLAY_NAME" \
          --sign-in-audience "AzureADMyOrg" \
          --web-redirect-uris "https://${STATIC_WEB_APP_HOSTNAME}" "https://${STATIC_WEB_APP_HOSTNAME}/auth/callback" \
          --enable-id-token-issuance true \
          --enable-access-token-issuance true \
          2>&1) || {
            echo "=========================================="
            echo "ERROR: No se pudo crear el App Registration"
            echo "=========================================="
            echo ""
            echo "El usuario que ejecuta el deploy no tiene permisos para crear"
            echo "App Registrations en Azure AD."
            echo ""
            echo "SOLUCIÓN MANUAL:"
            echo "1. Ve a Azure Portal → Azure Active Directory → App registrations"
            echo "2. Click en 'New registration'"
            echo "3. Nombre: $APP_DISPLAY_NAME"
            echo "4. Supported account types: Single tenant"
            echo "5. Redirect URI (Web): https://${STATIC_WEB_APP_HOSTNAME}"
            echo "6. Después de crear, ve a 'Authentication' y agrega:"
            echo "   - https://${STATIC_WEB_APP_HOSTNAME}/auth/callback"
            echo "   - Marca 'ID tokens' y 'Access tokens'"
            echo "7. Copia el 'Application (client) ID'"
            echo "8. Ve a 'Certificates & secrets' → 'New client secret'"
            echo "9. Guarda el secret en Key Vault: $KEY_VAULT_NAME"
            echo "   - Nombre del secret: azure-ad-client-secret"
            echo "10. Actualiza las Function Apps con:"
            echo "    - AZURE_AD_CLIENT_ID = <tu client id>"
            echo ""
            echo "=========================================="

            # Output empty values so the deployment doesn't fail completely
            echo "{\"clientId\": \"\", \"success\": false, \"message\": \"Manual setup required\"}" > $AZ_SCRIPTS_OUTPUT_PATH
            exit 0
          }

        CLIENT_ID=$(echo $CREATE_RESULT | jq -r '.appId')
        echo "App Registration created: $CLIENT_ID"
      fi

      # Create a client secret
      echo "Creating client secret..."
      SECRET_RESULT=$(az ad app credential reset \
        --id $CLIENT_ID \
        --display-name "Dilux Backup Secret" \
        --years 2 \
        --query password -o tsv 2>/dev/null) || {
          echo "Warning: Could not create client secret. Manual setup may be required."
          SECRET_RESULT=""
        }

      # Store the secret in Key Vault
      if [ -n "$SECRET_RESULT" ]; then
        echo "Storing client secret in Key Vault..."
        az keyvault secret set \
          --vault-name "$KEY_VAULT_NAME" \
          --name "azure-ad-client-secret" \
          --value "$SECRET_RESULT" \
          --only-show-errors || echo "Warning: Could not store secret in Key Vault"

        # Also store the client ID
        az keyvault secret set \
          --vault-name "$KEY_VAULT_NAME" \
          --name "azure-ad-client-id" \
          --value "$CLIENT_ID" \
          --only-show-errors || echo "Warning: Could not store client ID in Key Vault"
      fi

      # Get tenant ID
      TENANT_ID=$(az account show --query tenantId -o tsv)

      echo "=========================================="
      echo "App Registration configured successfully!"
      echo "=========================================="
      echo "Client ID: $CLIENT_ID"
      echo "Tenant ID: $TENANT_ID"
      echo "Redirect URIs configured for: https://${STATIC_WEB_APP_HOSTNAME}"
      echo "=========================================="

      # Output the results
      echo "{\"clientId\": \"$CLIENT_ID\", \"tenantId\": \"$TENANT_ID\", \"success\": true}" > $AZ_SCRIPTS_OUTPUT_PATH
    '''
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('The Client ID of the App Registration (empty if manual setup required)')
output clientId string = appRegistrationScript.properties.outputs.clientId

@description('The Tenant ID')
output tenantId string = appRegistrationScript.properties.outputs.?tenantId ?? subscription().tenantId

@description('Whether the App Registration was created successfully')
output success bool = appRegistrationScript.properties.outputs.?success ?? false
