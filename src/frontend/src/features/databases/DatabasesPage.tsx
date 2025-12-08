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
import type { DatabaseConfig, CreateDatabaseInput, BackupPolicy, BackupPoliciesResponse } from '../../types'
import { DatabaseFormDialog } from './DatabaseFormDialog'
import { apiClient } from '../../api/client'
import { databasesApi } from '../../api/databases'
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
  host: string
  policy: string
}

const emptyFilters: DatabaseFilters = { type: '', host: '', policy: '' }

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

  // Filter state
  const [filters, setFilters] = useState<DatabaseFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<DatabaseFilters>(emptyFilters)

  // Stats (computed from ALL databases, not filtered)
  const [stats, setStats] = useState({ total: 0, mysql: 0, postgresql: 0, sqlserver: 0, hosts: 0 })
  const [uniqueHosts, setUniqueHosts] = useState<string[]>([])

  // Track initial load
  const initialLoadDone = useRef(false)

  // Load policies on mount
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
    fetchPolicies()
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
        host: pageFilters.host || undefined,
        policyId: pageFilters.policy || undefined,
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
        const hosts = new Set(dbs.map((db) => db.host))
        setStats({
          total: dbs.length,
          mysql: dbs.filter((db) => db.database_type === 'mysql').length,
          postgresql: dbs.filter((db) => db.database_type === 'postgresql').length,
          sqlserver: dbs.filter((db) => db.database_type === 'sqlserver' || db.database_type === 'azure_sql').length,
          hosts: hosts.size,
        })
        setUniqueHosts([...hosts].sort())
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
    filters.host !== appliedFilters.host ||
    filters.policy !== appliedFilters.policy

  // Check if any filters are active
  const hasActiveFilters = appliedFilters.type !== '' ||
    appliedFilters.host !== '' ||
    appliedFilters.policy !== ''

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
      const hosts = new Set(dbs.map((db) => db.host))
      setStats({
        total: dbs.length,
        mysql: dbs.filter((db) => db.database_type === 'mysql').length,
        postgresql: dbs.filter((db) => db.database_type === 'postgresql').length,
        sqlserver: dbs.filter((db) => db.database_type === 'sqlserver' || db.database_type === 'azure_sql').length,
        hosts: hosts.size,
      })
      setUniqueHosts([...hosts].sort())
    })
  }

  const handleDeleteClick = (db: DatabaseConfig) => {
    setSelectedDb(db)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedDb) {
      try {
        await deleteMutation.mutateAsync(selectedDb.id)
        setSnackbar({ open: true, message: 'Database deleted successfully', severity: 'success' })
        handleRefresh()
      } catch {
        setSnackbar({ open: true, message: 'Failed to delete database', severity: 'error' })
      }
    }
    setDeleteDialogOpen(false)
    setSelectedDb(null)
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

  // Table columns definition
  const tableColumns: Column<DatabaseConfig>[] = useMemo(() => [
    {
      id: 'name',
      label: 'Name',
      render: (db) => (
        <Typography variant="body1" fontWeight={500}>
          {db.name}
        </Typography>
      ),
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
      id: 'host',
      label: 'Host',
      render: (db) => `${db.host}:${db.port}`,
      hideInMobileSummary: true,
    },
    {
      id: 'database',
      label: 'Database',
      render: (db) => db.database_name,
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
              {db.policy_id || 'No policy'}
            </Typography>
          )
        }
        return (
          <Tooltip title={policy.description || 'Backup policy'}>
            <Box>
              <Typography variant="body2" fontWeight={500}>
                {policy.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                {getPolicySummary(policy)}
              </Typography>
            </Box>
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
  ], [policies])

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
            value={stats.hosts}
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
          value={filters.host}
          options={uniqueHosts.map(h => ({ value: h, label: h }))}
          allLabel="All Hosts"
          onChange={(value) => setFilters({ ...filters, host: value })}
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
            <TableSkeleton rows={6} columns={5} />
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
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Database</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedDb?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
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
