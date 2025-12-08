import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Paper,
  Tooltip,
  Autocomplete,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
} from '@mui/material'
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  NavigateNext as NextIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Storage as StorageIcon,
  Schedule as ScheduleIcon,
  Delete as DeleteIcon,
  DeleteSweep as DeleteSweepIcon,
} from '@mui/icons-material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { Dayjs } from 'dayjs'
import { useDatabases } from '../../hooks/useDatabases'
import { backupsApi } from '../../api/backups'
import { databasesApi } from '../../api/databases'
import { formatFileSize, formatDuration } from '../../utils'
import type { BackupResult, BackupFilters, DatabaseType, BackupStatus, DatabaseConfig } from '../../types'
import { FilterBar, FilterSelect, ResponsiveTable, Column, LoadingOverlay, TableSkeleton } from '../../components/common'
import { useSettings } from '../../contexts/SettingsContext'
import { useAuth } from '../../contexts/AuthContext'

const DATABASE_DROPDOWN_LIMIT = 50

function getStatusColor(status: string): 'success' | 'error' | 'warning' | 'info' | 'default' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'in_progress':
      return 'warning'
    case 'pending':
      return 'info'
    default:
      return 'default'
  }
}

function getTriggeredByColor(triggeredBy: string): 'info' | 'default' {
  return triggeredBy === 'scheduler' ? 'info' : 'default'
}

interface StatBoxProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
}

