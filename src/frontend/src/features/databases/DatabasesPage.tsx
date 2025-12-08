import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  IconButton,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Tooltip,
  Grid,
  Paper,
  Skeleton,
  FormControlLabel,
  Checkbox,
} from '@mui/material'
import {
  Add as AddIcon,
  PlayArrow as PlayIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Storage as StorageIcon,
  Dns as DnsIcon,
} from '@mui/icons-material'
import { useDeleteDatabase, useTriggerBackup, useCreateDatabase, useUpdateDatabase } from '../../hooks/useDatabases'
import type { DatabaseConfig, CreateDatabaseInput, BackupPolicy, BackupPoliciesResponse, Engine } from '../../types'
import { DatabaseFormDialog } from './DatabaseFormDialog'
import { apiClient } from '../../api/client'
import { databasesApi } from '../../api/databases'
import { enginesApi } from '../../api/engines'
import { getPolicySummary } from '../../utils/format'
import { FilterBar, FilterSelect, LoadMore, ResponsiveTable, Column, LoadingOverlay, TableSkeleton } from '../../components/common'
import { useSettings } from '../../contexts/SettingsContext'

const DATABASE_TYPES = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'azure_sql', label: 'Azure SQL' },
]

function getDatabaseTypeColor(type: string): 'primary' | 'secondary' | 'success' | 'warning' {
  switch (type) {
    case 'mysql':
      return 'primary'
    case 'postgresql':
      return 'secondary'
    case 'sqlserver':
      return 'success'
    case 'azure_sql':
      return 'warning'
    default:
      return 'primary'
  }
}

interface StatBoxProps {
  title: string
  value: number | string
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
            <Skeleton width={40} height={36} />
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

interface DatabaseFilters {
  type: string
  policy: string
  server: string
}

const emptyFilters: DatabaseFilters = { type: '', policy: '', server: '' }

export function DatabasesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { settings } = useSettings()

