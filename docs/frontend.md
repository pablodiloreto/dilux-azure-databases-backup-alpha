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
    │   ├── index.ts        # Barrel exports (apiClient, databasesApi, backupsApi, etc.)
    │   ├── client.ts       # Axios instance with interceptors
    │   ├── databases.ts    # Database API calls
    │   ├── backups.ts      # Backup API calls
    │   ├── engines.ts      # Server/Engine API calls
    │   ├── audit.ts        # Audit log API calls
    │   ├── system.ts       # System status API calls
    │   ├── settings.ts     # Settings API calls
    │   └── users.ts        # Users, Auth, and Access Request API calls
    │
    ├── auth/               # Azure AD Authentication
    │   ├── index.ts        # Auth exports
    │   ├── msalConfig.ts   # MSAL configuration (clientId, authority)
    │   └── MsalAuthProvider.tsx  # MSAL React provider with login/logout
    │
    ├── contexts/           # React Contexts
    │   ├── SettingsContext.tsx  # Theme and app settings
    │   └── AuthContext.tsx      # Authentication state and user info
    │
    ├── components/         # Reusable components
    │   ├── auth/
    │   │   ├── index.ts         # Auth component exports
    │   │   └── AuthGuard.tsx    # Route protection component
    │   ├── common/
    │   │   ├── FilterBar.tsx       # Filter container with Search/Clear
    │   │   ├── FilterSelect.tsx    # Dropdown with "All X" default
    │   │   ├── LoadMore.tsx        # Pagination component
    │   │   ├── LoadingOverlay.tsx  # Loading skeletons and progress indicators
    │   │   └── ResponsiveTable.tsx # Mobile-friendly table/cards component
    │   ├── layout/
    │   │   └── MainLayout.tsx  # App shell with sidebar
    │   └── ThemeWrapper.tsx    # Theme provider with global styles
    │
    ├── features/           # Feature modules
    │   ├── dashboard/
    │   │   └── DashboardPage.tsx
    │   ├── databases/
    │   │   ├── DatabasesPage.tsx
    │   │   └── DatabaseFormDialog.tsx
    │   ├── servers/
    │   │   ├── ServersPage.tsx
    │   │   ├── ServerFormDialog.tsx
    │   │   └── DiscoverDialog.tsx
    │   ├── backups/
    │   │   └── BackupsPage.tsx
    │   ├── policies/
    │   │   └── PoliciesPage.tsx
    │   ├── audit/
    │   │   └── AuditPage.tsx
    │   ├── settings/
    │   │   └── SettingsPage.tsx
    │   ├── status/
    │   │   └── StatusPage.tsx
    │   ├── storage/
    │   │   └── StoragePage.tsx
    │   └── users/
    │       └── UsersPage.tsx
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
| Servers | `/servers` | Manage database servers (engines) with discovery |
| Databases | `/databases` | List, create, edit, delete database configs with filters |
| Backups | `/backups` | View backup history with pagination and filters |
| Policies | `/policies` | Configure backup policies with tiered schedules |
| Storage | `/storage` | Storage statistics with charts and blob details |
| Audit | `/audit` | Audit log history with filters (Admin only) |
| Users | `/users` | User management and access requests |
| Settings | `/settings` | Application settings (display, defaults) |
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
3. **`engines.ts`** - Server/Engine CRUD and discovery
4. **`backups.ts`** - Backup history and downloads
5. **`audit.ts`** - Audit log queries with filters
6. **`system.ts`** - System status and health checks
7. **`settings.ts`** - Application settings CRUD
8. **`users.ts`** - Contains:
   - `usersApi` - User management (list, create, update, delete)
   - `authApi` - Authentication events (login/logout logging)
   - `accessRequestsApi` - Access request management (list, approve, reject)

**Note:** Backup policies are managed through direct `apiClient` calls in `PoliciesPage.tsx`, not through a dedicated API module.

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

