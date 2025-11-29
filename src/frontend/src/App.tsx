import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { DatabasesPage } from './features/databases/DatabasesPage'
import { BackupsPage } from './features/backups/BackupsPage'

function App() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/databases" element={<DatabasesPage />} />
        <Route path="/backups" element={<BackupsPage />} />
      </Routes>
    </MainLayout>
  )
}

export default App
