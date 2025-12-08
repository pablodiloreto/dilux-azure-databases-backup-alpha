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
  Chip,
  LinearProgress,
  Button,
  Collapse,
  IconButton,
} from '@mui/material'
import {
  Storage as StorageIcon,
  Folder as FolderIcon,
  Dns as ServersIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material'
import { apiClient } from '../../api/client'

interface StorageByDatabase {
  database_id: string
  database_name: string
  database_type: string
  engine_id?: string
  size_bytes: number
  size_formatted: string
  backup_count: number
}

interface StorageByEngine {
  engine_id: string
  engine_name: string
  engine_type: string
  size_bytes: number
  size_formatted: string
  backup_count: number
  database_count: number
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
  by_engine: StorageByEngine[]
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

function getEngineTypeColor(type: string): string {
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

function getEngineTypeLabel(type: string): string {
  switch (type) {
    case 'mysql':
      return 'MySQL'
    case 'postgresql':
      return 'PostgreSQL'
    case 'sqlserver':
      return 'SQL Server'
    case 'azure_sql':
      return 'Azure SQL'
    default:
      return type.toUpperCase()
  }
}

// Simple horizontal bar visualization
interface TypeBarProps {
  types: { label: string; value: number; formatted: string; color: string }[]
  total: number
}

function TypeBars({ types, total }: TypeBarProps) {
  const nonZero = types.filter(t => t.value > 0)

  if (total === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Typography color="text.secondary" variant="body2">No data</Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Stacked bar */}
      <Box sx={{ display: 'flex', height: 24, borderRadius: 1, overflow: 'hidden', mb: 2 }}>
        {nonZero.map((t) => (
          <Box
            key={t.label}
            sx={{
              width: `${(t.value / total) * 100}%`,
              bgcolor: t.color,
              minWidth: t.value > 0 ? 4 : 0,
            }}
          />
        ))}
      </Box>
      {/* Legend */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {nonZero.map((t) => (
          <Box key={t.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color }} />
            <Typography variant="caption" color="text.secondary">
              {t.label}: {t.formatted} ({((t.value / total) * 100).toFixed(0)}%)
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
  const [expandedEngines, setExpandedEngines] = useState<Set<string>>(new Set())

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

  useEffect(() => {
    fetchStats()
  }, [])

  const toggleEngine = (engineId: string) => {
    setExpandedEngines(prev => {
      const next = new Set(prev)
      if (next.has(engineId)) {
        next.delete(engineId)
      } else {
        next.add(engineId)
      }
      return next
    })
  }

  // Prepare type bar data
  const typeData = stats
    ? [
        { label: 'MySQL', value: stats.by_type.mysql.size_bytes, formatted: stats.by_type.mysql.size_formatted, color: '#1976d2' },
        { label: 'PostgreSQL', value: stats.by_type.postgresql.size_bytes, formatted: stats.by_type.postgresql.size_formatted, color: '#9c27b0' },
        { label: 'SQL Server', value: stats.by_type.sqlserver.size_bytes, formatted: stats.by_type.sqlserver.size_formatted, color: '#2e7d32' },
        { label: 'Azure SQL', value: stats.by_type.azure_sql.size_bytes, formatted: stats.by_type.azure_sql.size_formatted, color: '#ed6c02' },
      ]
    : []

  // Calculate max size for engine progress bars
  const maxEngineSize = stats?.by_engine.reduce((max, e) => Math.max(max, e.size_bytes), 0) || 1

  // Group databases by engine
  const databasesByEngine: Record<string, StorageByDatabase[]> = {}
  const databasesWithoutEngine: StorageByDatabase[] = []

  stats?.by_database.forEach(db => {
    if (db.engine_id) {
      if (!databasesByEngine[db.engine_id]) {
        databasesByEngine[db.engine_id] = []
      }
      databasesByEngine[db.engine_id].push(db)
    } else {
      databasesWithoutEngine.push(db)
    }
  })

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4">Storage</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchStats}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Storage usage statistics for backup files
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Stat Boxes */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatBox
            title="Total Storage"
            value={stats?.total_size_formatted || '-'}
            icon={<StorageIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={loading}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatBox
            title="Backup Files"
            value={stats?.total_backup_count || 0}
            icon={<FolderIcon sx={{ color: '#9c27b0' }} />}
            color="#9c27b0"
            loading={loading}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatBox
            title="Servers"
            value={stats?.by_engine.length || 0}
            icon={<ServersIcon sx={{ color: '#2e7d32' }} />}
            color="#2e7d32"
            loading={loading}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatBox
            title="Databases"
            value={stats?.by_database.length || 0}
            icon={<StorageIcon sx={{ color: '#ed6c02' }} />}
            color="#ed6c02"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Storage by Type - compact bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Storage by Database Type
          </Typography>
          {loading ? (
            <Skeleton height={60} />
          ) : (
            <TypeBars types={typeData} total={stats?.total_size_bytes || 0} />
          )}
        </CardContent>
      </Card>

      {/* Storage by Server */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Storage by Server
          </Typography>
          {loading ? (
            <Box>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={70} sx={{ my: 0.5 }} />
              ))}
            </Box>
          ) : stats?.by_engine.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No servers with backup data
            </Typography>
          ) : (
            <Box>
              {stats?.by_engine.map((engine) => {
                const isExpanded = expandedEngines.has(engine.engine_id)
                const engineDatabases = databasesByEngine[engine.engine_id] || []

                return (
                  <Box
                    key={engine.engine_id}
                    sx={{
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    {/* Engine row */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        py: 1.5,
                        cursor: engineDatabases.length > 0 ? 'pointer' : 'default',
                      }}
                      onClick={() => engineDatabases.length > 0 && toggleEngine(engine.engine_id)}
                    >
                      {engineDatabases.length > 0 && (
                        <IconButton size="small" sx={{ p: 0 }}>
                          {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      )}
                      <Box sx={{ minWidth: 140, flex: '0 0 auto' }}>
                        <Typography variant="body2" fontWeight={500}>
                          {engine.engine_name}
                        </Typography>
                        <Chip
                          size="small"
                          label={getEngineTypeLabel(engine.engine_type)}
                          sx={{
                            mt: 0.5,
                            bgcolor: `${getEngineTypeColor(engine.engine_type)}20`,
                            color: getEngineTypeColor(engine.engine_type),
                            fontSize: '0.7rem',
                            height: 20,
                          }}
                        />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={(engine.size_bytes / maxEngineSize) * 100}
                          sx={{
                            height: 10,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: getEngineTypeColor(engine.engine_type),
                            },
                          }}
                        />
                      </Box>
                      <Box sx={{ minWidth: 100, textAlign: 'right' }}>
                        <Typography variant="body2" fontWeight={500}>{engine.size_formatted}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {engine.database_count} DB · {engine.backup_count} files
                        </Typography>
                      </Box>
                    </Box>

                    {/* Expanded databases */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ pl: 5, pb: 1.5 }}>
                        {engineDatabases.map((db) => (
                          <Box
                            key={db.database_id}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              py: 0.75,
                              pl: 1,
                              borderLeft: '2px solid',
                              borderColor: 'divider',
                            }}
                          >
                            <Typography variant="body2" sx={{ flex: 1 }}>
                              {db.database_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {db.size_formatted} · {db.backup_count} files
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Box>
                )
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Databases without Server (legacy) */}
      {databasesWithoutEngine.length > 0 && !loading && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Databases without Server
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These databases have backups but are not associated with a server
            </Typography>
            <Box>
              {databasesWithoutEngine.map((db) => (
                <Box
                  key={db.database_id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={500}>
                      {db.database_name}
                    </Typography>
                    <Chip
                      size="small"
                      label={getEngineTypeLabel(db.database_type)}
                      sx={{
                        mt: 0.5,
                        bgcolor: `${getEngineTypeColor(db.database_type)}20`,
                        color: getEngineTypeColor(db.database_type),
                        fontSize: '0.7rem',
                        height: 20,
                      }}
                    />
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2">{db.size_formatted}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {db.backup_count} files
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
