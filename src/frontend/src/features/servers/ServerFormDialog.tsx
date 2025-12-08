import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  CircularProgress,
  Alert,
  Typography,
  Divider,
  Chip,
} from '@mui/material'
import type { Engine, CreateEngineInput, EngineType, AuthMethod, BackupPolicy } from '../../types'
import { apiClient } from '../../api/client'

interface ServerFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateEngineInput) => Promise<void>
  server?: Engine | null
}

const DEFAULT_PORTS: Record<EngineType, number> = {
  mysql: 3306,
  postgresql: 5432,
  sqlserver: 1433,
}

export function ServerFormDialog({ open, onClose, onSubmit, server }: ServerFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [serverType, setServerType] = useState<EngineType>('mysql')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(3306)
  const [authMethod, setAuthMethod] = useState<AuthMethod | ''>('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [policyId, setPolicyId] = useState<string>('')
  const [discoverDatabases, setDiscoverDatabases] = useState(true)
  const [applyToAllDatabases, setApplyToAllDatabases] = useState(false)
  const [applyPolicyToAllDatabases, setApplyPolicyToAllDatabases] = useState(false)

  // Policies for dropdown
  const [policies, setPolicies] = useState<BackupPolicy[]>([])
  const [loadingPolicies, setLoadingPolicies] = useState(false)

  const isEditing = !!server

  // Load policies when dialog opens
  useEffect(() => {
    if (open) {
      setLoadingPolicies(true)
      apiClient.get('/backup-policies')
        .then(response => {
          setPolicies(response.data.policies || [])
        })
        .catch(() => {
          setPolicies([])
        })
        .finally(() => {
          setLoadingPolicies(false)
        })
    }
  }, [open])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (server) {
        setName(server.name)
        setServerType(server.engine_type)
        setHost(server.host)
        setPort(server.port)
        setAuthMethod(server.auth_method || '')
        setUsername(server.username || '')
        setPassword('')
        setPolicyId(server.policy_id || '')
        setDiscoverDatabases(false)
        setApplyToAllDatabases(false)
        setApplyPolicyToAllDatabases(false)
      } else {
        setName('')
        setServerType('mysql')
        setHost('')
        setPort(3306)
        setAuthMethod('user_password')
        setUsername('')
        setPassword('')
        setPolicyId('')
        setDiscoverDatabases(true)
        setApplyToAllDatabases(false)
        setApplyPolicyToAllDatabases(false)
      }
      setError(null)
    }
  }, [open, server])

  // Update port when server type changes
  useEffect(() => {
    if (!server) {
      setPort(DEFAULT_PORTS[serverType])
    }
  }, [serverType, server])

  const handleSubmit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      const data: CreateEngineInput & {
        apply_to_all_databases?: boolean
        apply_policy_to_all_databases?: boolean
      } = {
        name,
        engine_type: serverType,
        host,
        port,
      }

      if (authMethod) {
        data.auth_method = authMethod as AuthMethod
      }

      if (authMethod === 'user_password' && username) {
        data.username = username
        if (password) {
          data.password = password
        }
      }

      // Add policy_id if set
      if (policyId) {
        data.policy_id = policyId
      }

      if (!isEditing && discoverDatabases) {
        data.discover_databases = true
      }

      // For editing, add apply_to_all_databases flag
      if (isEditing && applyToAllDatabases) {
        data.apply_to_all_databases = true
      }

      // For editing, add apply_policy_to_all_databases flag
      if (isEditing && applyPolicyToAllDatabases && policyId) {
        data.apply_policy_to_all_databases = true
      }

      await onSubmit(data)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save server')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValid = name.trim() !== '' && host.trim() !== '' && port > 0

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Server' : 'Add Server'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {/* Basic Info */}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            disabled={isSubmitting}
            placeholder="e.g., Production MySQL Server"
          />

          <FormControl fullWidth disabled={isEditing || isSubmitting}>
            <InputLabel>Database Type</InputLabel>
            <Select
              value={serverType}
              label="Database Type"
              onChange={(e) => setServerType(e.target.value as EngineType)}
            >
              <MenuItem value="mysql">MySQL</MenuItem>
              <MenuItem value="postgresql">PostgreSQL</MenuItem>
              <MenuItem value="sqlserver">SQL Server</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              fullWidth
              required
              disabled={isEditing || isSubmitting}
              placeholder="e.g., db.example.com"
            />
            <TextField
              label="Port"
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value) || 0)}
              sx={{ width: 120 }}
              required
              disabled={isEditing || isSubmitting}
            />
          </Box>

          <Divider sx={{ my: 1 }} />

          {/* Authentication */}
          <Typography variant="subtitle2" color="text.secondary">
            Authentication (optional)
          </Typography>

          <FormControl fullWidth disabled={isSubmitting}>
            <InputLabel>Auth Method</InputLabel>
            <Select
              value={authMethod}
              label="Auth Method"
              onChange={(e) => setAuthMethod(e.target.value as AuthMethod | '')}
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value="user_password">Username & Password</MenuItem>
              <MenuItem value="managed_identity">Managed Identity</MenuItem>
            </Select>
          </FormControl>

          {authMethod === 'user_password' && (
            <>
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                fullWidth
                disabled={isSubmitting}
              />
              <TextField
                label={isEditing ? 'Password (leave blank to keep current)' : 'Password'}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                disabled={isSubmitting}
              />
            </>
          )}

          {authMethod === 'managed_identity' && (
            <Alert severity="info" sx={{ mt: 1 }}>
              The Azure Function will use its own Managed Identity to connect to the database.
              Make sure the Function App has a Managed Identity enabled and has been granted access to the database.
            </Alert>
          )}

          <Divider sx={{ my: 1 }} />

          {/* Backup Policy */}
          <Typography variant="subtitle2" color="text.secondary">
            Default Backup Policy (optional)
          </Typography>

          <FormControl fullWidth disabled={isSubmitting || loadingPolicies}>
            <InputLabel>Backup Policy</InputLabel>
            <Select
              value={policyId}
              label="Backup Policy"
              onChange={(e) => setPolicyId(e.target.value)}
            >
              <MenuItem value="">None (databases use their own policy)</MenuItem>
              {policies.map((policy) => (
                <MenuItem key={policy.id} value={policy.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {policy.name}
                    {policy.is_system && (
                      <Chip label="System" size="small" color="default" sx={{ height: 20 }} />
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {policyId && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Databases on this server can inherit this policy. When a database uses "Server Policy",
              it will automatically use the policy defined here.
            </Alert>
          )}

          {/* Options */}
          {!isEditing && authMethod && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={discoverDatabases}
                  onChange={(e) => setDiscoverDatabases(e.target.checked)}
                  disabled={isSubmitting}
                />
              }
              label="Discover databases after creation"
            />
          )}

          {isEditing && server?.database_count && server.database_count > 0 && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={applyToAllDatabases}
                    onChange={(e) => setApplyToAllDatabases(e.target.checked)}
                    disabled={isSubmitting}
                  />
                }
                label={`Apply credential changes to ${server.database_count} database(s)`}
              />
              {policyId && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={applyPolicyToAllDatabases}
                      onChange={(e) => setApplyPolicyToAllDatabases(e.target.checked)}
                      disabled={isSubmitting}
                    />
                  }
                  label={`Set ${server.database_count} database(s) to use this server's policy`}
                />
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid || isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={20} /> : null}
        >
          {isEditing ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