### Common Components

#### FilterBar

Reusable container for page filters with consistent behavior:

```tsx
import { FilterBar, FilterSelect } from '../components/common/FilterBar'

<FilterBar
  hasActiveFilters={type !== '' || host !== ''}  // True if any filter is set
  hasChanges={filtersHaveChanged}                // True if filters changed since last search
  onSearch={handleSearch}                        // Apply filters
  onClear={handleClear}                          // Reset and reload
  isLoading={isLoading}
>
  <FilterSelect ... />
  <TextField ... />
</FilterBar>
```

**Filter Behavior:**
- **Search button** - Disabled until filters change from applied values
- **Clear filters** - Only visible when filters are active, resets and reloads immediately
- **hasChanges vs hasActiveFilters** - Different purposes:
  - `hasActiveFilters`: Shows/hides Clear button
  - `hasChanges`: Enables/disables Search button

#### FilterSelect

Dropdown select with "All X" default display (no floating label):

```tsx
<FilterSelect
  value={selectedType}
  options={[
    { value: 'mysql', label: 'MySQL' },
    { value: 'postgresql', label: 'PostgreSQL' },
  ]}
  allLabel="All Types"
  onChange={setSelectedType}
  minWidth={140}
/>
```

Uses MUI Select with `displayEmpty` to always show the selected value or "All X" placeholder.

#### LoadMore

Pagination component showing count with "Load More" button:

```tsx
<LoadMore
  shown={databases.length}
  total={totalCount}
  hasMore={hasMore}
  onLoadMore={loadMore}
  isLoading={isLoadingMore}
/>
// Renders: "Showing 25 of 150" with Load More button
```

#### LoadingOverlay / Skeletons

Theme-aware loading components for consistent loading states across the app:

```tsx
import { LoadingOverlay, TableSkeleton, CardListSkeleton } from '../components/common'

// Linear progress bar for refresh (when data already exists)
<Card sx={{ position: 'relative' }}>
  <LoadingOverlay loading={isLoading && data.length > 0} />
  <CardContent>
    {isLoading && data.length === 0 ? (
      // Initial loading: show skeleton
      <TableSkeleton rows={8} columns={6} />
    ) : (
      // Data loaded: show table
      <Table>...</Table>
    )}
  </CardContent>
</Card>

// Mobile card skeleton
{isLoading && data.length === 0 && <CardListSkeleton count={5} />}
```

**Components:**
- `LoadingOverlay` - Subtle LinearProgress bar at top of container (default `variant='linear'`)
- `TableSkeleton` - Animated skeleton rows mimicking table structure
- `CardListSkeleton` - Animated skeleton cards for mobile views
- `StatsCardsSkeleton` - Animated skeleton for stats card grids

**Pattern:**
- Initial load (`isLoading && data.length === 0`): Show skeleton
- Refresh (`isLoading && data.length > 0`): Show LinearProgress at top

#### ResponsiveTable

Mobile-friendly table component that displays as a standard table on desktop and as expandable cards on mobile:

```tsx
import { ResponsiveTable, Column } from '../components/common'

// Define columns
const columns: Column<User>[] = [
  {
    id: 'name',
    label: 'Name',
    render: (user) => <Typography fontWeight={500}>{user.name}</Typography>,
    hideInMobileSummary: true,  // Show only when expanded on mobile
  },
  {
    id: 'email',
    label: 'Email',
    render: (user) => user.email,
  },
  {
    id: 'role',
    label: 'Role',
    render: (user) => <Chip label={user.role} size="small" />,
  },
]

<ResponsiveTable
  columns={columns}
  data={users}
  keyExtractor={(user) => user.id}
  mobileTitle={(user) => user.name}              // Card title on mobile
  mobileSummaryColumns={['role']}                 // Columns visible in collapsed card
  actions={(user) => (                            // Action buttons
    <IconButton onClick={() => handleEdit(user)}>
      <EditIcon />
    </IconButton>
  )}
  emptyMessage="No users found"
  size="small"
/>
```

