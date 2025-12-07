import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  Button,
  Tooltip,
  IconButton,
} from '@mui/material'
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  CloudDone as CloudIcon,
  Dns as DnsIcon,
  Timer as TimerIcon,
  Code as CodeIcon,
  NotificationsActive as AlertIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { systemApi } from '../../api'
import type { BackupAlert } from '../../api'

function StatusChip({ status }: { status: string }) {
  const color = status === 'healthy' ? 'success' : status === 'unhealthy' ? 'error' : 'warning'
  const icon = status === 'healthy' ? <CheckIcon /> : status === 'unhealthy' ? <ErrorIcon /> : <WarningIcon />

  return (
    <Chip
      size="small"
      label={status}
      color={color}
      icon={icon}
    />
  )
}

function ServiceCard({
  title,
  icon,
  status,
  message,
  details,
  loading,
}: {
  title: string
  icon: React.ReactNode
  status?: string
  message?: string
  details?: Record<string, string | number>
  loading: boolean
}) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ color: 'primary.main' }}>{icon}</Box>
            <Typography variant="h6">{title}</Typography>
          </Box>
          {loading ? (
            <Skeleton width={80} height={24} />
          ) : (
            status && <StatusChip status={status} />
          )}
        </Box>
        {loading ? (
          <Box>
            <Skeleton width="100%" height={20} />
            <Skeleton width="60%" height={20} sx={{ mt: 1 }} />
          </Box>
        ) : (
          <>
            {message && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {message}
              </Typography>
            )}
            {details && Object.keys(details).length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    {Object.entries(details).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell sx={{ fontWeight: 500, textTransform: 'capitalize' }}>
                          {key.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell align="right">{value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function formatAlertDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function getDatabaseTypeColor(type: string): 'primary' | 'secondary' | 'warning' {
  switch (type) {
    case 'mysql':
      return 'primary'
    case 'postgresql':
      return 'secondary'
    case 'sqlserver':
      return 'warning'
    default:
      return 'primary'
  }
}

export function StatusPage() {
  const { data: status, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['system-status-full'],
    queryFn: () => systemApi.getStatus('all'),
    refetchInterval: 30000,
  })

  const { data: alertsData, isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ['backup-alerts'],
    queryFn: () => systemApi.getBackupAlerts(2),
    refetchInterval: 30000,
  })

  const handleRefresh = () => {
    refetch()
    refetchAlerts()
  }

  const lastChecked = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString() : 'Never'

  const allHealthy = status?.services
    ? Object.values(status.services).every((s) => s.status === 'healthy')
    : false

  const hasAlerts = (alertsData?.count ?? 0) > 0

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">System Status</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={isLoading || alertsLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Overall Status */}
      {!isLoading && (
        <Alert
          severity={allHealthy && !hasAlerts ? 'success' : 'warning'}
          sx={{ mb: 3 }}
          icon={allHealthy && !hasAlerts ? <CheckIcon /> : <WarningIcon />}
        >
          <Typography variant="body1" fontWeight={500}>
            {allHealthy && !hasAlerts
              ? 'All systems operational'
              : hasAlerts
              ? `Backup alerts: ${alertsData?.count} database(s) with consecutive failures`
              : 'Some systems may require attention'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Last checked: {lastChecked}
          </Typography>
        </Alert>
      )}

      {/* Backup Alerts */}
      {!alertsLoading && hasAlerts && (
        <Card sx={{ mb: 3, borderLeft: 4, borderColor: 'error.main' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AlertIcon color="error" />
              <Typography variant="h6" color="error.main">
                Backup Alerts
              </Typography>
              <Chip
                size="small"
                label={alertsData?.count}
                color="error"
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The following databases have 2 or more consecutive backup failures and require attention.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Database</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Failures</TableCell>
                    <TableCell>Last Failure</TableCell>
                    <TableCell>Error</TableCell>
                    <TableCell align="center">Config</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {alertsData?.alerts.map((alert: BackupAlert) => (
                    <TableRow key={alert.database_id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {alert.database_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={alert.database_type}
                          color={getDatabaseTypeColor(alert.database_type)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={alert.consecutive_failures}
                          color="error"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatAlertDate(alert.last_failure_at)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Tooltip title={alert.last_error || 'Unknown error'}>
                          <Typography
                            variant="body2"
                            color="error"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {alert.last_error || 'Unknown error'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Edit database configuration">
                          <IconButton
                            component={RouterLink}
                            to={`/databases?edit=${alert.database_id}`}
                            size="small"
                            color="primary"
                          >
                            <SettingsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={3}>
        {/* API Service */}
        <Grid item xs={12} md={6}>
          <ServiceCard
            title="API Service"
            icon={<DnsIcon />}
            status={status?.services.api.status}
            message={status?.services.api.message}
            details={{
              version: '0.1.0',
              runtime: 'Azure Functions Python 3.10',
              environment: 'Development',
            }}
            loading={isLoading}
          />
        </Grid>

        {/* Storage Service */}
        <Grid item xs={12} md={6}>
          <ServiceCard
            title="Azure Storage"
            icon={<CloudIcon />}
            status={status?.services.storage.status}
            message={status?.services.storage.message}
            details={status ? {
              'total size': status.storage.total_size_formatted,
              'backup files': status.storage.backup_count,
              provider: 'Azurite (Local Emulator)',
            } : {}}
            loading={isLoading}
          />
        </Grid>

        {/* Database Configs */}
        <Grid item xs={12} md={6}>
          <ServiceCard
            title="Database Configurations"
            icon={<StorageIcon />}
            status={status?.services.databases.status}
            message={status?.services.databases.message}
            details={status?.services.databases ? {
              total: status.services.databases.total ?? 0,
              enabled: status.services.databases.enabled ?? 0,
              disabled: (status.services.databases.total ?? 0) - (status.services.databases.enabled ?? 0),
            } : {}}
            loading={isLoading}
          />
        </Grid>

        {/* Backup Statistics */}
        <Grid item xs={12} md={6}>
          <ServiceCard
            title="Backup Statistics (All Time)"
            icon={<TimerIcon />}
            status={status?.backups.success_rate != null ? 'healthy' : 'unknown'}
            message={
              status?.backups.success_rate != null
                ? `${status.backups.success_rate}% success rate`
                : 'No backups recorded yet'
            }
            details={status ? {
              completed: status.backups.completed,
              failed: status.backups.failed,
              total: status.backups.completed + status.backups.failed,
            } : {}}
            loading={isLoading}
          />
        </Grid>
      </Grid>

      {/* System Information */}
      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
        System Information
      </Typography>

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Component</TableCell>
                  <TableCell>Version / Details</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CodeIcon fontSize="small" />
                      Frontend
                    </Box>
                  </TableCell>
                  <TableCell>React 18 + Vite + MUI</TableCell>
                  <TableCell>
                    <Chip size="small" label="running" color="success" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DnsIcon fontSize="small" />
                      API Function App
                    </Box>
                  </TableCell>
                  <TableCell>Azure Functions v4 (Python 3.10)</TableCell>
                  <TableCell>
                    {isLoading ? (
                      <Skeleton width={60} />
                    ) : (
                      <StatusChip status={status?.services.api.status || 'unknown'} />
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TimerIcon fontSize="small" />
                      Scheduler Function App
                    </Box>
                  </TableCell>
                  <TableCell>Timer Triggers (Cron)</TableCell>
                  <TableCell>
                    <Chip size="small" label="configured" color="info" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StorageIcon fontSize="small" />
                      Processor Function App
                    </Box>
                  </TableCell>
                  <TableCell>Queue Triggers</TableCell>
                  <TableCell>
                    <Chip size="small" label="configured" color="info" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CloudIcon fontSize="small" />
                      Azure Storage
                    </Box>
                  </TableCell>
                  <TableCell>Azurite (Local Emulator)</TableCell>
                  <TableCell>
                    {isLoading ? (
                      <Skeleton width={60} />
                    ) : (
                      <StatusChip status={status?.services.storage.status || 'unknown'} />
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Database Connections */}
      <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
        Supported Database Types
      </Typography>

      <Grid container spacing={2}>
        {[
          { name: 'MySQL', version: '8.0', port: 3306, status: 'available' },
          { name: 'PostgreSQL', version: '15', port: 5432, status: 'available' },
          { name: 'SQL Server', version: '2022', port: 1433, status: 'available' },
        ].map((db) => (
          <Grid item xs={12} sm={4} key={db.name}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={500}>
                      {db.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Version {db.version} | Port {db.port}
                    </Typography>
                  </Box>
                  <Chip size="small" label={db.status} color="success" variant="outlined" />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
