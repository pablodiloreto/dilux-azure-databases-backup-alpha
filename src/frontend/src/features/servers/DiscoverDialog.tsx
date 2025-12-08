import { useState, useEffect } from 'react'
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
} from '@mui/material'
import { Storage as StorageIcon } from '@mui/icons-material'
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

export function DiscoverDialog({ open, onClose, engine }: DiscoverDialogProps) {
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [databases, setDatabases] = useState<DatabaseSelection[]>([])
  const [policies, setPolicies] = useState<BackupPolicy[]>([])
  const [defaultPolicyId, setDefaultPolicyId] = useState('')
  const [discoveryDone, setDiscoveryDone] = useState(false)

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

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setDatabases([])
      setError(null)
      setDiscoveryDone(false)
      setIsDiscovering(false)
      setIsAdding(false)
    }
  }, [open])

  const handleDiscover = async () => {
    setIsDiscovering(true)
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
      setDiscoveryDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discover databases')
    } finally {
      setIsDiscovering(false)
    }
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
            <Typography variant="body1" gutterBottom>
              Discover all databases on this server and add them to your backup configuration.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              This will connect to {engine.host}:{engine.port} and list all available databases.
            </Typography>
            <Button
              variant="contained"
              onClick={handleDiscover}
              disabled={isDiscovering}
              startIcon={isDiscovering ? <CircularProgress size={20} /> : <StorageIcon />}
            >
              {isDiscovering ? 'Discovering...' : 'Discover Databases'}
            </Button>
          </Box>
        ) : (
          <Box>
            {databases.length === 0 ? (
              <Alert severity="info">
                No new databases found on this server.
              </Alert>
            ) : (
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

                {/* Select all */}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedCount === newDatabases.length && newDatabases.length > 0}
                      indeterminate={selectedCount > 0 && selectedCount < newDatabases.length}
                      onChange={(e) => handleToggleAll(e.target.checked)}
                    />
                  }
                  label={`Select all (${selectedCount} of ${databases.length} selected)`}
                />

                {/* Database list */}
                <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {databases.map((db) => (
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
              </>
            )}
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