**Props:**
- `columns` - Array of column definitions with `id`, `label`, `render`, and optional `hideInMobileSummary`
- `data` - Array of data items
- `keyExtractor` - Function to extract unique key from each item
- `mobileTitle` - Function returning the title shown on mobile cards
- `mobileSummaryColumns` - Column IDs to show in collapsed mobile view
- `actions` - Function returning action buttons for each row
- `emptyMessage` - Message shown when data is empty
- `size` - Table size ('small' | 'medium')

**Responsive Behavior:**
- Shows as expandable cards below `lg` breakpoint (< 1200px) to prevent horizontal scrolling
- Card header shows `mobileTitle` and columns in `mobileSummaryColumns`
- Tap to expand/collapse to see all columns
- Actions always visible in card header and centered in table view

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

### ServersPage

Manages database servers (engines) - the connection sources for databases:

Shows:
- **Stat cards**: Total Servers, MySQL, PostgreSQL, SQL Server counts
- **ResponsiveTable** of server configurations (cards on mobile)
- **FilterBar** with filter by server type
- **CRUD operations**:
  - Create server with auto-discover databases option
  - Edit server with "Apply credentials to X database(s)" checkbox
  - Delete server with cascade options (delete DBs, delete backups)
- **Discovery**: Button to discover databases on a server
- **Test Connection**: Validate server connectivity before saving

**ServerFormDialog:**
- Name, Type, Host, Port fields
- Authentication method (User/Password, Managed Identity, Azure AD)
- Username/Password fields for user auth
- "Discover databases after creation" checkbox (create mode)
- "Apply credential changes to X databases" checkbox (edit mode)

**DiscoverDialog:**
- Lists databases found on the server
- Checkbox to select which databases to import
- Creates database configs using server credentials

### DatabasesPage

Shows:
- **Stat cards**: Total Databases, Servers count, MySQL, PostgreSQL, SQL Server counts
- **ResponsiveTable** of database configurations (cards on mobile)
- **FilterBar** with:
  - Filter by database type (All Types, MySQL, PostgreSQL, SQL Server)
  - Filter by server (engine)
  - Filter by backup policy
- **Load More pagination** - Uses `pageSize` setting (default 25)
- Add/Edit/Delete actions
- Test Connection button before saving
- Trigger manual backup button
- **Deep linking**: Supports `?edit={database_id}` query param to auto-open edit dialog (used from StatusPage alerts)
- **Mobile**: Shows name as card title, type/status in summary, server/policy on expand

**DatabaseFormDialog:**
- **Server selector** (Autocomplete): Select a server to auto-fill connection details
- When server selected:
  - Auto-fills type, host, port from server
  - Shows "Use server credentials" toggle
  - Fields become read-only (except database name, alias, policy)
- **Use server credentials** toggle:
  - When enabled: Hides username/password fields, uses server credentials
  - When disabled: Shows username/password fields for custom credentials
- **Test Connection**: Works with both server credentials and custom credentials
- Policy selector with tier summary
- Enable/Disable toggle

### BackupsPage

Shows:
- **ResponsiveTable** of backup history (cards on tablet/mobile)
- **Stats bar** with Loaded count, Success Rate, Failed count, Total Size (2x2 grid on mobile)
- **FilterBar** with:
  - Filter by server (autocomplete with search)
  - Filter by database (autocomplete with search)
  - Filter by type (All Types, MySQL, PostgreSQL, SQL Server)
  - Filter by status (All Statuses, Completed, Failed, etc.)
  - Date range picker (From/To)
- **Load More pagination** - Uses `pageSize` setting (default 25)
- **Table columns**: Server, Database, Details, Trigger, Date, Status, Actions
- **Actions**:
  - Info button - Opens details dialog with full backup information
  - Download button (completed backups only)
  - Delete button (admin only, completed/failed backups)
