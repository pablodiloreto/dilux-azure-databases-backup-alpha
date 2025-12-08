import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  Button,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Paper,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Refresh as RefreshIcon,
  NavigateNext as NextIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { Dayjs } from 'dayjs'
import { auditApi } from '../../api/audit'
import { usersApi } from '../../api/users'
import { databasesApi } from '../../api/databases'
import { enginesApi } from '../../api/engines'
import type { User, DatabaseConfig, Engine } from '../../types'
import type {
  AuditLog,
  AuditFilters,
  AuditAction,
  AuditResourceType,
  AuditActionOption,
  AuditResourceTypeOption,
} from '../../types'

import { FilterBar, FilterSelect, LoadingOverlay, TableSkeleton, CardListSkeleton } from '../../components/common'
import { useSettings } from '../../contexts/SettingsContext'

type AuditStatus = 'success' | 'failed'

function getResourceTypeColor(resourceType: AuditResourceType): 'primary' | 'secondary' | 'info' | 'warning' | 'default' {
  switch (resourceType) {
    case 'backup':
      return 'primary'
    case 'database':
      return 'secondary'
    case 'policy':
      return 'info'
    case 'user':
      return 'warning'
    default:
      return 'default'
  }
}

function formatActionLabel(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Detail Dialog component
interface AuditDetailDialogProps {
  log: AuditLog | null
  open: boolean
  onClose: () => void
}

function AuditDetailDialog({ log, open, onClose }: AuditDetailDialogProps) {
  if (!log) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {log.status === 'success' ? (
            <SuccessIcon color="success" />
          ) : (
            <ErrorIcon color="error" />
          )}
          <span>{formatActionLabel(log.action)}</span>
        </Box>
        <Chip
          size="small"
          label={log.resource_type}
          color={getResourceTypeColor(log.resource_type)}
        />
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Time */}
          <Box>
            <Typography variant="caption" color="textSecondary">Time</Typography>
            <Typography variant="body2">
              {new Date(log.timestamp).toLocaleString()}
            </Typography>
          </Box>

          {/* User */}
          <Box>
            <Typography variant="caption" color="textSecondary">User</Typography>
            <Typography variant="body2">{log.user_email}</Typography>
          </Box>

          {/* Resource */}
          <Box>
            <Typography variant="caption" color="textSecondary">Resource</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              {log.resource_name}
            </Typography>
          </Box>

          {/* Resource ID */}
          <Box>
            <Typography variant="caption" color="textSecondary">Resource ID</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              {log.resource_id}
            </Typography>
          </Box>

          {/* IP Address */}
          {log.ip_address && log.ip_address !== 'unknown' && (
            <Box>
              <Typography variant="caption" color="textSecondary">IP Address</Typography>
              <Typography variant="body2">{log.ip_address}</Typography>
            </Box>
          )}

          {/* Error Message */}
          {log.error_message && (
            <Box>
              <Typography variant="caption" color="error">Error</Typography>
              <Typography variant="body2" color="error" sx={{ wordBreak: 'break-word' }}>
                {log.error_message}
              </Typography>
            </Box>
          )}

          {/* Details */}
          {log.details && Object.keys(log.details).length > 0 && (
            <Box>
              <Typography variant="caption" color="textSecondary">Details</Typography>
              <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'action.hover' }}>
                <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              </Paper>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} startIcon={<CloseIcon />}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// Mobile Card component
interface AuditCardProps {
  log: AuditLog
  onClick: () => void
}

function AuditCard({ log, onClick }: AuditCardProps) {
  return (
    <Paper
      sx={{
        p: 2,
        mb: 1,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        '&:active': { bgcolor: 'action.selected' },
      }}
      onClick={onClick}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {log.status === 'success' ? (
            <SuccessIcon color="success" fontSize="small" />
          ) : (
            <ErrorIcon color="error" fontSize="small" />
          )}
          <Typography variant="subtitle2" fontWeight={600}>
            {formatActionLabel(log.action)}
          </Typography>
        </Box>
        <Chip
          size="small"
          label={log.resource_type}
          color={getResourceTypeColor(log.resource_type)}
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
      </Box>
      <Typography variant="body2" color="textSecondary" noWrap sx={{ mb: 0.5 }}>
        {log.resource_name}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="textSecondary">
          {new Date(log.timestamp).toLocaleString()}
        </Typography>
        <Typography variant="caption" color="textSecondary" noWrap sx={{ maxWidth: 150 }}>
          {log.user_email}
        </Typography>
      </Box>
    </Paper>
  )
}