  // Data state
  const [databases, setDatabases] = useState<DatabaseConfig[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Mutations
  const deleteMutation = useDeleteDatabase()
  const triggerBackupMutation = useTriggerBackup()
  const createMutation = useCreateDatabase()
  const updateMutation = useUpdateDatabase()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [selectedDb, setSelectedDb] = useState<DatabaseConfig | null>(null)
  const [backupInProgress, setBackupInProgress] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })
  const [policies, setPolicies] = useState<Map<string, BackupPolicy>>(new Map())
  const [policiesList, setPoliciesList] = useState<BackupPolicy[]>([])
  const [serversList, setServersList] = useState<Engine[]>([])

  // Delete dialog state
  const [deleteBackups, setDeleteBackups] = useState(false)
  const [backupStats, setBackupStats] = useState<{ count: number; size: string } | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<DatabaseFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<DatabaseFilters>(emptyFilters)

  // Stats (computed from ALL databases, not filtered)
  const [stats, setStats] = useState({ total: 0, mysql: 0, postgresql: 0, sqlserver: 0, servers: 0 })

  // Track initial load
  const initialLoadDone = useRef(false)

  // Load policies and engines on mount
  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const response = await apiClient.get<BackupPoliciesResponse>('/backup-policies')
        const policyMap = new Map<string, BackupPolicy>()
        response.data.policies.forEach((p) => policyMap.set(p.id, p))
        setPolicies(policyMap)
        setPoliciesList(response.data.policies)
      } catch (err) {
        console.error('Failed to load policies:', err)
      }
    }
    const fetchServers = async () => {
      try {
        const response = await enginesApi.getAll()
        setServersList(response.items)
      } catch (err) {
        console.error('Failed to load servers:', err)
      }
    }
    fetchPolicies()
    fetchServers()
  }, [])

  // Fetch databases
  const fetchDatabases = useCallback(async (
    pageFilters: DatabaseFilters,
    offset: number = 0,
    append: boolean = false
  ) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await databasesApi.getAll({
        limit: settings.pageSize,
        offset,
        type: pageFilters.type || undefined,
        policyId: pageFilters.policy || undefined,
        engineId: pageFilters.server || undefined,
      })

      if (append) {
        setDatabases(prev => [...prev, ...result.databases])
      } else {
        setDatabases(result.databases)
      }
      setTotalCount(result.total)
      setHasMore(result.has_more)
    } catch (err) {
      console.error('Failed to load databases:', err)
      setError('Failed to load databases')
    } finally {
      setIsLoading(false)
    }
  }, [settings.pageSize])

  // Fetch stats (all databases without filters) on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const result = await databasesApi.getAll({})
        const dbs = result.databases
        const uniqueServers = new Set(dbs.map((db) => db.engine_id).filter(Boolean))
        setStats({
          total: dbs.length,
          mysql: dbs.filter((db) => db.database_type === 'mysql').length,
          postgresql: dbs.filter((db) => db.database_type === 'postgresql').length,
          sqlserver: dbs.filter((db) => db.database_type === 'sqlserver' || db.database_type === 'azure_sql').length,
          servers: uniqueServers.size,
        })
      } catch (err) {
        console.error('Failed to load stats:', err)
      }
    }
    fetchStats()
  }, [])

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      fetchDatabases(emptyFilters)
      initialLoadDone.current = true
    }
  }, [fetchDatabases])

  // Handle edit query param
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && databases.length > 0) {
      const dbToEdit = databases.find((db) => db.id === editId)
      if (dbToEdit) {
        setSelectedDb(dbToEdit)
        setFormDialogOpen(true)
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, databases, setSearchParams])

  // Check if filters have changed from applied
  const hasFilterChanges = filters.type !== appliedFilters.type ||
    filters.policy !== appliedFilters.policy ||
    filters.server !== appliedFilters.server

  // Check if any filters are active
  const hasActiveFilters = appliedFilters.type !== '' ||
    appliedFilters.policy !== '' ||
    appliedFilters.server !== ''

  const handleSearch = () => {
    setAppliedFilters({ ...filters })
    fetchDatabases(filters)
  }

  const handleClearFilters = () => {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    fetchDatabases(emptyFilters)
  }

  const handleLoadMore = () => {
    fetchDatabases(appliedFilters, databases.length, true)
  }

  const handleRefresh = () => {
    fetchDatabases(appliedFilters)
    // Also refresh stats
    databasesApi.getAll({}).then(result => {
      const dbs = result.databases
      const uniqueServers = new Set(dbs.map((db) => db.engine_id).filter(Boolean))
      setStats({
        total: dbs.length,
        mysql: dbs.filter((db) => db.database_type === 'mysql').length,
        postgresql: dbs.filter((db) => db.database_type === 'postgresql').length,
        sqlserver: dbs.filter((db) => db.database_type === 'sqlserver' || db.database_type === 'azure_sql').length,
        servers: uniqueServers.size,
      })
    })
  }

  const handleDeleteClick = async (db: DatabaseConfig) => {
    setSelectedDb(db)
    setDeleteBackups(false)
    setBackupStats(null)
    setDeleteDialogOpen(true)

    // Load backup stats
    setLoadingStats(true)
    try {
      const stats = await databasesApi.getBackupStats(db.id)
      setBackupStats({ count: stats.count, size: stats.total_size_formatted })
    } catch {
      setBackupStats(null)
    } finally {
      setLoadingStats(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (selectedDb) {
      try {
        await deleteMutation.mutateAsync({ id: selectedDb.id, deleteBackups })
        const msg = deleteBackups
          ? 'Database and backups deleted successfully'
          : 'Database deleted successfully'
        setSnackbar({ open: true, message: msg, severity: 'success' })
        handleRefresh()
      } catch (err) {
        setSnackbar({ open: true, message: err instanceof Error ? err.message : 'Failed to delete database', severity: 'error' })
      }
    }
    setDeleteDialogOpen(false)
    setSelectedDb(null)
    setDeleteBackups(false)
    setBackupStats(null)
  }

  const handleTriggerBackup = async (db: DatabaseConfig) => {
    setBackupInProgress(db.id)
    try {
      await triggerBackupMutation.mutateAsync(db.id)
      setSnackbar({ open: true, message: `Backup queued for ${db.name}. Check Backups page for status.`, severity: 'success' })
    } catch {
      setSnackbar({ open: true, message: 'Failed to trigger backup', severity: 'error' })
    } finally {
      setBackupInProgress(null)
    }
  }

  const handleAddClick = () => {
    setSelectedDb(null)
    setFormDialogOpen(true)
  }

  const handleEditClick = (db: DatabaseConfig) => {
    setSelectedDb(db)
    setFormDialogOpen(true)
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedDb(null)
  }

  const handleFormSubmit = async (data: CreateDatabaseInput) => {
    if (selectedDb) {
      await updateMutation.mutateAsync({ id: selectedDb.id, data })
      setSnackbar({ open: true, message: 'Database updated successfully', severity: 'success' })
    } else {
      await createMutation.mutateAsync(data)
      setSnackbar({ open: true, message: 'Database created successfully', severity: 'success' })
    }
    handleRefresh()
  }

  // Get server name for database
  const getServerName = (db: DatabaseConfig) => {
    if (db.engine_id) {
      const server = serversList.find(e => e.id === db.engine_id)
      return server?.name || 'Unknown Server'
    }
    return null
  }

  // Table columns definition - simplified with fewer columns
  const tableColumns: Column<DatabaseConfig>[] = useMemo(() => [
    {
      id: 'name',
      label: 'Database',
      render: (db) => {
        const serverName = getServerName(db)
        return (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {db.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {serverName ? `${serverName} / ${db.database_name}` : `${db.host}:${db.port}/${db.database_name}`}
            </Typography>
          </Box>
        )
      },
      hideInMobileSummary: true, // shown as title
    },
    {
      id: 'type',
      label: 'Type',
      render: (db) => (
        <Chip
          size="small"
          label={db.database_type.toUpperCase()}
          color={getDatabaseTypeColor(db.database_type)}
        />
      ),
    },
    {
      id: 'server',
      label: 'Server',
      render: (db) => {
        const serverName = getServerName(db)
        if (!serverName) {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          )
        }
        return (
          <Typography variant="body2">
            {serverName}
          </Typography>
        )
      },
      hideInMobileSummary: true,
    },
    {
      id: 'policy',
      label: 'Policy',
      render: (db) => {
        const policy = policies.get(db.policy_id)
        if (!policy) {
          return (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          )
        }
        return (
          <Tooltip title={`${policy.description || ''}\n${getPolicySummary(policy)}`}>
            <Typography variant="body2">
              {policy.name}
            </Typography>
          </Tooltip>
        )
      },
      hideInMobileSummary: true,
    },
    {
      id: 'status',
      label: 'Status',
      render: (db) => (
        <Chip
          size="small"
          label={db.enabled ? 'Enabled' : 'Disabled'}
          color={db.enabled ? 'success' : 'default'}
        />
      ),
    },
  ], [policies, serversList])

  if (error && databases.length === 0) {
    return (
      <Box sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4">Databases</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddClick}>
          Add Database
        </Button>
      </Box>

      {/* Stat Boxes */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="Total Databases"
            value={stats.total}
            icon={<StorageIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={isLoading && !initialLoadDone.current}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="Servers"
            value={stats.servers}
            icon={<DnsIcon sx={{ color: '#9c27b0' }} />}
            color="#9c27b0"
            loading={isLoading && !initialLoadDone.current}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="MySQL"
            value={stats.mysql}
            icon={<StorageIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={isLoading && !initialLoadDone.current}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="PostgreSQL"
            value={stats.postgresql}
            icon={<StorageIcon sx={{ color: '#9c27b0' }} />}
            color="#9c27b0"
            loading={isLoading && !initialLoadDone.current}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="SQL Server"
            value={stats.sqlserver}
            icon={<StorageIcon sx={{ color: '#2e7d32' }} />}
            color="#2e7d32"
            loading={isLoading && !initialLoadDone.current}
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <FilterBar
        hasActiveFilters={hasActiveFilters}
        hasChanges={hasFilterChanges}
        onSearch={handleSearch}
        onClear={handleClearFilters}
        isLoading={isLoading}
      >
        <FilterSelect
          value={filters.type}
          options={DATABASE_TYPES}
          allLabel="All Types"
          onChange={(value) => setFilters({ ...filters, type: value })}
        />
        <FilterSelect
          value={filters.server}
          options={serversList.map(s => ({ value: s.id, label: s.name }))}
          allLabel="All Servers"
          onChange={(value) => setFilters({ ...filters, server: value })}
        />
        <FilterSelect
          value={filters.policy}
          options={policiesList.map(p => ({ value: p.id, label: p.name }))}
          allLabel="All Policies"
          onChange={(value) => setFilters({ ...filters, policy: value })}
        />
      </FilterBar>

      {/* Results count when filtered */}
      {hasActiveFilters && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Showing {databases.length} of {totalCount} databases
        </Typography>
      )}

      {/* Table */}
      <Card sx={{ overflow: 'hidden', position: 'relative' }}>
        {/* Linear progress bar - visible when loading with existing data */}
        <LoadingOverlay loading={isLoading && databases.length > 0} />

        <CardContent sx={{ p: { xs: 1, sm: 0 } }}>
          {isLoading && databases.length === 0 ? (
            // Initial loading: show skeleton
            <TableSkeleton rows={6} columns={4} />
          ) : (
            <ResponsiveTable
              columns={tableColumns}
              data={databases}
              keyExtractor={(db) => db.id}
              mobileTitle={(db) => db.name}
              mobileSummaryColumns={['type', 'status']}
              actions={(db) => (
                <>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => handleTriggerBackup(db)}
                    title="Trigger Backup"
                    disabled={backupInProgress === db.id}
                  >
                    {backupInProgress === db.id ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      <PlayIcon />
                    )}
                  </IconButton>
                  <IconButton size="small" title="Edit" onClick={() => handleEditClick(db)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteClick(db)}
                    title="Delete"
                  >
                    <DeleteIcon />
                  </IconButton>
                </>
              )}
              emptyMessage={
                hasActiveFilters
                  ? 'No databases match the selected filters.'
                  : 'No databases configured. Click "Add Database" to get started.'
              }
            />
          )}

          {/* Load More */}
          <LoadMore
            currentCount={databases.length}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoading={isLoading}
            onLoadMore={handleLoadMore}
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        PaperProps={{ sx: { minWidth: 400, maxWidth: 450 } }}
      >
        <DialogTitle>Delete Database</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Are you sure you want to delete "{selectedDb?.name}"?
          </Typography>

          {/* Backup deletion option - always show with min height to prevent resize */}
          <Box sx={{ minHeight: 80 }}>
            {loadingStats ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Checking for backups...
                </Typography>
              </Box>
            ) : backupStats && backupStats.count > 0 ? (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={deleteBackups}
                    onChange={(e) => setDeleteBackups(e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">
                      Also delete {backupStats.count} backup{backupStats.count !== 1 ? 's' : ''} ({backupStats.size})
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Backup files will be permanently deleted
                    </Typography>
                  </Box>
                }
              />
            ) : backupStats && backupStats.count === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                No backups associated with this database.
              </Typography>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Database Form Dialog */}
      <DatabaseFormDialog
        open={formDialogOpen}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        database={selectedDb}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
