import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ServersPage } from './features/servers/ServersPage'
import { DatabasesPage } from './features/databases/DatabasesPage'
import { BackupsPage } from './features/backups/BackupsPage'
import { PoliciesPage } from './features/policies/PoliciesPage'
import { StoragePage } from './features/storage/StoragePage'
import { SettingsPage } from './features/settings/SettingsPage'
import { StatusPage } from './features/status/StatusPage'
import { UsersPage } from './features/users/UsersPage'
import { AuditPage } from './features/audit/AuditPage'
import { AuthProvider } from './contexts/AuthContext'
import { MsalAuthProvider } from './auth'
import { AuthGuard } from './components/auth'

function App() {
  return (
    <MsalAuthProvider>
      <AuthProvider>
        <AuthGuard>
        <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/engines" element={<Navigate to="/servers" replace />} />
          <Route path="/databases" element={<DatabasesPage />} />
          <Route path="/backups" element={<BackupsPage />} />
          <Route path="/policies" element={<PoliciesPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/audit" element={<AuditPage />} />
        </Routes>
        </MainLayout>
        </AuthGuard>
      </AuthProvider>
    </MsalAuthProvider>
  )
}

export default App
