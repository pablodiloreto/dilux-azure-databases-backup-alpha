// ============================================================================
// App Registration Module (via Deployment Script)
// ============================================================================
// Creates an Azure AD App Registration for SPA authentication using Microsoft
// Graph API via `az rest`. This is required because `az ad app create` does not
// support SPA redirect URIs directly.
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

@description('Storage Account name (for redirect URI - uses Static Website)')
param storageAccountName string

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
        name: 'STORAGE_ACCOUNT_NAME'
        value: storageAccountName
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
      echo "Creating Azure AD App Registration (SPA)"
      echo "=========================================="

      # Get the Storage Static Website URL
      # Note: Static website might not be enabled yet, so we'll use a predictable URL pattern
      # The actual URL will be available after code-deployment enables static website
      STORAGE_WEB_URL=$(az storage account show \
        --name "$STORAGE_ACCOUNT_NAME" \
        --query "primaryEndpoints.web" -o tsv 2>/dev/null | sed 's:/*$::' || echo "")

      if [ -z "$STORAGE_WEB_URL" ]; then
        # If static website isn't enabled yet, we can't get the URL
        # The App Registration will need to be updated manually later
        echo "WARNING: Storage static website not yet enabled"
        echo "App Registration redirect URIs will need to be updated after deployment"
        STORAGE_WEB_URL="https://localhost"
      fi

      echo "Storage Website URL: $STORAGE_WEB_URL"

      APP_DISPLAY_NAME="Dilux Database Backup - ${APP_NAME}"
      REDIRECT_URI_1="${STORAGE_WEB_URL}"
      REDIRECT_URI_2="${STORAGE_WEB_URL}/"
      REDIRECT_URI_3="http://localhost:3000"
      REDIRECT_URI_4="http://localhost:5173"

      # Check if app already exists using Graph API
      echo "Checking if App Registration already exists..."
      EXISTING_APP=$(az rest --method GET \
        --uri "https://graph.microsoft.com/v1.0/applications?\$filter=displayName eq '${APP_DISPLAY_NAME}'" \
        --query "value[0].appId" -o tsv 2>/dev/null || echo "")

      if [ -n "$EXISTING_APP" ] && [ "$EXISTING_APP" != "None" ] && [ "$EXISTING_APP" != "null" ]; then
        echo "App Registration already exists: $EXISTING_APP"
        CLIENT_ID=$EXISTING_APP

        # Get Object ID for updates
        OBJECT_ID=$(az rest --method GET \
          --uri "https://graph.microsoft.com/v1.0/applications?\$filter=displayName eq '${APP_DISPLAY_NAME}'" \
          --query "value[0].id" -o tsv 2>/dev/null || echo "")

        # Update SPA redirect URIs if needed
        echo "Updating SPA redirect URIs..."
        az rest --method PATCH \
          --uri "https://graph.microsoft.com/v1.0/applications/${OBJECT_ID}" \
          --headers "Content-Type=application/json" \
          --body "{\"spa\":{\"redirectUris\":[\"${REDIRECT_URI_1}\",\"${REDIRECT_URI_2}\",\"${REDIRECT_URI_3}\",\"${REDIRECT_URI_4}\"]}}" \
          2>/dev/null || echo "Warning: Could not update redirect URIs"
      else
        echo "Creating new App Registration with SPA redirect URIs..."

        # Create app using Graph API with SPA redirect URIs
        CREATE_RESULT=$(az rest --method POST \
          --uri "https://graph.microsoft.com/v1.0/applications" \
          --headers "Content-Type=application/json" \
          --body "{
            \"displayName\": \"${APP_DISPLAY_NAME}\",
            \"signInAudience\": \"AzureADMyOrg\",
            \"spa\": {
              \"redirectUris\": [\"${REDIRECT_URI_1}\", \"${REDIRECT_URI_2}\", \"${REDIRECT_URI_3}\", \"${REDIRECT_URI_4}\"]
            },
            \"requiredResourceAccess\": [
              {
                \"resourceAppId\": \"00000003-0000-0000-c000-000000000000\",
                \"resourceAccess\": [
                  {
                    \"id\": \"e1fe6dd8-ba31-4d61-89e7-88639da4683d\",
                    \"type\": \"Scope\"
                  }
                ]
              }
            ]
          }" 2>&1) || {
            echo "============================================================"
            echo "⚠️  APP REGISTRATION NO CONFIGURADO"
            echo "============================================================"
            echo ""
            echo "El deployment continuará pero la autenticación quedará en"
            echo "modo MOCK (sin Azure AD real)."
            echo ""
            echo "Para habilitar Azure AD authentication, ejecuta:"
            echo ""
            echo "  curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/configure-auth.sh | bash"
            echo ""
            echo "El script te guiará para:"
            echo "  1. Crear el App Registration en Azure AD"
            echo "  2. Configurar las Function Apps"
            echo "  3. Actualizar el frontend"
            echo ""
            echo "============================================================"

            # Output empty values so the deployment doesn't fail completely
            echo "{\"clientId\": \"\", \"success\": false, \"message\": \"Manual setup required\"}" > $AZ_SCRIPTS_OUTPUT_PATH
            exit 0
          }

        CLIENT_ID=$(echo "$CREATE_RESULT" | jq -r '.appId')
        OBJECT_ID=$(echo "$CREATE_RESULT" | jq -r '.id')

        if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" == "null" ]; then
          echo "ERROR: Failed to extract Client ID from response"
          echo "Response: $CREATE_RESULT"
          echo "{\"clientId\": \"\", \"success\": false, \"message\": \"Failed to create app\"}" > $AZ_SCRIPTS_OUTPUT_PATH
          exit 0
        fi

        echo "App Registration created successfully!"
        echo "Client ID: $CLIENT_ID"
        echo "Object ID: $OBJECT_ID"
      fi

      # Store the client ID in Key Vault
      echo "Storing client ID in Key Vault..."
      az keyvault secret set \
        --vault-name "$KEY_VAULT_NAME" \
        --name "azure-ad-client-id" \
        --value "$CLIENT_ID" \
        --only-show-errors 2>/dev/null || echo "Warning: Could not store client ID in Key Vault"

      # Get tenant ID
      TENANT_ID=$(az account show --query tenantId -o tsv)

      echo "=========================================="
      echo "App Registration configured successfully!"
      echo "=========================================="
      echo "Client ID: $CLIENT_ID"
      echo "Tenant ID: $TENANT_ID"
      echo "Redirect URIs (SPA):"
      echo "  - ${REDIRECT_URI_1}"
      echo "  - ${REDIRECT_URI_2}"
      echo "  - ${REDIRECT_URI_3}"
      echo "  - ${REDIRECT_URI_4}"
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
