import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
} from '@mui/material'
import { Storage as StorageIcon, Search as SearchIcon } from '@mui/icons-material'
import type { Engine, BackupPolicy, BackupPoliciesResponse } from '../../types'
import { enginesApi } from '../../api/engines'
import { apiClient } from '../../api/client'

interface DiscoverDialogProps {
  open: boolean
  onClose: () => void
  engine: Engine
}

interface DatabaseSelection {
  name: string
  alias: string
  policyId: string
  selected: boolean
  exists: boolean
}

const PAGE_SIZE = 50

export function DiscoverDialog({ open, onClose, engine }: DiscoverDialogProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databases, setDatabases] = useState<DatabaseSelection[]>([])
  const [policies, setPolicies] = useState<BackupPolicy[]>([])
  const [defaultPolicyId, setDefaultPolicyId] = useState('')
  const [discoveryDone, setDiscoveryDone] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

  // Load policies on mount
  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        const response = await apiClient.get<BackupPoliciesResponse>('/backup-policies')
        setPolicies(response.data.policies)
        // Set default to first non-system policy or first policy
        const defaultPolicy = response.data.policies.find(p => !p.is_system) || response.data.policies[0]
        if (defaultPolicy) {
          setDefaultPolicyId(defaultPolicy.id)
        }
      } catch (err) {
        console.error('Failed to load policies:', err)
      }
    }
    if (open) {
      fetchPolicies()
    }
  }, [open])

  // Reset state and auto-discover when dialog opens
  useEffect(() => {
    if (open) {
      setDatabases([])
      setError(null)
      setDiscoveryDone(false)
      setIsAdding(false)
      setSearchQuery('')
      setDisplayLimit(PAGE_SIZE)
      // Auto-discover when dialog opens
      handleDiscoverAuto()
    }
  }, [open])

  // Auto-discover function (called on open)
  const handleDiscoverAuto = async () => {
    setError(null)

    try {
      const result = await enginesApi.discoverDatabases(engine.id)
      const selections: DatabaseSelection[] = result.databases
        .filter(db => !db.is_system)
        .map(db => ({
          name: db.name,
          alias: db.name,
          policyId: defaultPolicyId,
          selected: !db.exists,
          exists: db.exists,
        }))
      setDatabases(selections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover databases')
    } finally {
      setDiscoveryDone(true)
    }
  }

  // Filter and paginate databases
  const filteredDatabases = useMemo(() => {
    if (!searchQuery.trim()) return databases
    const query = searchQuery.toLowerCase()
    return databases.filter(db =>
      db.name.toLowerCase().includes(query) ||
      db.alias.toLowerCase().includes(query)
    )
  }, [databases, searchQuery])

  const displayedDatabases = useMemo(() => {
    return filteredDatabases.slice(0, displayLimit)
  }, [filteredDatabases, displayLimit])

  const hasMoreToShow = filteredDatabases.length > displayLimit

  const handleLoadMore = () => {
    setDisplayLimit(prev => prev + PAGE_SIZE)
  }

  const handleToggleAll = (checked: boolean) => {
    setDatabases(prev => prev.map(db => ({
      ...db,
      selected: !db.exists && checked,
    })))
  }

  const handleToggleDatabase = (name: string) => {
    setDatabases(prev => prev.map(db =>
      db.name === name ? { ...db, selected: !db.selected } : db
    ))
  }

  const handleAliasChange = (name: string, alias: string) => {
    setDatabases(prev => prev.map(db =>
      db.name === name ? { ...db, alias } : db
    ))
  }

  const handlePolicyChange = (name: string, policyId: string) => {
    setDatabases(prev => prev.map(db =>
      db.name === name ? { ...db, policyId } : db
    ))
  }

  const handleApplyDefaultPolicy = () => {
    setDatabases(prev => prev.map(db => ({
      ...db,
      policyId: defaultPolicyId,
    })))
  }

  const handleAddSelected = async () => {
    const selectedDatabases = databases
      .filter(db => db.selected)
      .map(db => ({
        name: db.name,
        alias: db.alias !== db.name ? db.alias : undefined,
        policy_id: db.policyId || undefined,
      }))

    if (selectedDatabases.length === 0) {
      setError('Please select at least one database to add')
      return
    }

    setIsAdding(true)
    setError(null)

    try {
      const result = await enginesApi.addDatabases(engine.id, selectedDatabases, true)
      if (result.total_errors > 0) {
        setError(`Added ${result.total_created} database(s), but ${result.total_errors} failed`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add databases')
    } finally {
      setIsAdding(false)
    }
  }

  const newDatabases = databases.filter(db => !db.exists)
  const selectedCount = databases.filter(db => db.selected).length

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Discover Databases - {engine.name}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!discoveryDone ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="body1" gutterBottom>
              Discovering databases on {engine.host}:{engine.port}...
            </Typography>
          </Box>
        ) : (
          <Box>
            {databases.length === 0 && !error ? (
              <Alert severity="info">
                No databases found on this server, or all databases are system databases.
              </Alert>
            ) : databases.length > 0 ? (
              <>
                {/* Default policy selector */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Default Policy</InputLabel>
                    <Select
                      value={defaultPolicyId}
                      label="Default Policy"
                      onChange={(e) => setDefaultPolicyId(e.target.value)}
                    >
                      {policies.map(policy => (
                        <MenuItem key={policy.id} value={policy.id}>
                          {policy.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button size="small" onClick={handleApplyDefaultPolicy}>
                    Apply to All
                  </Button>
                </Box>

                <Divider sx={{ mb: 2 }} />

                {/* Search field */}
                {databases.length > 10 && (
                  <TextField
                    size="small"
                    placeholder="Search databases..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setDisplayLimit(PAGE_SIZE) // Reset pagination on search
                    }}
                    sx={{ mb: 2, width: '100%' }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                  />
                )}

                {/* Summary and Select all */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedCount === newDatabases.length && newDatabases.length > 0}
                        indeterminate={selectedCount > 0 && selectedCount < newDatabases.length}
                        onChange={(e) => handleToggleAll(e.target.checked)}
                      />
                    }
                    label={`Select all new (${selectedCount} selected)`}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {searchQuery
                      ? `${filteredDatabases.length} of ${databases.length} shown`
                      : `${databases.length} database${databases.length !== 1 ? 's' : ''} found`
                    }
                  </Typography>
                </Box>

                {/* Database list */}
                <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {displayedDatabases.map((db) => (
                    <ListItem
                      key={db.name}
                      sx={{
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <Checkbox
                          checked={db.selected}
                          onChange={() => handleToggleDatabase(db.name)}
                          disabled={db.exists}
                        />
                        <ListItemIcon sx={{ minWidth: 40 }}>
                          <StorageIcon color={db.exists ? 'disabled' : 'action'} />
                        </ListItemIcon>
                        <ListItemText
                          primary={db.name}
                          secondary={db.exists ? 'Already configured' : null}
                        />
                        {db.exists && (
                          <Chip size="small" label="Exists" color="default" />
                        )}
                      </Box>

                      {db.selected && !db.exists && (
                        <Box sx={{ display: 'flex', gap: 2, ml: 7, mt: 1, mb: 1 }}>
                          <TextField
                            size="small"
                            label="Alias"
                            value={db.alias}
                            onChange={(e) => handleAliasChange(db.name, e.target.value)}
                            sx={{ flex: 1 }}
                          />
                          <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>Policy</InputLabel>
                            <Select
                              value={db.policyId}
                              label="Policy"
                              onChange={(e) => handlePolicyChange(db.name, e.target.value)}
                            >
                              {policies.map(policy => (
                                <MenuItem key={policy.id} value={policy.id}>
                                  {policy.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>
                      )}
                    </ListItem>
                  ))}
                </List>

                {/* Load more button */}
                {hasMoreToShow && (
                  <Box sx={{ textAlign: 'center', py: 2 }}>
                    <Button onClick={handleLoadMore} variant="text">
                      Load more ({filteredDatabases.length - displayLimit} remaining)
                    </Button>
                  </Box>
                )}
              </>
            ) : null}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isAdding}>
          {discoveryDone && selectedCount > 0 ? 'Cancel' : 'Close'}
        </Button>
        {discoveryDone && selectedCount > 0 && (
          <Button
            variant="contained"
            onClick={handleAddSelected}
            disabled={isAdding || selectedCount === 0}
            startIcon={isAdding ? <CircularProgress size={20} /> : null}
          >
            Add {selectedCount} Database{selectedCount !== 1 ? 's' : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