const USER_DROPDOWN_LIMIT = 50
const ENGINE_DROPDOWN_LIMIT = 50

// Filter state type
interface FilterState {
  action: AuditAction | ''
  resourceType: AuditResourceType | ''
  status: AuditStatus | ''
  userId: string
  startDate: string
  endDate: string
  databaseType: string  // Engine type filter (mysql, postgresql, sqlserver)
  engineId: string      // Server filter
  resourceName: string  // Alias/Target filter
}

const emptyFilters: FilterState = {
  action: '',
  resourceType: '',
  status: '',
  userId: '',
  startDate: '',
  endDate: '',
  databaseType: '',
  engineId: '',
  resourceName: '',
}

export function AuditPage() {
  const { settings } = useSettings()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  // Data state
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Detail dialog
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Filter options (loaded from API)
  const [actionOptions, setActionOptions] = useState<AuditActionOption[]>([])
  const [resourceTypeOptions, setResourceTypeOptions] = useState<AuditResourceTypeOption[]>([])

  // Filter state (current UI values)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  // Applied filters (what was searched)
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters)

  // Date pickers
  const [startDate, setStartDate] = useState<Dayjs | null>(null)
  const [endDate, setEndDate] = useState<Dayjs | null>(null)

  // User autocomplete state
  const [userFilter, setUserFilter] = useState<User | null>(null)
  const [userSearchInput, setUserSearchInput] = useState('')
  const [userOptions, setUserOptions] = useState<User[]>([])
  const [userTotalCount, setUserTotalCount] = useState(0)
  const [userHasMore, setUserHasMore] = useState(false)
  const [userLoading, setUserLoading] = useState(false)

  // Engine (Server) autocomplete state
  const [engineFilter, setEngineFilter] = useState<Engine | null>(null)
  const [engineSearchInput, setEngineSearchInput] = useState('')
  const [engineOptions, setEngineOptions] = useState<Engine[]>([])
  const [engineTotalCount, setEngineTotalCount] = useState(0)
  const [engineHasMore, setEngineHasMore] = useState(false)
  const [engineLoading, setEngineLoading] = useState(false)

  // Database alias autocomplete state
  const [aliasFilter, setAliasFilter] = useState<DatabaseConfig | null>(null)
  const [aliasSearchInput, setAliasSearchInput] = useState('')
  const [aliasOptions, setAliasOptions] = useState<DatabaseConfig[]>([])
  const [aliasTotalCount, setAliasTotalCount] = useState(0)
  const [aliasHasMore, setAliasHasMore] = useState(false)
  const [aliasLoading, setAliasLoading] = useState(false)

  // Track if initial load happened
  const initialLoadDone = useRef(false)

  // Load filter options, initial users, engines, and databases
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [actions, resourceTypes, usersResult, enginesResult, databasesResult] = await Promise.all([
          auditApi.getActions(),
          auditApi.getResourceTypes(),
          usersApi.getAll({ page_size: USER_DROPDOWN_LIMIT }),
          enginesApi.getAll({ limit: ENGINE_DROPDOWN_LIMIT }),
          databasesApi.getAll({ limit: USER_DROPDOWN_LIMIT }),
        ])
        setActionOptions(actions)
        setResourceTypeOptions(resourceTypes)
        setUserOptions(usersResult.users)
        setUserTotalCount(usersResult.total_count)
        setUserHasMore(usersResult.has_more)
        setEngineOptions(enginesResult.items)
        setEngineTotalCount(enginesResult.total)
        setEngineHasMore(enginesResult.items.length < enginesResult.total)
        setAliasOptions(databasesResult.databases)
        setAliasTotalCount(databasesResult.total)
        setAliasHasMore(databasesResult.has_more)
      } catch (err) {
        console.error('Error loading filter options:', err)
      }
    }
    loadOptions()
  }, [])

  // Debounced search for users
  useEffect(() => {
    if (!userSearchInput) {
      // Reset to initial users when search is cleared
      usersApi.getAll({ page_size: USER_DROPDOWN_LIMIT }).then((result) => {
        setUserOptions(result.users)
        setUserTotalCount(result.total_count)
        setUserHasMore(result.has_more)
      }).catch(console.error)
      return
    }

    const timer = setTimeout(async () => {
      setUserLoading(true)
      try {
        const result = await usersApi.getAll({ search: userSearchInput, page_size: USER_DROPDOWN_LIMIT })
        setUserOptions(result.users)
        setUserTotalCount(result.total_count)
        setUserHasMore(result.has_more)
      } catch (err) {
        console.error('Error searching users:', err)
      } finally {
        setUserLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [userSearchInput])

  // Debounced search for engines (servers)
  useEffect(() => {
    if (!engineSearchInput) {
      // Reset to initial engines when search is cleared
      enginesApi.getAll({ limit: ENGINE_DROPDOWN_LIMIT }).then((result) => {
        setEngineOptions(result.items)
        setEngineTotalCount(result.total)
        setEngineHasMore(result.items.length < result.total)
      }).catch(console.error)
      return
    }

    const timer = setTimeout(async () => {
      setEngineLoading(true)
      try {
        const result = await enginesApi.getAll({ search: engineSearchInput, limit: ENGINE_DROPDOWN_LIMIT })
        setEngineOptions(result.items)
        setEngineTotalCount(result.total)
        setEngineHasMore(result.items.length < result.total)
      } catch (err) {
        console.error('Error searching engines:', err)
      } finally {
        setEngineLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [engineSearchInput])

  // Debounced search for aliases (databases)
  useEffect(() => {
    if (!aliasSearchInput) {
      // Reset to initial databases when search is cleared
      databasesApi.getAll({ limit: USER_DROPDOWN_LIMIT }).then((result) => {
        setAliasOptions(result.databases)
        setAliasTotalCount(result.total)
        setAliasHasMore(result.has_more)
      }).catch(console.error)
      return
    }

    const timer = setTimeout(async () => {
      setAliasLoading(true)
      try {
        const result = await databasesApi.getAll({ search: aliasSearchInput, limit: USER_DROPDOWN_LIMIT })
        setAliasOptions(result.databases)
        setAliasTotalCount(result.total)
        setAliasHasMore(result.has_more)
      } catch (err) {
        console.error('Error searching databases:', err)
      } finally {
        setAliasLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [aliasSearchInput])

  // Build API filters from filter state
  const buildApiFilters = (filterState: FilterState): AuditFilters => ({
    action: filterState.action || undefined,
    resourceType: filterState.resourceType || undefined,
    status: filterState.status || undefined,
    userId: filterState.userId || undefined,
    startDate: filterState.startDate || undefined,
    endDate: filterState.endDate || undefined,
    databaseType: filterState.databaseType || undefined,
    engineId: filterState.engineId || undefined,
    resourceName: filterState.resourceName || undefined,
  })

  // Fetch audit logs
  const fetchLogs = useCallback(async (newOffset: number = 0, append: boolean = false, filterState: FilterState) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await auditApi.getLogs({
        limit: settings.pageSize,
        offset: newOffset,
        filters: buildApiFilters(filterState),
      })

      if (append) {
        setLogs((prev) => [...prev, ...response.logs])
      } else {
        setLogs(response.logs)
      }

      setOffset(newOffset)
      setTotalCount(response.total)
      setHasMore(response.has_more)
    } catch (err) {
      setError('Failed to load audit logs. Please try again.')
      console.error('Error fetching audit logs:', err)
    } finally {
      setIsLoading(false)
    }
  }, [settings.pageSize])

  // Load data on mount only
  useEffect(() => {
    if (!initialLoadDone.current) {
      fetchLogs(0, false, emptyFilters)
      initialLoadDone.current = true
    }
  }, [fetchLogs])

  // Check if filters have changed from applied
  const hasFilterChanges =
    filters.action !== appliedFilters.action ||
    filters.resourceType !== appliedFilters.resourceType ||
    filters.status !== appliedFilters.status ||
    filters.userId !== appliedFilters.userId ||
    filters.startDate !== appliedFilters.startDate ||
    filters.endDate !== appliedFilters.endDate ||
    filters.databaseType !== appliedFilters.databaseType ||
    filters.engineId !== appliedFilters.engineId ||
    filters.resourceName !== appliedFilters.resourceName

  // Check if any filters are active (applied)
  const hasActiveFilters =
    appliedFilters.action !== '' ||
    appliedFilters.resourceType !== '' ||
    appliedFilters.status !== '' ||
    appliedFilters.userId !== '' ||
    appliedFilters.startDate !== '' ||
    appliedFilters.endDate !== '' ||
    appliedFilters.databaseType !== '' ||
    appliedFilters.engineId !== '' ||
    appliedFilters.resourceName !== ''

  // Search with current filter values
  const handleSearch = () => {
    const currentFilters: FilterState = {
      ...filters,
      startDate: startDate?.format('YYYY-MM-DD') || '',
      endDate: endDate?.format('YYYY-MM-DD') || '',
    }
    setFilters(currentFilters)
    setAppliedFilters(currentFilters)
    fetchLogs(0, false, currentFilters)
  }

  const handleClearFilters = () => {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
    setUserFilter(null)
    setUserSearchInput('')
    setEngineFilter(null)
    setEngineSearchInput('')
    setAliasFilter(null)
    setAliasSearchInput('')
    setStartDate(null)
    setEndDate(null)
    fetchLogs(0, false, emptyFilters)
  }

  // Load more (next page with applied filters)
  const handleLoadMore = () => {
    if (hasMore) {
      fetchLogs(offset + settings.pageSize, true, appliedFilters)
    }
  }

  // Refresh with current applied filters
  const handleRefresh = () => {
    fetchLogs(0, false, appliedFilters)
  }

  // Update filter state when UI changes
  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  // Handle row click
  const handleRowClick = (log: AuditLog) => {
    setSelectedLog(log)
    setDetailOpen(true)
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h4">Audit</Typography>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isLoading}
          >
            Refresh
          </Button>
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
            options={userOptions}
            getOptionLabel={(option) => option.email}
            value={userFilter}
            onChange={(_, newValue) => {
              setUserFilter(newValue)
              setUserSearchInput(newValue?.email || '')
              updateFilter('userId', newValue?.id || '')
            }}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') {
                setUserSearchInput(value)
              } else if (reason === 'clear') {
                setUserSearchInput('')
                updateFilter('userId', '')
              }
            }}
            inputValue={userSearchInput}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={userLoading}
            filterOptions={(x) => x}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="All Users"
                helperText={userHasMore && !userSearchInput ? `${userOptions.length} of ${userTotalCount}` : undefined}
                FormHelperTextProps={{ sx: { mx: 0, mt: 0.5 } }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{option.email}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.role}
                  </Typography>
                </Box>
              </li>
            )}
            noOptionsText={userSearchInput ? 'No users found' : 'No users'}
            sx={{ minWidth: 220 }}
            size="small"
          />

          <FilterSelect
            value={filters.action}
            options={actionOptions.map((a) => ({ value: a.value, label: a.label }))}
            allLabel="All Actions"
            onChange={(value) => updateFilter('action', value as AuditAction | '')}
          />

          <FilterSelect
            value={filters.resourceType}
            options={resourceTypeOptions.map((r) => ({ value: r.value, label: r.label }))}
            allLabel="All Types"
            onChange={(value) => updateFilter('resourceType', value as AuditResourceType | '')}
          />

          <FilterSelect
            value={filters.status}
            options={[
              { value: 'success', label: 'Success' },
              { value: 'failed', label: 'Failed' },
            ]}
            allLabel="All Status"
            onChange={(value) => updateFilter('status', value as AuditStatus | '')}
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

          <FilterSelect
            value={filters.databaseType}
            options={[
              { value: 'mysql', label: 'MySQL' },
              { value: 'postgresql', label: 'PostgreSQL' },
              { value: 'sqlserver', label: 'SQL Server' },
            ]}
            allLabel="All Types"
            onChange={(value) => updateFilter('databaseType', value)}
          />

          <Autocomplete
            options={engineOptions}
            getOptionLabel={(option) => option.name}
            value={engineFilter}
            onChange={(_, newValue) => {
              setEngineFilter(newValue)
              setEngineSearchInput(newValue?.name || '')
              updateFilter('engineId', newValue?.id || '')
            }}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') {
                setEngineSearchInput(value)
              } else if (reason === 'clear') {
                setEngineSearchInput('')
                updateFilter('engineId', '')
              }
            }}
            inputValue={engineSearchInput}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={engineLoading}
            filterOptions={(x) => x}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="All Servers"
                helperText={engineHasMore && !engineSearchInput ? `${engineOptions.length} of ${engineTotalCount}` : undefined}
                FormHelperTextProps={{ sx: { mx: 0, mt: 0.5 } }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.engine_type} - {option.host}
                  </Typography>
                </Box>
              </li>
            )}
            noOptionsText={engineSearchInput ? 'No servers found' : 'No servers'}
            sx={{ minWidth: 200 }}
            size="small"
          />

          <Autocomplete
            options={aliasOptions}
            getOptionLabel={(option) => option.name}
            value={aliasFilter}
            onChange={(_, newValue) => {
              setAliasFilter(newValue)
              setAliasSearchInput(newValue?.name || '')
              updateFilter('resourceName', newValue?.name || '')
            }}
            onInputChange={(_, value, reason) => {
              if (reason === 'input') {
                setAliasSearchInput(value)
              } else if (reason === 'clear') {
                setAliasSearchInput('')
                updateFilter('resourceName', '')
              }
            }}
            inputValue={aliasSearchInput}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            loading={aliasLoading}
            filterOptions={(x) => x}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="All Aliases"
                helperText={aliasHasMore && !aliasSearchInput ? `${aliasOptions.length} of ${aliasTotalCount}` : undefined}
                FormHelperTextProps={{ sx: { mx: 0, mt: 0.5 } }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.database_type} - {option.host}
                  </Typography>
                </Box>
              </li>
            )}
            noOptionsText={aliasSearchInput ? 'No databases found' : 'No databases'}
            sx={{ minWidth: 200 }}
            size="small"
          />
        </FilterBar>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Content */}
        <Card sx={{ overflow: 'hidden', position: 'relative' }}>
          {/* Linear progress bar - visible when loading with existing data */}
          <LoadingOverlay loading={isLoading && logs.length > 0} />

          <CardContent sx={{ p: { xs: 1, sm: 2 } }}>
            {isLoading && logs.length === 0 ? (
              // Initial loading: show skeleton
              isMobile ? (
                <CardListSkeleton count={5} />
              ) : (
                <TableSkeleton rows={8} columns={8} />
              )
            ) : logs.length === 0 ? (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="textSecondary">
                  {hasActiveFilters
                    ? 'No audit logs match the current filters.'
                    : 'No audit logs found.'}
                </Typography>
              </Box>
            ) : isMobile ? (
              // Mobile: Card view
              <Box>
                {logs.map((log) => (
                  <AuditCard
                    key={log.id}
                    log={log}
                    onClick={() => handleRowClick(log)}
                  />
                ))}
              </Box>
            ) : (
              // Desktop: Table view
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 140 }}>Time</TableCell>
                      <TableCell sx={{ width: 180 }}>User</TableCell>
                      <TableCell sx={{ width: 90 }}>Type</TableCell>
                      <TableCell sx={{ width: 140 }}>Action</TableCell>
                      <TableCell sx={{ width: 100 }}>Engine</TableCell>
                      <TableCell>Alias</TableCell>
                      <TableCell sx={{ width: 80 }} align="center">Status</TableCell>
                      <TableCell sx={{ width: 60 }} align="center"></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        hover
                        onClick={() => handleRowClick(log)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {new Date(log.timestamp).toLocaleDateString()}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {log.user_email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={log.resource_type}
                            color={getResourceTypeColor(log.resource_type)}
                            sx={{ height: 24, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={formatActionLabel(log.action)}
                            variant="outlined"
                            sx={{ height: 24 }}
                          />
                        </TableCell>
                        <TableCell>
                          {log.details?.database_type ? (
                            <Typography variant="body2" color="textSecondary">
                              {String(log.details.database_type)}
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="textSecondary">
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 300,
                            }}
                            title={log.resource_name}
                          >
                            {log.resource_name}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            icon={log.status === 'success' ? <SuccessIcon /> : <ErrorIcon />}
                            label={log.status === 'success' ? 'Success' : 'Failed'}
                            color={log.status === 'success' ? 'success' : 'error'}
                            sx={{ height: 24, fontSize: '0.7rem' }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="View details">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRowClick(log)
                              }}
                            >
                              <InfoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Loading / Load More */}
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
              {isLoading && logs.length > 0 ? (
                <CircularProgress size={24} />
              ) : hasMore ? (
                <>
                  <Typography variant="caption" color="textSecondary">
                    Showing {logs.length} of {totalCount} logs
                  </Typography>
                  <Button
                    variant="outlined"
                    endIcon={<NextIcon />}
                    onClick={handleLoadMore}
                  >
                    Load More
                  </Button>
                </>
              ) : logs.length > 0 ? (
                <Typography variant="caption" color="textSecondary">
                  Showing all {totalCount} logs
                </Typography>
              ) : null}
            </Box>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <AuditDetailDialog
          log={selectedLog}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        />
      </Box>
    </LocalizationProvider>
  )
}
