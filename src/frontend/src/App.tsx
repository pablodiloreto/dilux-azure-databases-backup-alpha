import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { DatabasesPage } from './features/databases/DatabasesPage'
import { BackupsPage } from './features/backups/BackupsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { StatusPage } from './features/status/StatusPage'
import { UsersPage } from './features/users/UsersPage'
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <AuthProvider>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/databases" element={<DatabasesPage />} />
          <Route path="/backups" element={<BackupsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Routes>
      </MainLayout>
    </AuthProvider>
  )
}

export default App
