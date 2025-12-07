import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
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
  Button,
  Link,
} from '@mui/material'
import {
  Storage as StorageIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  CloudDone as CloudIcon,
  Speed as SpeedIcon,
  Today as TodayIcon,
  Dns as DnsIcon,
  ArrowForward as ArrowForwardIcon,
  OpenInNew as OpenInNewIcon,
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
  linkTo?: string
  linkLabel?: string
}

function StatCard({ title, value, subtitle, icon, color, loading, linkTo, linkLabel }: StatCardProps) {
  return (
    <Card sx={{ height: CARD_HEIGHT }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography color="textSecondary" variant="body2" noWrap>
            {title}
          </Typography>
          {linkTo && (
            <Link
              component={RouterLink}
              to={linkTo}
              variant="caption"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              {linkLabel || 'View'}
              <OpenInNewIcon sx={{ fontSize: 12 }} />
            </Link>
          )}
        </Box>
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
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1 }}>
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
      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          component={RouterLink}
          to="/status"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<ArrowForwardIcon />}
        >
          View Details
        </Button>
      </Box>
    </Card>
  )
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  '1d': '1D',
  '7d': '7D',
  '30d': '30D',
  'all': 'All',
}

const PERIOD_SUBTITLES: Record<TimePeriod, string> = {
  '1d': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  'all': 'all time',
}

// Reusable period selector toggle button group styles
const periodToggleStyles = {
  '& .MuiToggleButton-root': {
    py: 0,
    px: 0.5,
    fontSize: '0.6rem',
    minWidth: 24,
    lineHeight: 1.4,
  },
}

interface PeriodCardProps {
  period: TimePeriod
  onPeriodChange: (period: TimePeriod) => void
}

// Component for Backups count with period selector
function BackupsCard({ period, onPeriodChange }: PeriodCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['backups-stats', period],
    queryFn: () => systemApi.getStatus(period),
    refetchInterval: 30000,
    select: (data) => data.backups,
  })

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: TimePeriod | null) => {
    if (newPeriod) {
      onPeriodChange(newPeriod)
    }
  }

  const total = (data?.completed ?? 0) + (data?.failed ?? 0)

  return (
    <Card sx={{ height: CARD_HEIGHT }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography color="textSecondary" variant="body2" noWrap>
            Backups
          </Typography>
          <ToggleButtonGroup
            value={period}
            exclusive
            onChange={handlePeriodChange}
            size="small"
            sx={periodToggleStyles}
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
                  {total}
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap>
                  {PERIOD_SUBTITLES[period]}
                </Typography>
              </>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: '#9c27b020',
              borderRadius: '50%',
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ml: 2,
            }}
          >
            <TodayIcon sx={{ color: '#9c27b0' }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

// Component for Success Rate with period selector
function SuccessRateCard({ period, onPeriodChange }: PeriodCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['backups-stats', period],
    queryFn: () => systemApi.getStatus(period),
    refetchInterval: 30000,
    select: (data) => data.backups,
  })

  const handlePeriodChange = (_: React.MouseEvent<HTMLElement>, newPeriod: TimePeriod | null) => {
    if (newPeriod) {
      onPeriodChange(newPeriod)
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
            sx={periodToggleStyles}
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
                  {data?.success_rate != null ? `${data.success_rate}%` : 'N/A'}
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap>
                  {data?.success_rate != null
                    ? `${data.completed} ok, ${data.failed} failed`
                    : 'No backups in period'}
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
  // Shared period state for Backups and Success Rate cards
  const [statsPeriod, setStatsPeriod] = useState<TimePeriod>('1d')

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
        {/* 1. Databases (current) */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Databases"
            value={systemStatus?.services.databases.enabled ?? 0}
            subtitle={`of ${systemStatus?.services.databases.total ?? 0} configured (current)`}
            icon={<StorageIcon sx={{ color: '#ed6c02' }} />}
            color="#ed6c02"
            loading={statusLoading}
            linkTo="/databases"
            linkLabel="Manage"
          />
        </Grid>

        {/* 2. Storage Used (current) */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Storage Used"
            value={systemStatus?.storage.total_size_formatted || '0 B'}
            subtitle={`${systemStatus?.storage.backup_count || 0} files (current)`}
            icon={<CloudIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={statusLoading}
          />
        </Grid>

        {/* 3. Backups (with period selector) */}
        <Grid item xs={12} sm={6} md={3}>
          <BackupsCard period={statsPeriod} onPeriodChange={setStatsPeriod} />
        </Grid>

        {/* 4. Success Rate (shares period with Backups) */}
        <Grid item xs={12} sm={6} md={3}>
          <SuccessRateCard period={statsPeriod} onPeriodChange={setStatsPeriod} />
        </Grid>
      </Grid>

      {/* System Health + Recent Backups */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <SystemHealthCard status={systemStatus} loading={statusLoading} />
        </Grid>
        <Grid item xs={12} md={8}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6">
                  Recent Backups
                </Typography>
                <Link
                  component={RouterLink}
                  to="/backups"
                  variant="body2"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  View all
                  <ArrowForwardIcon sx={{ fontSize: 16 }} />
                </Link>
              </Box>
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
                        {backup.file_size_bytes != null && backup.file_size_bytes > 0 ? (
                          <Typography variant="body2" color="textSecondary">
                            {backup.file_size_bytes >= 1024 * 1024
                              ? `${(backup.file_size_bytes / 1024 / 1024).toFixed(2)} MB`
                              : `${(backup.file_size_bytes / 1024).toFixed(1)} KB`}
                          </Typography>
                        ) : backup.status === 'completed' ? (
                          <Typography variant="body2" color="textSecondary">
                            --
                          </Typography>
                        ) : null}
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
