import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Button,
  Stack,
  Paper,
  Tooltip,
  Autocomplete,
} from '@mui/material'
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  FilterAltOff as ClearFiltersIcon,
  NavigateNext as NextIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Storage as StorageIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { Dayjs } from 'dayjs'
import { useDatabases } from '../../hooks/useDatabases'
import { backupsApi } from '../../api/backups'
import { databasesApi } from '../../api/databases'
import type { BackupResult, BackupFilters, DatabaseType, BackupStatus, DatabaseConfig } from '../../types'

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

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-'
  const mb = bytes / 1024 / 1024
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(2)} KB`
  }
  return `${mb.toFixed(2)} MB`
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`
}

interface StatsCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  color?: string
}

function StatsCard({ icon, label, value, color }: StatsCardProps) {
  return (
    <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
      <Box sx={{ color: color || 'primary.main' }}>{icon}</Box>
      <Box>
        <Typography variant="caption" color="textSecondary">
          {label}
        </Typography>
        <Typography variant="h6" fontWeight={600}>
          {value}
        </Typography>
      </Box>
    </Paper>
  )
}

const PAGE_SIZE = 25

export function BackupsPage() {
  // Data state
  const [backups, setBackups] = useState<BackupResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Filters
  const [databaseFilter, setDatabaseFilter] = useState<DatabaseConfig | null>(null)
  const [triggeredByFilter, setTriggeredByFilter] = useState<'manual' | 'scheduler' | ''>('')
  const [statusFilter, setStatusFilter] = useState<BackupStatus | ''>('')
  const [dbTypeFilter, setDbTypeFilter] = useState<DatabaseType | ''>('')
  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [endDate, setEndDate] = useState<Dayjs | null>(null)

  // Database autocomplete state
  const [dbSearchInput, setDbSearchInput] = useState('')
  const [dbOptions, setDbOptions] = useState<DatabaseConfig[]>([])
  const [dbTotalCount, setDbTotalCount] = useState(0)
  const [dbHasMore, setDbHasMore] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)

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
      // Reset to initial data when search is cleared
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

  // Build filters object
  const buildFilters = useCallback((): BackupFilters => ({
    databaseId: databaseFilter?.id || undefined,
    status: statusFilter || undefined,
    triggeredBy: triggeredByFilter || undefined,
    databaseType: dbTypeFilter || undefined,
    startDate: startDate?.format('YYYY-MM-DD'),
    endDate: endDate?.format('YYYY-MM-DD'),
  }), [databaseFilter, statusFilter, triggeredByFilter, dbTypeFilter, startDate, endDate])

  // Fetch backups (paged, sorted by date descending from server)
  const fetchBackups = useCallback(async (page: number = 1, append: boolean = false) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await backupsApi.getHistoryPaged({
        pageSize: PAGE_SIZE,
        page,
        filters: buildFilters(),
      })

      if (append) {
        setBackups((prev) => [...prev, ...response.backups])
      } else {
        setBackups(response.backups)
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
  }, [buildFilters])

  // Load data on mount and when filters change
  useEffect(() => {
    fetchBackups(1, false)
  }, [fetchBackups])

  // Load more (next page)
  const handleLoadMore = () => {
    if (hasMore) {
      fetchBackups(currentPage + 1, true)
    }
  }

  // Refresh
  const handleRefresh = () => {
    fetchBackups(1, false)
  }

  const handleClearFilters = () => {
    setDatabaseFilter(null)
    setTriggeredByFilter('')
    setStatusFilter('')
    setDbTypeFilter('')
    setStartDate(null)
    setEndDate(null)
  }

  const hasActiveFilters = databaseFilter || triggeredByFilter || statusFilter || dbTypeFilter || startDate || endDate

  const handleDownload = async (backup: BackupResult) => {
    if (!backup.blob_name) return

    try {
      const url = await backupsApi.getDownloadUrl(backup.blob_name)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to get download URL:', err)
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

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <StatsCard
            icon={<StorageIcon />}
            label="Loaded"
            value={`${stats.total}${hasMore ? '+' : ''}`}
          />
          <StatsCard
            icon={<SuccessIcon />}
            label="Success Rate"
            value={`${stats.successRate}%`}
            color="success.main"
          />
          <StatsCard
            icon={<ErrorIcon />}
            label="Failed"
            value={stats.failed}
            color="error.main"
          />
          <StatsCard
            icon={<ScheduleIcon />}
            label="Total Size"
            value={formatFileSize(stats.totalSize)}
          />
        </Stack>

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Autocomplete
              options={dbOptions}
              getOptionLabel={(option) => option.name}
              value={databaseFilter}
              onChange={(_, newValue) => {
                setDatabaseFilter(newValue)
                setDbSearchInput(newValue?.name || '')
              }}
              onInputChange={(_, value, reason) => {
                if (reason === 'input') {
                  setDbSearchInput(value)
                } else if (reason === 'clear') {
                  setDbSearchInput('')
                }
              }}
              inputValue={dbSearchInput}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              loading={dbLoading}
              filterOptions={(x) => x} // Disable client-side filtering
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Database"
                  size="small"
                  placeholder="All Databases"
                  helperText={dbHasMore && !dbSearchInput ? `Showing ${dbOptions.length} of ${dbTotalCount}. Type to search...` : undefined}
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
              sx={{ minWidth: 240 }}
              size="small"
            />

            <TextField
              select
              label="Type"
              value={dbTypeFilter}
              onChange={(e) => setDbTypeFilter(e.target.value as DatabaseType | '')}
              size="small"
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All Types</MenuItem>
              <MenuItem value="mysql">MySQL</MenuItem>
              <MenuItem value="postgresql">PostgreSQL</MenuItem>
              <MenuItem value="sqlserver">SQL Server</MenuItem>
            </TextField>

            <TextField
              select
              label="Triggered By"
              value={triggeredByFilter}
              onChange={(e) => setTriggeredByFilter(e.target.value as 'manual' | 'scheduler' | '')}
              size="small"
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="manual">Manual</MenuItem>
              <MenuItem value="scheduler">Scheduler</MenuItem>
            </TextField>

            <TextField
              select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BackupStatus | '')}
              size="small"
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All Status</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
              <MenuItem value="in_progress">In Progress</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
            </TextField>

            <DatePicker
              label="From"
              value={startDate}
              onChange={(value) => setStartDate(value)}
              slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
            />

            <DatePicker
              label="To"
              value={endDate}
              onChange={(value) => setEndDate(value)}
              slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
            />

            {hasActiveFilters && (
              <Button
                variant="text"
                startIcon={<ClearFiltersIcon />}
                onClick={handleClearFilters}
                color="inherit"
              >
                Clear Filters
              </Button>
            )}
          </Stack>
        </Paper>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Table */}
        <Card>
          <CardContent sx={{ p: 0 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Database</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Triggered By</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {backups.length > 0 ? (
                    backups.map((backup) => (
                      <TableRow key={backup.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {backup.database_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" textTransform="uppercase" fontSize="0.75rem">
                            {backup.database_type}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={backup.status}
                            color={getStatusColor(backup.status)}
                          />
                        </TableCell>
                        <TableCell>{formatFileSize(backup.file_size_bytes)}</TableCell>
                        <TableCell>{formatDuration(backup.duration_seconds)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={backup.triggered_by}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {new Date(backup.created_at).toLocaleDateString()}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {new Date(backup.created_at).toLocaleTimeString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
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
                          {backup.status === 'failed' && backup.error_message && (
                            <Tooltip title={backup.error_message}>
                              <Typography
                                variant="caption"
                                color="error"
                                sx={{
                                  display: 'block',
                                  maxWidth: 120,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  cursor: 'help'
                                }}
                              >
                                {backup.error_message}
                              </Typography>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : !isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        <Typography color="textSecondary" sx={{ py: 4 }}>
                          {hasActiveFilters
                            ? 'No backups match the current filters.'
                            : 'No backup history found.'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Loading / Load More */}
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
              {isLoading ? (
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
      </Box>
    </LocalizationProvider>
  )
}
