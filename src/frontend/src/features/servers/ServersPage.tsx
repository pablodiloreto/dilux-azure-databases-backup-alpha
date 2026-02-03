import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
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
  Edit as EditIcon,
  Delete as DeleteIcon,
  Storage as StorageIcon,
  Dns as DnsIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material'
import type { Engine, EngineType, CreateEngineInput } from '../../types'
import { ServerFormDialog } from './ServerFormDialog'
import { DiscoverDialog } from './DiscoverDialog'
import { enginesApi } from '../../api/engines'
import { FilterBar, FilterSelect, LoadMore, ResponsiveTable, Column, LoadingOverlay, TableSkeleton } from '../../components/common'
import { useSettings } from '../../contexts/SettingsContext'

const SERVER_TYPES = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlserver', label: 'SQL Server' },
]

function getServerTypeColor(type: EngineType): 'primary' | 'secondary' | 'success' {
  switch (type) {
    case 'mysql':
      return 'primary'
    case 'postgresql':
      return 'secondary'
    case 'sqlserver':
      return 'success'
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

interface ServerFilters {
  type: string
}

const emptyFilters: ServerFilters = { type: '' }

export function ServersPage() {
  const { settings } = useSettings()

  // Data state
  const [servers, setServers] = useState<Engine[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [discoverDialogOpen, setDiscoverDialogOpen] = useState(false)
  const [selectedServer, setSelectedServer] = useState<Engine | null>(null)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })
  const [isDeleting, setIsDeleting] = useState(false)

  // Cascade delete options
  const [deleteDatabases, setDeleteDatabases] = useState(false)
  const [deleteBackups, setDeleteBackups] = useState(false)

  // Filter state
  const [filters, setFilters] = useState<ServerFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<ServerFilters>(emptyFilters)

  // Stats
  const [stats, setStats] = useState({ total: 0, mysql: 0, postgresql: 0, sqlserver: 0, databases: 0 })

  // Track initial load
  const initialLoadDone = useRef(false)

  // Fetch servers
  const fetchServers = useCallback(async (
    pageFilters: ServerFilters,
    offset: number = 0,
    append: boolean = false
  ) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await enginesApi.getAll({
        limit: settings.pageSize,
        offset,
        engine_type: pageFilters.type || undefined,
      })

      if (append) {
        setServers(prev => [...prev, ...result.items])
      } else {
        setServers(result.items)
      }
      setTotalCount(result.total)
      setHasMore(offset + result.items.length < result.total)
    } catch (err) {
      console.error('Failed to load servers:', err)
      setError('Failed to load servers')
    } finally {
      setIsLoading(false)
    }
  }, [settings.pageSize])

  // Fetch stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const result = await enginesApi.getAll({ limit: 1000 })
        const srvs = result.items
        const totalDbs = srvs.reduce((sum, e) => sum + (e.database_count || 0), 0)
        setStats({
          total: srvs.length,
          mysql: srvs.filter((e) => e.engine_type === 'mysql').length,
          postgresql: srvs.filter((e) => e.engine_type === 'postgresql').length,
          sqlserver: srvs.filter((e) => e.engine_type === 'sqlserver').length,
          databases: totalDbs,
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
      fetchServers(emptyFilters)
      initialLoadDone.current = true
    }
  }, [fetchServers])

  // Check if filters have changed
  const hasFilterChanges = filters.type !== appliedFilters.type

  // Check if any filters are active
  const hasActiveFilters = appliedFilters.type !== ''

  const handleSearch = () => {
    setAppliedFilters({ ...filters })
    fetchServers(filters)
  }

  const handleClearFilters = () => {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    fetchServers(emptyFilters)
  }

  const handleLoadMore = () => {
    fetchServers(appliedFilters, servers.length, true)
  }

  const handleRefresh = () => {
    fetchServers(appliedFilters)
    // Also refresh stats
    enginesApi.getAll({ limit: 1000 }).then(result => {
      const srvs = result.items
      const totalDbs = srvs.reduce((sum, e) => sum + (e.database_count || 0), 0)
      setStats({
        total: srvs.length,
        mysql: srvs.filter((e) => e.engine_type === 'mysql').length,
        postgresql: srvs.filter((e) => e.engine_type === 'postgresql').length,
        sqlserver: srvs.filter((e) => e.engine_type === 'sqlserver').length,
        databases: totalDbs,
      })
    })
  }

  const handleDeleteClick = (server: Engine) => {
    setSelectedServer(server)
    setDeleteDatabases(false)
    setDeleteBackups(false)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedServer) {
      setIsDeleting(true)
      try {
        const hasDatabases = (selectedServer.database_count || 0) > 0
        const result = await enginesApi.delete(selectedServer.id, {
          deleteDatabases: hasDatabases ? deleteDatabases : undefined,
          deleteBackups: hasDatabases && deleteDatabases ? deleteBackups : undefined,
        })

        let msg = 'Server deleted successfully'
        if (result.databases_deleted && result.databases_deleted > 0) {
          msg = `Server and ${result.databases_deleted} database(s) deleted`
          if (result.backups_deleted && result.backups_deleted.deleted_files > 0) {
            msg += ` (${result.backups_deleted.deleted_files} backup files removed)`
          }
        }
        setSnackbar({ open: true, message: msg, severity: 'success' })
        handleRefresh()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete server'
        setSnackbar({ open: true, message: errorMsg, severity: 'error' })
      } finally {
        setIsDeleting(false)
      }
    }
    setDeleteDialogOpen(false)
    setSelectedServer(null)
    setDeleteDatabases(false)
    setDeleteBackups(false)
  }

  const handleTestConnection = async (server: Engine) => {
    setTestingConnection(server.id)
    try {
      const result = await enginesApi.testConnection(server.id)
      if (result.success) {
        setSnackbar({
          open: true,
          message: `Connection successful (${result.latency_ms}ms)`,
          severity: 'success',
        })
      } else {
        setSnackbar({ open: true, message: result.message, severity: 'error' })
      }
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to test connection', severity: 'error' })
    } finally {
      setTestingConnection(null)
    }
  }

  const handleDiscoverClick = (server: Engine) => {
    setSelectedServer(server)
    setDiscoverDialogOpen(true)
  }

  const handleAddClick = () => {
    setSelectedServer(null)
    setFormDialogOpen(true)
  }

  const handleEditClick = (server: Engine) => {
    setSelectedServer(server)
    setFormDialogOpen(true)
  }

  const handleFormClose = () => {
    setFormDialogOpen(false)
    setSelectedServer(null)
  }

  const handleFormSubmit = async (data: CreateEngineInput) => {
    if (selectedServer) {
      const result = await enginesApi.update(selectedServer.id, data)
      const dbsUpdated = result.databases_updated
      const message = dbsUpdated && dbsUpdated > 0
        ? `Server updated. ${dbsUpdated} database(s) now use server credentials.`
        : 'Server updated successfully'
      setSnackbar({ open: true, message, severity: 'success' })
      handleRefresh()
    } else {
      const result = await enginesApi.create(data)
      // If discover_databases was checked, open DiscoverDialog automatically
      if (data.discover_databases && result.engine) {
        // Set selected server and open dialog BEFORE refresh to avoid state reset
        setSelectedServer(result.engine)
        setDiscoverDialogOpen(true)
        setSnackbar({
          open: true,
          message: 'Server created. Opening database discovery...',
          severity: 'success',
        })
        // Refresh will happen when discover dialog closes
      } else {
        handleRefresh()
        setSnackbar({ open: true, message: 'Server created successfully', severity: 'success' })
      }
    }
  }

  const handleDiscoverClose = () => {
    setDiscoverDialogOpen(false)
    setSelectedServer(null)
    handleRefresh()
  }

  // Table columns definition
  const tableColumns: Column<Engine>[] = useMemo(() => [
    {
      id: 'name',
      label: 'Name',
      render: (server) => (
        <Typography variant="body1" fontWeight={500}>
          {server.name}
        </Typography>
      ),
      hideInMobileSummary: true,
    },
    {
      id: 'type',
      label: 'Type',
      render: (server) => (
        <Chip
          size="small"
          label={server.engine_type.toUpperCase()}
          color={getServerTypeColor(server.engine_type)}
        />
      ),
    },
    {
      id: 'host',
      label: 'Host',
      render: (server) => `${server.host}:${server.port}`,
      hideInMobileSummary: true,
    },
    {
      id: 'auth',
      label: 'Auth',
      render: (server) => {
        if (!server.auth_method) {
          return (
            <Typography variant="body2" color="text.secondary">
              Not configured
            </Typography>
          )
        }
        const authLabels: Record<string, string> = {
          user_password: 'User/Password',
          managed_identity: 'Managed Identity',
        }
        return (
          <Typography variant="body2">
            {authLabels[server.auth_method] || server.auth_method}
          </Typography>
        )
      },
      hideInMobileSummary: true,
    },
    {
      id: 'databases',
      label: 'Databases',
      render: (server) => (
        <Chip
          size="small"
          label={server.database_count || 0}
          variant="outlined"
        />
      ),
    },
  ], [])

  if (error && servers.length === 0) {
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
        <Typography variant="h4">Servers</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddClick}>
          Add Server
        </Button>
      </Box>

      {/* Stat Boxes */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="Total Servers"
            value={stats.total}
            icon={<DnsIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
            loading={isLoading && !initialLoadDone.current}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2.4}>
          <StatBox
            title="Databases"
            value={stats.databases}
            icon={<StorageIcon sx={{ color: '#9c27b0' }} />}
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
          options={SERVER_TYPES}
          allLabel="All Types"
          onChange={(value) => setFilters({ ...filters, type: value })}
        />
      </FilterBar>

      {/* Results count when filtered */}
      {hasActiveFilters && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Showing {servers.length} of {totalCount} servers
        </Typography>
      )}

      {/* Table */}
      <Card sx={{ overflow: 'hidden', position: 'relative' }}>
        <LoadingOverlay loading={isLoading && servers.length > 0} />

        <CardContent sx={{ p: { xs: 1, sm: 0 } }}>
          {isLoading && servers.length === 0 ? (
            <TableSkeleton rows={6} columns={5} />
          ) : (
            <ResponsiveTable
              columns={tableColumns}
              data={servers}
              keyExtractor={(server) => server.id}
              mobileTitle={(server) => server.name}
              mobileSummaryColumns={['type', 'databases']}
              actions={(server) => (
                <>
                  <Tooltip title="Test Connection">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleTestConnection(server)}
                      disabled={testingConnection === server.id || !server.auth_method}
                    >
                      {testingConnection === server.id ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : (
                        <CheckCircleIcon />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Discover Databases">
                    <IconButton
                      size="small"
                      onClick={() => handleDiscoverClick(server)}
                      disabled={!server.auth_method}
                    >
                      <SearchIcon />
                    </IconButton>
                  </Tooltip>
                  <IconButton size="small" title="Edit" onClick={() => handleEditClick(server)}>
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteClick(server)}
                    title="Delete"
                  >
                    <DeleteIcon />
                  </IconButton>
                </>
              )}
              emptyMessage={
                hasActiveFilters
                  ? 'No servers match the selected filters.'
                  : 'No servers configured. Click "Add Server" to get started.'
              }
            />
          )}

          {/* Load More */}
          <LoadMore
            currentCount={servers.length}
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
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        PaperProps={{ sx: { minWidth: 420, maxWidth: 480 } }}
      >
        <DialogTitle>Delete Server</DialogTitle>
        <DialogContent>
          <Box sx={{ minHeight: (selectedServer?.database_count || 0) > 0 ? 200 : 40 }}>
            <Typography sx={{ mb: 2 }}>
              Are you sure you want to delete "{selectedServer?.name}"?
            </Typography>

            {/* Cascade options when server has databases */}
            {(selectedServer?.database_count || 0) > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  This server has {selectedServer?.database_count} database(s) associated with it.
                </Typography>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={deleteDatabases}
                      onChange={(e) => {
                        setDeleteDatabases(e.target.checked)
                        if (!e.target.checked) setDeleteBackups(false)
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">
                        Delete all {selectedServer?.database_count} database(s) from this server
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        This will remove all database configurations.
                      </Typography>
                    </Box>
                  }
                />

                <Box sx={{ ml: 4, mt: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={deleteBackups}
                        onChange={(e) => setDeleteBackups(e.target.checked)}
                        disabled={!deleteDatabases}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" color={!deleteDatabases ? 'text.disabled' : 'text.primary'}>
                          Also delete all backup files
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          This will permanently delete all backup files.
                        </Typography>
                      </Box>
                    }
                  />
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : deleteDatabases && deleteBackups
              ? 'Delete All'
              : deleteDatabases
                ? 'Delete Server & Databases'
                : 'Delete Server'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Server Form Dialog */}
      <ServerFormDialog
        open={formDialogOpen}
        onClose={handleFormClose}
        onSubmit={handleFormSubmit}
        server={selectedServer}
      />

      {/* Discover Dialog */}
      {selectedServer && (
        <DiscoverDialog
          open={discoverDialogOpen}
          onClose={handleDiscoverClose}
          engine={selectedServer}
        />
      )}

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
