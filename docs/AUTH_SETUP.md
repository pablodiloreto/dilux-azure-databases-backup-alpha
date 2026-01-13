# Azure AD Authentication Setup

This guide explains how to configure Azure AD authentication for Dilux Database Backup.

## Automatic Setup (Recommended)

The easiest way to configure authentication is using the deployment script:

```bash
curl -sL https://raw.githubusercontent.com/pablodiloreto/dilux-azure-databases-backup-alpha/main/scripts/deploy.sh | bash
```

This script automatically:
1. Creates the App Registration in Azure AD
2. Configures redirect URIs
3. Deploys the infrastructure with correct settings
4. First user to login becomes Admin

**Requirements:**
- Azure CLI installed
- Global Admin or Application Administrator role in Azure AD

---

## Manual Setup

Only follow these steps if you need to configure authentication manually (e.g., when using "Deploy to Azure" button).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Azure AD      │     │   Backend API   │
│   (MSAL React)  │────▶│   (Auth)        │────▶│   (Validate)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        │           Bearer Token (JWT)                  │
        └──────────────────────────────────────────────▶│
```

- **Frontend**: Uses MSAL React to authenticate users with Azure AD
- **Azure AD**: Handles login, issues JWT tokens
- **Backend**: Validates tokens via EasyAuth headers or JWT validation

## Step 1: Create App Registration

### 1.1 Go to Azure Portal

1. Open [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** (or **Microsoft Entra ID**)
3. Click **App registrations** in the left menu
4. Click **+ New registration**

### 1.2 Register the Application

Fill in the form:

| Field | Value |
|-------|-------|
| **Name** | `Dilux Backup Dev` (or your preferred name) |
| **Supported account types** | Choose based on your needs (see below) |
| **Redirect URI** | Select **Single-page application (SPA)** |
| **Redirect URI value** | `http://localhost:3000` |

#### Supported Account Types

| Option | Use Case |
|--------|----------|
| **Single tenant** | Only users from your organization |
| **Multitenant** | Users from any Azure AD organization |
| **Multitenant + personal** | Azure AD + personal Microsoft accounts |

> **Recommendation for dev**: Start with "Single tenant" for easier testing.

### 1.3 Click "Register"

After registration, you'll see the app overview page.

### 1.4 Copy Required Values

From the **Overview** page, copy these values:

```
Application (client) ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
22a0cff2-6f65-4e55-9c56-1db110d66610

Directory (tenant) ID:   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
0247cf34-7abc-4ba3-bcc0-d105e9a29a5f
```

You'll need these for the frontend configuration.

## Step 2: Configure Redirect URIs

### 2.1 Add Additional Redirect URIs

Go to **Authentication** in the left menu and add these URIs under **Single-page application**:

**For Development:**
```
http://localhost:3000
http://localhost:3000/auth/callback
```

**For Codespaces (if using GitHub Codespaces):**
```
https://<your-codespace-name>-3000.app.github.dev
https://<your-codespace-name>-3000.app.github.dev/auth/callback
```

**For Production (add later):**
```
https://your-app.azurewebsites.net
https://your-app.azurewebsites.net/auth/callback
```

### 2.2 Configure Implicit Grant (Optional)

Under **Implicit grant and hybrid flows**, you can leave both unchecked for SPA with PKCE (recommended).

### 2.3 Save Changes

Click **Save** at the top.

## Step 3: Configure API Permissions (Optional)

By default, the app has `User.Read` permission which is sufficient for basic authentication.

If you need additional permissions:

1. Go to **API permissions**
2. Click **+ Add a permission**
3. Select **Microsoft Graph**
4. Add required permissions

## Step 4: Configure Frontend

### 4.1 Create `.env.local` file

In `src/frontend/`, create `.env.local`:

```env
# Azure AD Configuration
VITE_AZURE_CLIENT_ID=your-client-id-here
VITE_AZURE_TENANT_ID=your-tenant-id-here

# Auth mode: 'azure' for real auth, 'mock' for development without Azure
VITE_AUTH_MODE=azure
```

### 4.2 For Codespaces

If running in GitHub Codespaces, also set:

```env
VITE_AZURE_REDIRECT_URI=https://your-codespace-name-3000.app.github.dev
```

## Step 5: Test Authentication

1. Start the frontend: `npm run dev`
2. Open `http://localhost:3000`
3. You should see a login button
4. Click login and authenticate with your Azure AD account
5. First user to login becomes Admin automatically

## Troubleshooting

### "AADSTS50011: Reply URL does not match"

The redirect URI in your app registration doesn't match. Check:
- Exact URL match (including trailing slashes)
- Protocol (http vs https)
- Port number

### "AADSTS700054: response_type 'id_token' is not enabled"

Enable "ID tokens" in Authentication > Implicit grant settings, or ensure you're using PKCE flow.

### "Access denied" after login

The user exists in Azure AD but not in the app's user table. Options:
1. First user auto-becomes admin
2. Admin must pre-register the user
3. User can submit access request (if enabled)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_AZURE_CLIENT_ID` | Yes | Application (client) ID from App Registration |
| `VITE_AZURE_TENANT_ID` | Yes | Directory (tenant) ID from App Registration |
| `VITE_AUTH_MODE` | No | `azure` (default) or `mock` for dev without Azure |
| `VITE_AZURE_REDIRECT_URI` | No | Override redirect URI (for Codespaces) |

## Audit Logging

### Login/Logout Events

Login and logout events are logged to the audit system. The frontend is responsible for calling the audit endpoint when actual login/logout actions occur.

**Why frontend triggers audit logging:**
- `get_current_user()` in the backend is called on every API request for authentication
- Logging login there would create false audit entries on every page navigation
- Real login happens when user clicks "Login" and completes Azure AD popup
- Real logout happens when user clicks "Logout"

**API Endpoint:**
```
POST /api/auth/events
Content-Type: application/json

{
  "event": "login" | "logout"
}
```

**Frontend Implementation (AuthContext.tsx):**
```typescript
// Track pending login with useRef
const pendingLoginRef = useRef(false)

// In login():
pendingLoginRef.current = true
await instance.loginPopup(loginRequest)

// In fetchUser() after successful auth:
if (pendingLoginRef.current) {
  pendingLoginRef.current = false
  authApi.logEvent('login')  // <-- Only logs when actual login happened
}

// In logout():
if (user) {
  await authApi.logEvent('logout')
}
```

### Audit Actions

| Action | Description |
|--------|-------------|
| `user_login` | User authenticated via Azure AD popup |
| `user_logout` | User clicked logout button |

Failed login attempts (unregistered or disabled users) are logged automatically by the backend middleware.

## Security Notes

1. **Never commit** `.env.local` or any file with real credentials
2. **Client ID is public** - it's safe to expose in frontend code
3. **Use PKCE** - MSAL React uses PKCE by default (more secure than implicit flow)
4. **Validate tokens** - Backend always validates tokens, never trust frontend alone