- **Bulk delete**: Checkbox selection with "Delete Selected" button
- Clear filters resets and reloads immediately
- **Mobile/Tablet**: Shows database name as card title, status/trigger/date in summary, details on expand

**Backup Details Dialog:**
- Status banner (success/error/info)
- Full backup information: Database, Type, Server, Status, Trigger, Tier
- Timestamps: Started At, Completed At, Duration
- File info (completed): File Size, File Format, File Name (blob path)
- IDs: Job ID, Backup ID, Created At
- Error details (failed): Full error message in scrollable area
- Download button (completed backups only)

### PoliciesPage

Shows:
- **ResponsiveTable** of backup policies (cards on mobile)
- Tier columns: Hourly, Daily, Weekly, Monthly, Yearly
- Create/Edit/Delete policies
- Tier configuration with:
  - Enable/disable toggle
  - Keep count
  - Schedule time
  - Day of week (weekly), Day of month (monthly/yearly), Month (yearly)
- System policies cannot be deleted
- Shows policy count: "Showing X policies"
- **Mobile**: Shows policy name as card title, summary chip visible, tier details on expand

### SettingsPage

Shows:
- **Your Preferences** (per-user, stored in Table Storage):
  - Dark mode toggle
  - Items per page (10, 25, 50, 100) - configurable page size for all list views
- **Backup Defaults** (system-wide):
  - Default retention days
  - Default compression setting
- **Access Control** (system-wide):
  - Allow Access Requests toggle
- **Mobile**: Settings rows stack vertically (title/description above, control below)

### StatusPage

Shows:
- Overall system status alert
- **Backup Alerts section** with **ResponsiveTable** (cards on mobile)
  - Lists databases with consecutive failures (2+)
  - Shows database name, type, failure count, last error
  - **Config link** - Each row has a settings icon that links to edit the database config
  - **Mobile**: Shows database name as card title, failure count in summary
- Service cards (API, Storage, Databases, Backup Stats)
- System information table
- Supported database types

### AuditPage

Shows:
- **Audit log table** with columns: Time, User, Type, Action, Engine, Alias, Status
- **FilterBar** with:
  - User autocomplete (searchable with debounce)
  - Filter by action (Create Database, Delete Backup, etc.)
  - Filter by resource type (database, backup, policy, user)
  - Filter by status (Success, Failed)
  - Date range pickers (From/To)
  - Filter by engine (MySQL, PostgreSQL, SQL Server)
  - Alias autocomplete (searchable database names)
- **Detail dialog** - Click row to see full details (resource ID, IP, error message, JSON details)
- **Load More pagination** - Uses `pageSize` setting
- **Admin only** - Only visible to users with admin role
- **Skeleton loading** - TableSkeleton for initial load, LinearProgress for refresh
- **Mobile**: Shows action as card title, status/time in summary, details on expand

### UsersPage

Shows:
- **ResponsiveTable** of registered users (cards on mobile)
- **Pending Access Requests** collapsible section with **ResponsiveTable**
  - Lists users who requested access (when access requests enabled in settings)
  - Approve/Reject actions
  - **Mobile**: Shows name as card title, email in summary
- Search by email or name
- Filter by status (All, Active, Disabled)
- Add/Edit/Delete users
- Server-side pagination with MUI TablePagination
- **Mobile**: Shows user name as card title, role/status in summary, email/last login on expand

---

## TypeScript Types

`types/index.ts` defines all shared types:

