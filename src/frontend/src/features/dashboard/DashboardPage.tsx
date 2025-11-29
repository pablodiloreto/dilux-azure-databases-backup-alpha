import { Grid, Card, CardContent, Typography, Box, Chip, CircularProgress } from '@mui/material'
import {
  Storage as StorageIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material'
import { useDatabases } from '../../hooks/useDatabases'
import { useBackupHistory } from '../../hooks/useBackups'
import type { BackupResult } from '../../types'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}20`,
              borderRadius: '50%',
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

function getStatusColor(status: string): 'success' | 'error' | 'warning' | 'info' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'in_progress':
      return 'warning'
    default:
      return 'info'
  }
}

export function DashboardPage() {
  const { data: databases, isLoading: dbLoading } = useDatabases()
  const { data: backups, isLoading: backupsLoading } = useBackupHistory({ limit: 10 })

  const isLoading = dbLoading || backupsLoading

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  const enabledDatabases = databases?.filter((db) => db.enabled).length || 0
  const totalDatabases = databases?.length || 0
  const completedBackups = backups?.filter((b) => b.status === 'completed').length || 0
  const failedBackups = backups?.filter((b) => b.status === 'failed').length || 0

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Databases"
            value={totalDatabases}
            icon={<StorageIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Enabled"
            value={enabledDatabases}
            icon={<CheckIcon sx={{ color: '#2e7d32' }} />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Successful (24h)"
            value={completedBackups}
            icon={<CheckIcon sx={{ color: '#2e7d32' }} />}
            color="#2e7d32"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Failed (24h)"
            value={failedBackups}
            icon={<ErrorIcon sx={{ color: '#d32f2f' }} />}
            color="#d32f2f"
          />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Recent Backups
          </Typography>
          {backups && backups.length > 0 ? (
            <Box>
              {backups.slice(0, 5).map((backup: BackupResult) => (
                <Box
                  key={backup.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box>
                    <Typography variant="body1">{backup.database_name}</Typography>
                    <Typography variant="body2" color="textSecondary">
                      {new Date(backup.created_at).toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {backup.file_size_bytes && (
                      <Typography variant="body2" color="textSecondary">
                        {(backup.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                      </Typography>
                    )}
                    <Chip
                      size="small"
                      label={backup.status}
                      color={getStatusColor(backup.status)}
                    />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography color="textSecondary">No recent backups</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
