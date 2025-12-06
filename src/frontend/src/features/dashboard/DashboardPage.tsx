import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Skeleton,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import {
  Storage as StorageIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  CloudDone as CloudIcon,
  Speed as SpeedIcon,
  Today as TodayIcon,
  Dns as DnsIcon,
} from '@mui/icons-material'
import { systemApi, type SystemStatus, type ServiceStatus, type TimePeriod } from '../../api'
import { useBackupHistory } from '../../hooks/useBackups'
import type { BackupResult } from '../../types'

const CARD_HEIGHT = 140

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color: string
  loading?: boolean
}

function StatCard({ title, value, subtitle, icon, color, loading }: StatCardProps) {
  return (
    <Card sx={{ height: CARD_HEIGHT }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Typography color="textSecondary" variant="body2" noWrap>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {loading ? (
              <Skeleton width={80} height={45} />
            ) : (
              <>
                <Typography variant="h4" component="div" noWrap>
                  {value}
                </Typography>
                {subtitle && (
                  <Typography variant="caption" color="textSecondary" noWrap>
                    {subtitle}
                  </Typography>
                )}
              </>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}20`,
              borderRadius: '50%',
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ml: 2,
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

function ServiceStatusChip({ service }: { service: ServiceStatus }) {
  const color = service.status === 'healthy' ? 'success' : service.status === 'unhealthy' ? 'error' : 'warning'
  return (
    <Chip
      size="small"
      label={service.status}
      color={color}
      icon={service.status === 'healthy' ? <CheckIcon /> : <ErrorIcon />}
    />
  )
}

function SystemHealthCard({ status, loading }: { status?: SystemStatus; loading: boolean }) {
  const services = [
    { key: 'api', label: 'API', icon: <DnsIcon /> },
    { key: 'storage', label: 'Storage', icon: <CloudIcon /> },
    { key: 'databases', label: 'Databases', icon: <StorageIcon /> },
  ] as const

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          System Health
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} height={40} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {services.map(({ key, label, icon }) => {
              const service = status?.services[key]
              return (
                <Box
                  key={key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ color: 'text.secondary' }}>{icon}</Box>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {label}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {service?.message || 'Unknown'}
                      </Typography>
                    </Box>
                  </Box>
                  {service && <ServiceStatusChip service={service} />}
                </Box>
              )
            })}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '1d': '1D',
  '7d': '7D',
  '30d': '30D',
  'all': 'All',
}

// Separate component for Success Rate to isolate its own data fetching
function SuccessRateCard() {
  const [period, setPeriod] = useState<TimePeriod>('1d')

  const { data, isLoading } = useQuery({
    queryKey: ['success-rate', period],
    queryFn: () => systemApi.getStatus(period),
    refetchInterval: 30000,
    select: (data) => data.backups, // Only use backups data
  })

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: TimePeriod | null) => {
    if (newPeriod) {
      setPeriod(newPeriod)
    }
  }

  return (
    <Card sx={{ height: CARD_HEIGHT }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography color="textSecondary" variant="body2" noWrap>
            Success Rate
          </Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={handlePeriodChange}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                py: 0,
                px: 0.5,
                fontSize: '0.6rem',
                minWidth: 24,
                lineHeight: 1.4,
              },
            }}
          >
            {(['1d', '7d', '30d', 'all'] as TimePeriod[]).map((p) => (
              <ToggleButton key={p} value={p}>
                {PERIOD_LABELS[p]}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {isLoading ? (
              <Skeleton width={80} height={45} />
            ) : (
              <>
                <Typography variant="h4" component="div" noWrap>
                  {data?.success_rate ?? 100}%
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap>
                  {data?.completed ?? 0} ok, {data?.failed ?? 0} failed
                </Typography>
              </>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: '#2e7d3220',
              borderRadius: '50%',
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ml: 2,
            }}
          >
            <SpeedIcon sx={{ color: '#2e7d32' }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  // Main system status (always uses 1d for general stats)
  const { data: systemStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['system-status'],
    queryFn: () => systemApi.getStatus('1d'),
    refetchInterval: 30000,
  })

  const { data: backups, isLoading: backupsLoading } = useBackupHistory({ limit: 10 })

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* 1. Databases */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Databases"
            value={systemStatus?.services.databases.enabled ?? 0}
            subtitle={`of ${systemStatus?.services.databases.total ?? 0} total configured`}
            icon={<StorageIcon sx={{ color: '#ed6c02' }} />}
            color="#ed6c02"
            loading={statusLoading}
          />
        </Grid>

        {/* 2. Storage Used */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Storage Used"
            value={systemStatus?.storage.total_size_formatted || '0 B'}
            subtitle={`${systemStatus?.storage.backup_count || 0} backup files`}
            icon={<CloudIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={statusLoading}
          />
        </Grid>

        {/* 3. Backups Today */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Backups Today"
            value={systemStatus?.backups.today ?? 0}
            subtitle="completed today"
            icon={<TodayIcon sx={{ color: '#9c27b0' }} />}
            color="#9c27b0"
            loading={statusLoading}
          />
        </Grid>

        {/* 4. Success Rate (separate component with its own period state) */}
        <Grid item xs={12} sm={6} md={3}>
          <SuccessRateCard />
        </Grid>
      </Grid>

      {/* System Health + Recent Backups */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <SystemHealthCard status={systemStatus} loading={statusLoading} />
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recent Backups
              </Typography>
              {backupsLoading ? (
                <Box>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} height={50} sx={{ my: 0.5 }} />
                  ))}
                </Box>
              ) : backups && backups.length > 0 ? (
                <Box>
                  {backups.slice(0, 5).map((backup: BackupResult) => (
                    <Box
                      key={backup.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body1" noWrap>
                          {backup.database_name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {new Date(backup.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
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
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography color="textSecondary">No recent backups</Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                    Backups will appear here once you configure databases and run your first backup.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
