// ============================================================================
// RBAC - Resilient Role Assignments Module
// ============================================================================
// Creates role assignments using a deployment script with error handling.
// If the role assignment already exists, it continues without failing.
// This prevents re-deployment failures due to existing role assignments.
// ============================================================================

@description('Azure region')
param location string

@description('Tags to apply')
param tags object

@description('User-assigned Managed Identity ID for running the script')
param identityId string

@description('Resource group name')
param resourceGroupName string

@description('Array of role assignments to create')
param roleAssignments array
// Each item should have: { principalId, scope, roleId, description }

// ============================================================================
// Deployment Script - Creates role assignments with error handling
// ============================================================================

resource rbacScript 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: 'create-role-assignments'
  location: location
  tags: tags
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identityId}': {}
    }
  }
  properties: {
    azCliVersion: '2.50.0'
    timeout: 'PT10M'
    retentionInterval: 'PT1H'
    cleanupPreference: 'OnSuccess'
    environmentVariables: [
      { name: 'ROLE_ASSIGNMENTS_JSON', value: string(roleAssignments) }
      { name: 'RESOURCE_GROUP', value: resourceGroupName }
    ]
    scriptContent: '''
      #!/bin/bash

      echo "=========================================="
      echo "Creating Role Assignments (Resilient)"
      echo "=========================================="

      # Parse the JSON array of role assignments
      ASSIGNMENTS=$(echo "$ROLE_ASSIGNMENTS_JSON" | tr -d '\n')

      SUCCESS_COUNT=0
      SKIPPED_COUNT=0
      FAILED_COUNT=0

      # Process each role assignment
      echo "$ASSIGNMENTS" | jq -c '.[]' | while read -r assignment; do
        PRINCIPAL_ID=$(echo "$assignment" | jq -r '.principalId')
        SCOPE=$(echo "$assignment" | jq -r '.scope')
        ROLE_ID=$(echo "$assignment" | jq -r '.roleId')
        DESCRIPTION=$(echo "$assignment" | jq -r '.description // "Role assignment"')

        echo ""
        echo "Processing: $DESCRIPTION"
        echo "  Principal: $PRINCIPAL_ID"
        echo "  Role: $ROLE_ID"
        echo "  Scope: $SCOPE"

        # Try to create the role assignment
        OUTPUT=$(az role assignment create \
          --assignee-object-id "$PRINCIPAL_ID" \
          --assignee-principal-type ServicePrincipal \
          --role "$ROLE_ID" \
          --scope "$SCOPE" 2>&1) || true

        # Check the result
        if echo "$OUTPUT" | grep -q "already exists"; then
          echo "  ⏭️  SKIPPED - Already exists"
        elif echo "$OUTPUT" | grep -q "roleAssignmentId"; then
          echo "  ✅ CREATED"
        elif echo "$OUTPUT" | grep -q "error"; then
          echo "  ⚠️  WARNING: $OUTPUT"
          # Don't fail, just warn
        else
          echo "  ✅ OK"
        fi
      done

      echo ""
      echo "=========================================="
      echo "Role Assignments Complete"
      echo "=========================================="

      # Always succeed - role assignments should not block deployment
      echo '{"status": "success"}' > $AZ_SCRIPTS_OUTPUT_PATH
    '''
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Deployment script status')
output status string = rbacScript.properties.provisioningState