```typescript
// Enums
type DatabaseType = 'mysql' | 'postgresql' | 'sqlserver' | 'azure_sql'
type EngineType = 'mysql' | 'postgresql' | 'sqlserver'
type AuthMethod = 'user_password' | 'managed_identity' | 'azure_ad' | 'connection_string'
type BackupStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

// Engine (Server)
interface Engine {
  id: string
  name: string
  engine_type: EngineType
  host: string
  port: number
  auth_method: AuthMethod
  username?: string
  discovery_enabled: boolean
  database_count?: number  // Number of databases using this engine
  // ...
}

// Database
interface DatabaseConfig {
  id: string
  name: string
  database_type: DatabaseType
  engine_id?: string           // Associated server
  engine_name?: string         // Server name (from API)
  use_engine_credentials: boolean  // Use server credentials vs custom
  host: string
  port: number
  database_name: string
  username?: string            // Only if use_engine_credentials=false
  policy_id: string
  enabled: boolean
  // ...
}

// Backup
interface BackupResult {
  id: string
  job_id: string
  database_id: string
  database_alias: string
  database_type: DatabaseType
  engine_id?: string
  status: BackupStatus
  tier?: string               // hourly, daily, weekly, monthly, yearly
  // ...
}

// Audit Log
interface AuditLog {
  id: string
  action: string
  resource_type: string
  resource_id: string
  resource_name?: string
  user_id: string
  user_email: string
  status: 'success' | 'failed'
  details?: Record<string, unknown>
  timestamp: string
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
    // Disable scroll lock globally to prevent layout shift
    MuiDialog: { defaultProps: { disableScrollLock: true } },
    MuiMenu: { defaultProps: { disableScrollLock: true } },
    MuiPopover: { defaultProps: { disableScrollLock: true } },
    MuiModal: { defaultProps: { disableScrollLock: true } },
    MuiDrawer: { defaultProps: { disableScrollLock: true } },
  },
})
```

### ThemeWrapper

`ThemeWrapper.tsx` wraps the app with MUI theme and global styles:

- Provides light/dark theme based on user settings
- Applies global CSS for layout stability:
  - `html { overflowY: scroll; scrollbarGutter: stable; }` - Prevents layout shift
  - `body { overflow: visible; paddingRight: 0; }` - Overrides MUI scroll lock

### CSS

- MUI components handle most styling
- Global styles in `ThemeWrapper.tsx` (layout stability)
- Google Fonts loaded in `index.html`
- Component-specific styles via MUI's `sx` prop

---

## Authentication

Azure AD authentication is implemented using MSAL React:

### Configuration

The MSAL configuration is loaded from environment variables:

```typescript
// auth/MsalAuthProvider.tsx
const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
}
```

### Components

**MsalAuthProvider** (`auth/MsalAuthProvider.tsx`):
- Wraps the app with MSAL provider
- Provides `login()` and `logout()` functions
- Handles authentication state
- Logs authentication events to backend audit log

**AuthContext** (`contexts/AuthContext.tsx`):
- Provides current user information
- Manages user role and permissions
- Exposes `isAdmin`, `isOperator`, `isViewer` helpers

**AuthGuard** (`components/auth/AuthGuard.tsx`):
- Protects routes requiring authentication
- Redirects unauthenticated users to login
- Optionally requires specific roles

### Usage

```tsx
// App.tsx
import { MsalAuthProvider } from './auth'

<MsalAuthProvider>
  <AuthContext.Provider>
    <Router>
      <Routes>
        <Route path="/admin/*" element={
          <AuthGuard requiredRole="admin">
            <AdminPage />
          </AuthGuard>
        } />
      </Routes>
    </Router>
  </AuthContext.Provider>
</MsalAuthProvider>

// In components
import { useAuth } from '../contexts/AuthContext'

const MyComponent = () => {
  const { user, isAdmin, logout } = useAuth()

  return (
    <div>
      Welcome, {user?.name}
      {isAdmin && <AdminPanel />}
      <Button onClick={logout}>Logout</Button>
    </div>
  )
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_AZURE_CLIENT_ID` | Azure AD application client ID |
| `VITE_AZURE_TENANT_ID` | Azure AD tenant ID |

See `docs/AUTH_SETUP.md` for complete Azure AD configuration instructions.

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
