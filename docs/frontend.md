# Dilux Database Backup - Frontend Documentation

## Overview

The frontend is a **React Single Page Application** built with:

- **Vite** - Build tool and dev server
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Material UI (MUI)** - Component library
- **React Query** - Server state management
- **React Router** - Client-side routing
- **Axios** - HTTP client

---

## Project Structure

```
src/frontend/
├── index.html              # HTML entry point
├── package.json            # Dependencies and scripts
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript config
├── staticwebapp.config.json # Azure Static Web Apps config
├── .env.example            # Environment variables template
│
└── src/
    ├── main.tsx            # React entry point
    ├── App.tsx             # Root component with routes
    ├── theme.ts            # MUI theme customization
    ├── vite-env.d.ts       # Vite type definitions
    │
    ├── api/                # API client layer
    │   ├── index.ts
    │   ├── client.ts       # Axios instance
    │   ├── databases.ts    # Database API calls
    │   ├── backups.ts      # Backup API calls
    │   ├── system.ts       # System status API calls
    │   └── settings.ts     # Settings API calls
    │
    ├── contexts/           # React Contexts
    │   └── SettingsContext.tsx  # Theme and app settings
    │
    ├── components/         # Reusable components
    │   ├── common/         # Buttons, Cards, etc.
    │   └── layout/
    │       └── MainLayout.tsx  # App shell with sidebar
    │
    ├── features/           # Feature modules
    │   ├── dashboard/
    │   │   └── DashboardPage.tsx
    │   ├── databases/
    │   │   └── DatabasesPage.tsx
    │   ├── backups/
    │   │   └── BackupsPage.tsx
    │   ├── settings/
    │   │   └── SettingsPage.tsx
    │   └── status/
    │       └── StatusPage.tsx
    │
    ├── hooks/              # Custom React hooks
    │   ├── useDatabases.ts
    │   └── useBackups.ts
    │
    ├── utils/              # Utility functions
    │   └── format.ts       # Formatting helpers (formatFileSize, etc.)
    │
    └── types/              # TypeScript type definitions
        └── index.ts
```

---

## Getting Started

### Install Dependencies

```bash
cd src/frontend
npm install
```

### Start Development Server

```bash
npm run dev
```

The app runs at `http://localhost:3000` with hot reload.

### Build for Production

```bash
npm run build
```

Output goes to `src/frontend/dist/`.

### Other Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run type-check` | Check TypeScript types |

---

## Configuration

### Environment Variables

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api` | API base URL |
| `VITE_AZURE_CLIENT_ID` | - | Azure AD client ID |
| `VITE_AZURE_TENANT_ID` | - | Azure AD tenant ID |

### Vite Configuration

`vite.config.ts` configures:
- React plugin
- Dev server port (3000)
- API proxy to `localhost:7071`

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:7071',
        changeOrigin: true,
      },
    },
  },
})
```

---

## Architecture

### Pages (Features)

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/dashboard` | Overview with stats, recent backups, and system health |
| Databases | `/databases` | List, create, edit, delete database configs |
| Backups | `/backups` | View backup history with pagination and filters |
| Settings | `/settings` | Application settings (dark mode, retention, compression) |
| Status | `/status` | Detailed system status and health checks |

### State Management

**React Query** handles all server state:

```typescript
// Fetch data
const { data, isLoading, error } = useDatabases()

// Mutations
const createMutation = useCreateDatabase()
await createMutation.mutateAsync(newDatabase)
```

**React Context** for UI state:
- `SettingsContext` - Theme (light/dark), retention days, compression settings
- User preferences are persisted to backend Table Storage

### API Layer

The `api/` folder contains:

1. **`client.ts`** - Configured Axios instance with interceptors
2. **`databases.ts`** - Database CRUD operations
3. **`backups.ts`** - Backup history and downloads
4. **`system.ts`** - System status and health checks
5. **`settings.ts`** - Application settings CRUD

```typescript
// Using the API
import { databasesApi } from './api'

const databases = await databasesApi.getAll()
const newDb = await databasesApi.create({ name: 'Test', ... })
await databasesApi.triggerBackup(dbId)
```

### Custom Hooks

Hooks wrap React Query for cleaner components:

```typescript
// hooks/useDatabases.ts
export function useDatabases() {
  return useQuery({
    queryKey: ['databases'],
    queryFn: () => databasesApi.getAll(),
  })
}

export function useCreateDatabase() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: databasesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries(['databases'])
    },
  })
}
```

---

## Components

### MainLayout

The app shell with:
- AppBar with breadcrumbs navigation
- Collapsible sidebar with state persistence (localStorage)
- Dark mode toggle in navbar
- User menu with settings and logout
- Responsive drawer (mobile/desktop)

```tsx
<MainLayout>
  <DashboardPage />