function StatBox({ title, value, icon, color }: StatBoxProps) {
  return (
    <Paper sx={{ p: 2, flex: '1 1 auto', minWidth: { xs: 'calc(50% - 8px)', sm: 'auto' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" noWrap>
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={500}>
            {value}
          </Typography>
        </Box>
        <Box sx={{ backgroundColor: `${color}20`, borderRadius: '50%', p: 1.5, display: 'flex' }}>
          {icon}
        </Box>
      </Box>
    </Paper>
  )
}

// Filter state type
interface FilterState {
  databaseId: string
  status: BackupStatus | ''
  dbType: DatabaseType | ''
  startDate: string
  endDate: string
}

const emptyFilters: FilterState = {
  databaseId: '',
  status: '',
  dbType: '',
  startDate: '',
  endDate: '',
}

export function BackupsPage() {
  const { settings } = useSettings()
  const { canDeleteBackups } = useAuth()

  // Data state
  const [backups, setBackups] = useState<BackupResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Filter state (current UI values)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  // Applied filters (what was searched)
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters)

  // Database autocomplete state
  const [databaseFilter, setDatabaseFilter] = useState<DatabaseConfig | null>(null)
  const [dbSearchInput, setDbSearchInput] = useState('')
  const [dbOptions, setDbOptions] = useState<DatabaseConfig[]>([])
  const [dbTotalCount, setDbTotalCount] = useState(0)
  const [dbHasMore, setDbHasMore] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)

  // Date pickers
  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [endDate, setEndDate] = useState<Dayjs | null>(null)

  // Delete functionality state
  const [selectedBackups, setSelectedBackups] = useState<Set<string>>(new Set())
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; backup?: BackupResult; bulk?: boolean }>({ open: false })
  const [deleting, setDeleting] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Initial load: get first 50 databases
  const { data: initialDbData } = useDatabases({ limit: DATABASE_DROPDOWN_LIMIT })

  // Update options when initial data loads
  useEffect(() => {
    if (initialDbData && !dbSearchInput) {
      setDbOptions(initialDbData.databases)
      setDbTotalCount(initialDbData.total)
      setDbHasMore(initialDbData.has_more)
    }
  }, [initialDbData, dbSearchInput])

  // Debounced search
  useEffect(() => {
    if (!dbSearchInput) {
      if (initialDbData) {
        setDbOptions(initialDbData.databases)
        setDbTotalCount(initialDbData.total)
        setDbHasMore(initialDbData.has_more)
      }
      return
    }

    const timer = setTimeout(async () => {
      setDbLoading(true)
      try {
        const result = await databasesApi.getAll({ search: dbSearchInput })
        setDbOptions(result.databases)
        setDbTotalCount(result.total)
        setDbHasMore(result.has_more)
      } catch (err) {
        console.error('Error searching databases:', err)
      } finally {
        setDbLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [dbSearchInput, initialDbData])

  // Track if initial load happened
  const initialLoadDone = useRef(false)

  // Build API filters from filter state
  const buildApiFilters = (filterState: FilterState): BackupFilters => ({
    databaseId: filterState.databaseId || undefined,
    status: filterState.status || undefined,
    databaseType: filterState.dbType || undefined,
    startDate: filterState.startDate || undefined,
    endDate: filterState.endDate || undefined,
  })

  // Fetch backups
  const fetchBackups = useCallback(async (page: number = 1, append: boolean = false, filterState: FilterState) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await backupsApi.getHistoryPaged({
        pageSize: settings.pageSize,
        page,
        filters: buildApiFilters(filterState),
      })

      if (append) {
        setBackups((prev) => [...prev, ...response.backups])
      } else {
        setBackups(response.backups)
        // Clear selection when fetching new data
        setSelectedBackups(new Set())
      }

      setCurrentPage(page)
      setTotalCount(response.total_count)
      setHasMore(response.has_more)
    } catch (err) {
      setError('Failed to load backup history. Please try again.')
      console.error('Error fetching backups:', err)
    } finally {
      setIsLoading(false)
    }
  }, [settings.pageSize])

  // Load data on mount only
  useEffect(() => {
    if (!initialLoadDone.current) {
      fetchBackups(1, false, emptyFilters)
      initialLoadDone.current = true
    }
  }, [fetchBackups])

  // Check if filters have changed from applied
  const hasFilterChanges =
    filters.databaseId !== appliedFilters.databaseId ||
    filters.status !== appliedFilters.status ||
    filters.dbType !== appliedFilters.dbType ||
    filters.startDate !== appliedFilters.startDate ||
    filters.endDate !== appliedFilters.endDate

  // Check if any filters are active (applied)
  const hasActiveFilters =
    appliedFilters.databaseId !== '' ||
    appliedFilters.status !== '' ||
    appliedFilters.dbType !== '' ||
    appliedFilters.startDate !== '' ||
    appliedFilters.endDate !== ''

  // Search with current filter values
  const handleSearch = () => {
    // Update filters with current date values
    const currentFilters: FilterState = {
      ...filters,
      databaseId: databaseFilter?.id || '',
      startDate: startDate?.format('YYYY-MM-DD') || '',
      endDate: endDate?.format('YYYY-MM-DD') || '',
    }
    setFilters(currentFilters)
    setAppliedFilters(currentFilters)
    fetchBackups(1, false, currentFilters)
  }

  const handleClearFilters = () => {
    // Reset all filter UI
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setDatabaseFilter(null)
    setDbSearchInput('')
    setStartDate(null)
    setEndDate(null)
    // Fetch with no filters
    fetchBackups(1, false, emptyFilters)
  }

  // Load more (next page with applied filters)
  const handleLoadMore = () => {
    if (hasMore) {
      fetchBackups(currentPage + 1, true, appliedFilters)
    }
  }

  // Refresh with current applied filters
  const handleRefresh = () => {
    fetchBackups(1, false, appliedFilters)
  }

  // Update filter state when UI changes
  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleDownload = async (backup: BackupResult) => {
    if (!backup.blob_name) return

    try {
      const url = await backupsApi.getDownloadUrl(backup.blob_name)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to get download URL:', err)
      setSnackbar({ open: true, message: 'Failed to get download URL', severity: 'error' })
    }
  }

  // Delete handlers
  const handleSelectBackup = (backupId: string) => {
    setSelectedBackups((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(backupId)) {
        newSet.delete(backupId)
      } else {
        newSet.add(backupId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    // Allow selecting completed (with files) and failed backups (records only)
    const deletableBackups = backups.filter((b) => b.status === 'completed' || b.status === 'failed')
    if (selectedBackups.size === deletableBackups.length) {
      setSelectedBackups(new Set())
    } else {
      setSelectedBackups(new Set(deletableBackups.map((b) => b.id)))
    }
  }

  const handleDeleteClick = (backup: BackupResult) => {
    setDeleteDialog({ open: true, backup })
  }

  const handleBulkDeleteClick = () => {
    if (selectedBackups.size === 0) return
    setDeleteDialog({ open: true, bulk: true })
  }

  const handleDeleteConfirm = async () => {
    setDeleting(true)
    try {
      if (deleteDialog.bulk) {
        // Separate backups with files (completed) from records only (failed)
        const selectedBackupsList = backups.filter((b) => selectedBackups.has(b.id))
        const backupsWithFiles = selectedBackupsList.filter((b) => b.blob_name)
        const backupsRecordsOnly = selectedBackupsList.filter((b) => !b.blob_name)

        let deletedCount = 0

        // Delete files (completed backups)
        if (backupsWithFiles.length > 0) {
          const blobNames = backupsWithFiles.map((b) => b.blob_name!)
          const result = await backupsApi.deleteBulk(blobNames)
          deletedCount += result.deleted
        }

        // Delete records only (failed backups)
        for (const backup of backupsRecordsOnly) {
          try {
            await backupsApi.deleteRecord(backup.id)
            deletedCount++
          } catch (err) {
            console.error(`Failed to delete record ${backup.id}:`, err)
          }
        }

        setSnackbar({ open: true, message: `Deleted ${deletedCount} backup(s)`, severity: 'success' })
        setSelectedBackups(new Set())
      } else if (deleteDialog.backup) {
        // Single delete
        if (deleteDialog.backup.blob_name) {
          // Has file - delete file (which also deletes blob)
          await backupsApi.delete(deleteDialog.backup.blob_name)
        } else {
          // No file (failed backup) - delete record only
          await backupsApi.deleteRecord(deleteDialog.backup.id)
        }
        setSnackbar({ open: true, message: 'Backup deleted', severity: 'success' })
      }
      // Refresh data
      fetchBackups(1, false, appliedFilters)
    } catch (err) {
      console.error('Failed to delete backup(s):', err)
      setSnackbar({ open: true, message: 'Failed to delete backup(s)', severity: 'error' })
    } finally {
      setDeleting(false)
      setDeleteDialog({ open: false })
    }
  }

  // Stats from current loaded backups
  const stats = {
    total: backups.length,
    completed: backups.filter((b) => b.status === 'completed').length,
    failed: backups.filter((b) => b.status === 'failed').length,
    totalSize: backups.reduce((acc, b) => acc + (b.file_size_bytes || 0), 0),
    get successRate() {
      const total = this.completed + this.failed
      return total > 0 ? Math.round((this.completed / total) * 100) : 0
    },
  }

  // Count of deletable backups (completed with files OR failed records)
  const deletableBackupsCount = backups.filter((b) => b.status === 'completed' || b.status === 'failed').length

  // Table columns definition
  const tableColumns: Column<BackupResult>[] = useMemo(() => {
    const columns: Column<BackupResult>[] = []

    // Add checkbox column if user can delete
    if (canDeleteBackups) {
      columns.push({
        id: 'select',
        label: '',
        render: (backup) => (
          // Allow selecting completed (with files) and failed (records only) backups
          backup.status === 'completed' || backup.status === 'failed' ? (
            <Checkbox
              size="small"
              checked={selectedBackups.has(backup.id)}
              onChange={() => handleSelectBackup(backup.id)}
              onClick={(e) => e.stopPropagation()}
            />
          ) : null
        ),
        hideInMobileSummary: true,
      })
    }

    columns.push(
      {
        id: 'database',
        label: 'Database',
        render: (backup) => (
          <Typography variant="body2" fontWeight={500}>
            {backup.database_name}
          </Typography>
        ),
        hideInMobileSummary: true, // shown as title
      },
      {
        id: 'type',
        label: 'Type',
        render: (backup) => (
          <Typography variant="body2" textTransform="uppercase" fontSize="0.75rem">
            {backup.database_type}
          </Typography>
        ),
        hideInMobileSummary: true,
      },
      {
        id: 'status',
        label: 'Status',
        render: (backup) => (
          <Chip
            size="small"
            label={backup.status}
            color={getStatusColor(backup.status)}
          />
        ),
      },
      {
        id: 'size',
        label: 'Size',
        render: (backup) => formatFileSize(backup.file_size_bytes),
        hideInMobileSummary: true,
      },
      {
        id: 'duration',
        label: 'Duration',
        render: (backup) => formatDuration(backup.duration_seconds),
        hideInMobileSummary: true,
      },
      {
        id: 'triggeredBy',
        label: 'Triggered By',
        render: (backup) => (
          <Chip
            size="small"
            label={backup.triggered_by}
            color={getTriggeredByColor(backup.triggered_by)}
            variant="outlined"
          />
        ),
        hideInMobileSummary: true,
      },
      {
        id: 'date',
        label: 'Date',
        render: (backup) => (
          <Box>
            <Typography variant="body2">
              {new Date(backup.created_at).toLocaleDateString()}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {new Date(backup.created_at).toLocaleTimeString()}
            </Typography>
          </Box>
        ),
      }
    )

    return columns
  }, [canDeleteBackups, selectedBackups])

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h4">Backup History</Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </Box>

        {/* Stats Bar */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <StatBox
            title="Loaded"
            value={`${stats.total}${hasMore ? '+' : ''}`}
            icon={<StorageIcon sx={{ color: '#1976d2' }} />}
            color="#1976d2"
          />
          <StatBox
            title="Success Rate"
            value={`${stats.successRate}%`}
            icon={<SuccessIcon sx={{ color: '#2e7d32' }} />}
            color="#2e7d32"
          />
          <StatBox
            title="Failed"
            value={stats.failed}
            icon={<ErrorIcon sx={{ color: '#d32f2f' }} />}
            color="#d32f2f"
          />
          <StatBox
            title="Total Size"
            value={formatFileSize(stats.totalSize)}
            icon={<ScheduleIcon sx={{ color: '#9c27b0' }} />}
            color="#9c27b0"
          />
        </Box>

        {/* Filters using FilterBar */}
        <FilterBar
          hasActiveFilters={hasActiveFilters}
          hasChanges={hasFilterChanges}
          onSearch={handleSearch}
          onClear={handleClearFilters}
          isLoading={isLoading}
        >
          <Autocomplete
            options={dbOptions}
            getOptionLabel={(option) => option.name}
            value={databaseFilter}
            onChange={(_, newValue) => {
              setDatabaseFilter(newValue)
              setDbSearchInput(newValue?.name || '')
              updateFilter('databaseId', newValue?.id || '')
            }}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') {
                setDbSearchInput(value)
              } else if (reason === 'clear') {
                setDbSearchInput('')
                updateFilter('databaseId', '')
              }
            }}
            inputValue={dbSearchInput}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={dbLoading}
            filterOptions={(x) => x}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="All Databases"
                helperText={dbHasMore && !dbSearchInput ? `${dbOptions.length} of ${dbTotalCount}` : undefined}
                FormHelperTextProps={{ sx: { mx: 0, mt: 0.5 } }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.database_type.toUpperCase()} - {option.host}
                  </Typography>
                </Box>
              </li>
            )}
            noOptionsText={dbSearchInput ? 'No databases found' : 'No databases'}
            sx={{ minWidth: 200 }}
            size="small"
          />

          <FilterSelect
            value={filters.dbType}
            options={[
              { value: 'mysql', label: 'MySQL' },
              { value: 'postgresql', label: 'PostgreSQL' },
              { value: 'sqlserver', label: 'SQL Server' },
            ]}
            allLabel="All Types"
            onChange={(value) => updateFilter('dbType', value as DatabaseType | '')}
          />

          <FilterSelect
            value={filters.status}
            options={[
              { value: 'completed', label: 'Completed' },
              { value: 'failed', label: 'Failed' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'pending', label: 'Pending' },
            ]}
            allLabel="All Status"
            onChange={(value) => updateFilter('status', value as BackupStatus | '')}
          />

          <DatePicker
            value={startDate}
            onChange={(value) => {
              setStartDate(value)
              updateFilter('startDate', value?.format('YYYY-MM-DD') || '')
            }}
            slotProps={{
              textField: {
                size: 'small',
                sx: { width: 160 },
                placeholder: 'From',
              },
            }}
          />

          <DatePicker
            value={endDate}
            onChange={(value) => {
              setEndDate(value)
              updateFilter('endDate', value?.format('YYYY-MM-DD') || '')
            }}
            slotProps={{
              textField: {
                size: 'small',
                sx: { width: 160 },
                placeholder: 'To',
              },
            }}
          />
        </FilterBar>

        {/* Bulk actions bar */}
        {canDeleteBackups && selectedBackups.size > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 1.5, bgcolor: 'action.selected', borderRadius: 1 }}>
            <Typography variant="body2" fontWeight={500}>
              {selectedBackups.size} backup(s) selected
            </Typography>
            <Button
              size="small"
              color="error"
              variant="contained"
              startIcon={<DeleteSweepIcon />}
              onClick={handleBulkDeleteClick}
            >
              Delete Selected
            </Button>
            <Button size="small" onClick={() => setSelectedBackups(new Set())}>
              Clear Selection
            </Button>
          </Box>
        )}

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Table */}
        <Card sx={{ overflow: 'hidden', position: 'relative' }}>
          {/* Linear progress bar - visible when loading with existing data */}
          <LoadingOverlay loading={isLoading && backups.length > 0} />

          <CardContent sx={{ p: { xs: 1, sm: 0 } }}>
            {/* Select All Row */}
            {canDeleteBackups && deletableBackupsCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Checkbox
                  size="small"
                  checked={deletableBackupsCount > 0 && selectedBackups.size === deletableBackupsCount}
                  indeterminate={selectedBackups.size > 0 && selectedBackups.size < deletableBackupsCount}
                  onChange={handleSelectAll}
                />
                <Typography variant="body2" color="text.secondary">
                  Select all deletable backups
                </Typography>
              </Box>
            )}

            {isLoading && backups.length === 0 ? (
              // Initial loading: show skeleton
              <TableSkeleton rows={8} columns={7} />
            ) : (
              <ResponsiveTable
                columns={tableColumns}
                data={backups}
                keyExtractor={(backup) => backup.id}
                mobileTitle={(backup) => backup.database_name}
                mobileSummaryColumns={['status', 'date']}
                actions={(backup) => (
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {backup.status === 'completed' && backup.blob_name && (
                      <Tooltip title="Download Backup">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleDownload(backup)}
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {backup.status === 'failed' && (
                      <Tooltip title={backup.error_message || 'Backup failed'}>
                        <IconButton size="small" color="error" sx={{ cursor: 'help' }}>
                          <ErrorIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* Delete button for completed and failed backups */}
                    {canDeleteBackups && (backup.status === 'completed' || backup.status === 'failed') && (
                      <Tooltip title={backup.blob_name ? 'Delete Backup' : 'Delete Record'}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteClick(backup)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                )}
                emptyMessage={
                  hasActiveFilters
                    ? 'No backups match the current filters.'
                    : 'No backup history found.'
                }
                size="small"
              />
            )}

            {/* Loading / Load More */}
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
              {isLoading && backups.length > 0 ? (
                <CircularProgress size={24} />
              ) : hasMore ? (
                <>
                  <Typography variant="caption" color="textSecondary">
                    Showing {backups.length} of {totalCount} backups
                  </Typography>
                  <Button
                    variant="outlined"
                    endIcon={<NextIcon />}
                    onClick={handleLoadMore}
                  >
                    Load More
                  </Button>
                </>
              ) : backups.length > 0 ? (
                <Typography variant="caption" color="textSecondary">
                  Showing all {totalCount} backups
                </Typography>
              ) : null}
            </Box>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialog.open} onClose={() => !deleting && setDeleteDialog({ open: false })}>
          <DialogTitle>
            {deleteDialog.bulk ? 'Delete Selected Backups?' : 'Delete Backup?'}
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              {deleteDialog.bulk
                ? `Are you sure you want to delete ${selectedBackups.size} selected backup(s)? This action cannot be undone.`
                : `Are you sure you want to delete the backup for "${deleteDialog.backup?.database_name}"? This action cannot be undone.`}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialog({ open: false })} disabled={deleting}>
              Cancel
            </Button>
            <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          message={snackbar.message}
        />
      </Box>
    </LocalizationProvider>
  )
}
