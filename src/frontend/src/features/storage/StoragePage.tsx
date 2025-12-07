import { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper,
  Skeleton,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material'
import {
  Storage as StorageIcon,
  Folder as FolderIcon,
  PieChart as PieChartIcon,
} from '@mui/icons-material'
import { apiClient } from '../../api/client'

interface StorageByDatabase {
  database_id: string
  database_name: string
  database_type: string
  size_bytes: number
  size_formatted: string
  backup_count: number
}

interface StorageByType {
  size_bytes: number
  size_formatted: string
}

interface StorageStats {
  total_size_bytes: number
  total_size_formatted: string
  total_backup_count: number
  by_database: StorageByDatabase[]
  by_type: {
    mysql: StorageByType
    postgresql: StorageByType
    sqlserver: StorageByType
    azure_sql: StorageByType
  }
}

interface StatBoxProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  loading?: boolean
}

function StatBox({ title, value, icon, color, loading }: StatBoxProps) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" noWrap>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={60} height={36} />
          ) : (
            <Typography variant="h4" fontWeight={500}>
              {value}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            backgroundColor: `${color}20`,
            borderRadius: '50%',
            p: 1.5,
            display: 'flex',
          }}
        >
          {icon}
        </Box>
      </Box>
    </Paper>
  )
}

function getDatabaseTypeColor(type: string): string {
  switch (type) {
    case 'mysql':
      return '#1976d2'
    case 'postgresql':
      return '#9c27b0'
    case 'sqlserver':
      return '#2e7d32'
    case 'azure_sql':
      return '#ed6c02'
    default:
      return '#757575'
  }
}

// Simple pie chart component using CSS
interface PieSlice {
  label: string
  value: number
  color: string
}

function SimplePieChart({ slices, total }: { slices: PieSlice[]; total: number }) {
  if (total === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">No data</Typography>
      </Box>
    )
  }

  // Filter out zero values and calculate percentages
  const nonZeroSlices = slices.filter((s) => s.value > 0)
  let currentAngle = 0

  // Build conic-gradient
  const gradientParts = nonZeroSlices.map((slice) => {
    const percentage = (slice.value / total) * 100
    const startAngle = currentAngle
    currentAngle += percentage
    return `${slice.color} ${startAngle}% ${currentAngle}%`
  })

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {/* Pie chart */}
      <Box
        sx={{
          width: 150,
          height: 150,
          borderRadius: '50%',
          background: `conic-gradient(${gradientParts.join(', ')})`,
          flexShrink: 0,
        }}
      />
      {/* Legend */}
      <Box sx={{ flex: 1 }}>
        {nonZeroSlices.map((slice) => (
          <Box key={slice.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: slice.color }} />
            <Typography variant="body2" sx={{ flex: 1 }}>
              {slice.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {((slice.value / total) * 100).toFixed(1)}%
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function StoragePage() {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        const response = await apiClient.get<StorageStats>('/storage-stats')
        setStats(response.data)
        setError(null)
      } catch (err) {
        console.error('Failed to load storage stats:', err)
        setError('Failed to load storage statistics')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // Prepare pie chart data for by_type
  const typeSlices: PieSlice[] = stats
    ? [
        { label: 'MySQL', value: stats.by_type.mysql.size_bytes, color: '#1976d2' },
        { label: 'PostgreSQL', value: stats.by_type.postgresql.size_bytes, color: '#9c27b0' },
        { label: 'SQL Server', value: stats.by_type.sqlserver.size_bytes, color: '#2e7d32' },
        { label: 'Azure SQL', value: stats.by_type.azure_sql.size_bytes, color: '#ed6c02' },
      ]
    : []

  // Calculate max size for progress bars
  const maxSize = stats?.by_database.reduce((max, db) => Math.max(max, db.size_bytes), 0) || 1

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Typography variant="h4" gutterBottom>
        Storage
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        View storage usage statistics and breakdown by database
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stat Boxes */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <StatBox
            title="Total Storage Used"
            value={stats?.total_size_formatted || '-'}
            icon={<StorageIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatBox
            title="Total Backup Files"
            value={stats?.total_backup_count || 0}
            icon={<FolderIcon sx={{ color: '#9c27b0' }} />}
            color="#9c27b0"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatBox
            title="Databases"
            value={stats?.by_database.length || 0}
            icon={<PieChartIcon sx={{ color: '#2e7d32' }} />}
            color="#2e7d32"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Storage by Type */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Storage by Database Type
              </Typography>
              {loading ? (
                <Skeleton variant="circular" width={150} height={150} sx={{ mx: 'auto' }} />
              ) : (
                <SimplePieChart slices={typeSlices} total={stats?.total_size_bytes || 0} />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Type Breakdown Table */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Type Breakdown
              </Typography>
              {loading ? (
                <Box>
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} height={50} sx={{ my: 1 }} />
                  ))}
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Size</TableCell>
                        <TableCell align="right">% of Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {[
                        { type: 'mysql', label: 'MySQL', data: stats?.by_type.mysql },
                        { type: 'postgresql', label: 'PostgreSQL', data: stats?.by_type.postgresql },
                        { type: 'sqlserver', label: 'SQL Server', data: stats?.by_type.sqlserver },
                        { type: 'azure_sql', label: 'Azure SQL', data: stats?.by_type.azure_sql },
                      ]
                        .filter((t) => t.data && t.data.size_bytes > 0)
                        .map((t) => (
                          <TableRow key={t.type}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 1,
                                    bgcolor: getDatabaseTypeColor(t.type),
                                  }}
                                />
                                {t.label}
                              </Box>
                            </TableCell>
                            <TableCell align="right">{t.data?.size_formatted}</TableCell>
                            <TableCell align="right">
                              {stats && stats.total_size_bytes > 0
                                ? ((t.data?.size_bytes || 0) / stats.total_size_bytes * 100).toFixed(1)
                                : 0}
                              %
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Storage by Database */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Storage by Database
          </Typography>
          {loading ? (
            <Box>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={70} sx={{ my: 1 }} />
              ))}
            </Box>
          ) : stats?.by_database.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No backup data available
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Database</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Backups</TableCell>
                    <TableCell align="right">Size</TableCell>
                    <TableCell sx={{ width: '30%' }}>Usage</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats?.by_database.map((db) => (
                    <TableRow key={db.database_id} hover>
                      <TableCell>
                        <Typography variant="body1" fontWeight={500}>
                          {db.database_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={db.database_type.toUpperCase()}
                          sx={{
                            bgcolor: `${getDatabaseTypeColor(db.database_type)}20`,
                            color: getDatabaseTypeColor(db.database_type),
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">{db.backup_count}</TableCell>
                      <TableCell align="right">{db.size_formatted}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ flex: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={(db.size_bytes / maxSize) * 100}
                              sx={{
                                height: 8,
                                borderRadius: 1,
                                bgcolor: 'action.hover',
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: getDatabaseTypeColor(db.database_type),
                                },
                              }}
                            />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 45 }}>
                            {stats.total_size_bytes > 0
                              ? ((db.size_bytes / stats.total_size_bytes) * 100).toFixed(1)
                              : 0}
                            %
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