</MainLayout>
```

### DashboardPage

Shows:
- **Stat cards** with interactive elements:
  - Databases (current) - with "Manage" link to /databases
  - Storage Used (current) - total blob storage size
  - Backups - with period selector (1d/7d/30d/all)
  - Success Rate - with synced period selector, shows "N/A" when no backups
- **Recent Backups** list with "View all" link to /backups
- **System Health** panel with:
  - Service status indicators (API, Storage, Databases)
  - **Backup Alerts row** - Shows red alert when databases have consecutive failures
  - Clickable row links to /status for details
  - "View Details" link to /status

**Dashboard Components:**
- `BackupsCard` - Backup count with period selector
- `SuccessRateCard` - Success rate with synced period selector
- `SystemHealthCard` - Service health + backup alerts integration
- Period selectors are synchronized (clicking one updates both)

### DatabasesPage

Shows:
- Table of all database configurations with search
- Add/Edit/Delete actions
- Test Connection button before saving
- Trigger manual backup button
- **Deep linking**: Supports `?edit={database_id}` query param to auto-open edit dialog (used from StatusPage alerts)

### BackupsPage

Shows:
- Backup history table with server-side pagination
- Filter by database (autocomplete with search)
- Filter by status, trigger type, date range
- Download buttons for completed backups

### SettingsPage

Shows:
- Dark mode toggle
- Default retention days
- Default compression setting
- Settings are persisted to backend

### StatusPage

Shows:
- Overall system status alert
- **Backup Alerts section** - Lists databases with consecutive failures (2+)
  - Shows database name, type, failure count, last error
  - **Config link** - Each row has a settings icon that links to edit the database config
- Service cards (API, Storage, Databases, Backup Stats)
- System information table
- Supported database types

---

## TypeScript Types

`types/index.ts` defines all shared types:

```typescript
// Database types
type DatabaseType = 'mysql' | 'postgresql' | 'sqlserver' | 'azure_sql'
type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

// Main interfaces
interface DatabaseConfig {
  id: string
  name: string
  database_type: DatabaseType
  host: string
  port: number
  // ...
}

interface BackupResult {
  id: string
  job_id: string
  database_id: string
  status: BackupStatus
  // ...
}
```

---

## Styling

### MUI Theme

`theme.ts` customizes Material UI:

```typescript
export const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#9c27b0' },
    // ...
  },
  typography: {
    fontFamily: '"Roboto", sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
  },
})
```

### CSS

- MUI components handle most styling
- Global styles in `index.html` (fonts)
- Component-specific styles via MUI's `sx` prop

---

## Authentication (Future)

Azure AD authentication will use MSAL React:

```typescript
// auth/msalConfig.ts
export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
}

// App.tsx
<MsalProvider instance={msalInstance}>
  <App />
</MsalProvider>
```

---

## Azure Static Web Apps

`staticwebapp.config.json` configures:

- **Route rules** - Protect `/api/*` with authentication
- **Fallback** - SPA routing (all routes → `index.html`)
- **Security headers** - CSP, X-Frame-Options, etc.

```json
{
  "routes": [
    { "route": "/api/*", "allowedRoles": ["authenticated"] }
  ],
  "navigationFallback": {
    "rewrite": "/index.html"
  }
}
```

---

## Development Workflow

### Adding a New Page

1. Create feature folder: `src/features/myfeature/`
2. Create page component: `MyFeaturePage.tsx`
3. Add route in `App.tsx`
4. Add navigation item in `MainLayout.tsx`

### Adding an API Endpoint

1. Add function to appropriate file in `api/`
2. Create/update hook in `hooks/`
3. Use hook in component

### Adding a New Component

1. Create in `components/common/` or `components/layout/`
2. Export from folder's `index.ts`
3. Import and use in features

---

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.2.0 | UI framework |
| react-dom | ^18.2.0 | React DOM renderer |
| react-router-dom | ^6.21.3 | Routing |
| @mui/material | ^5.15.6 | UI components |
| @mui/icons-material | ^5.15.6 | Icons |
| @emotion/react | ^11.11.3 | MUI styling |
| @emotion/styled | ^11.11.0 | MUI styling |
| @tanstack/react-query | ^5.17.19 | Data fetching |
| axios | ^1.6.5 | HTTP client |
| date-fns | ^3.3.1 | Date formatting |
| @azure/msal-browser | ^3.6.0 | Azure AD auth |
| @azure/msal-react | ^2.0.8 | Azure AD React |

### Development

| Package | Purpose |
|---------|---------|
| vite | Build tool |
| typescript | Type checking |
| eslint | Linting |
| @vitejs/plugin-react | Vite React plugin |

---

## Troubleshooting

### API Calls Failing

1. Check if API is running: `curl http://localhost:7071/api/health`
2. Check browser console for CORS errors
3. Verify Vite proxy config in `vite.config.ts`

### Types Not Updating

Run `npm run type-check` to see TypeScript errors.

### Hot Reload Not Working

1. Check Vite console for errors
2. Try restarting with `npm run dev`
3. Clear browser cache

### Build Errors

1. Run `npm run lint` to check for issues
2. Run `npm run type-check` for type errors
3. Check for missing dependencies
