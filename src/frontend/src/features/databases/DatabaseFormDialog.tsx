import { useState, useEffect, useMemo } from 'react'
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
  Switch,
  Grid,
  InputAdornment,
  IconButton,
  Alert,
  Box,
  Typography,
  CircularProgress,
  Chip,
  Divider,
  Autocomplete,
} from '@mui/material'
import { Visibility, VisibilityOff, CheckCircle, Cable } from '@mui/icons-material'
import type { DatabaseConfig, CreateDatabaseInput, DatabaseType, BackupPolicy, Engine } from '../../types'
import { useSettings } from '../../contexts/SettingsContext'
import { databasesApi } from '../../api'
import { apiClient } from '../../api/client'
import { enginesApi } from '../../api/engines'

interface DatabaseFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateDatabaseInput) => Promise<void>
  database?: DatabaseConfig | null
  isLoading?: boolean
}

const DATABASE_TYPES: { value: DatabaseType; label: string; defaultPort: number }[] = [
  { value: 'mysql', label: 'MySQL', defaultPort: 3306 },
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'sqlserver', label: 'SQL Server', defaultPort: 1433 },
]

// Helper to get policy summary
function getPolicySummary(policy: BackupPolicy): string {
  const parts: string[] = []
  if (policy.hourly.enabled && policy.hourly.keep_count > 0) parts.push(`${policy.hourly.keep_count}h`)
  if (policy.daily.enabled && policy.daily.keep_count > 0) parts.push(`${policy.daily.keep_count}d`)
  if (policy.weekly.enabled && policy.weekly.keep_count > 0) parts.push(`${policy.weekly.keep_count}w`)
  if (policy.monthly.enabled && policy.monthly.keep_count > 0) parts.push(`${policy.monthly.keep_count}m`)
  if (policy.yearly.enabled && policy.yearly.keep_count > 0) parts.push(`${policy.yearly.keep_count}y`)
  return parts.join('/') || 'No retention'
}

export function DatabaseFormDialog({
  open,
  onClose,
  onSubmit,
  database,
  isLoading = false,
}: DatabaseFormDialogProps) {
  const { settings } = useSettings()

  // Policies state
  const [policies, setPolicies] = useState<BackupPolicy[]>([])
  const [loadingPolicies, setLoadingPolicies] = useState(true)

  // Engines (servers) state
  const [engines, setEngines] = useState<Engine[]>([])
  const [loadingEngines, setLoadingEngines] = useState(true)
  const [selectedEngine, setSelectedEngine] = useState<Engine | null>(null)

  // Use settings defaults for new databases
  const initialFormState: CreateDatabaseInput = useMemo(() => ({
    name: '',
    database_type: 'mysql',
    host: '',
    port: 3306,
    database_name: '',
    username: '',
    password: '',
    policy_id: 'production-standard',
    use_engine_policy: false,
    engine_id: undefined,
    use_engine_credentials: false,
    enabled: true,
    compression: settings.defaultCompression,
  }), [settings.defaultCompression])

  const [formData, setFormData] = useState<CreateDatabaseInput>(initialFormState)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean
    message: string
    duration_ms?: number
  } | null>(null)

  const isEditing = !!database

  // Fetch policies and engines on open
  useEffect(() => {
    if (open) {
      // Load policies
      setLoadingPolicies(true)
      apiClient.get('/backup-policies')
        .then((response) => {
          setPolicies(response.data.policies || [])
        })
        .catch((err) => {
          console.error('Failed to load policies:', err)
          setPolicies([])
        })
        .finally(() => {
          setLoadingPolicies(false)
        })

      // Load engines
      setLoadingEngines(true)
      enginesApi.getAll({ limit: 100 })
        .then((response) => {
          setEngines(response.items || [])
        })
        .catch((err) => {
          console.error('Failed to load engines:', err)
          setEngines([])
        })
        .finally(() => {
          setLoadingEngines(false)
        })
    }
  }, [open])

  // Set form data when database changes (but don't depend on engines loading)
  useEffect(() => {
    if (database) {
      setFormData({
        name: database.name,
        database_type: database.database_type,
        host: database.host,
        port: database.port,
        database_name: database.database_name,
        username: database.username,
        password: '', // Password is not returned from API
        policy_id: database.policy_id || 'production-standard',
        use_engine_policy: database.use_engine_policy || false,
        engine_id: database.engine_id,
        use_engine_credentials: database.use_engine_credentials || false,
        enabled: database.enabled,
        compression: database.compression,
      })
    } else {
      setFormData(initialFormState)
      setSelectedEngine(null)
    }
    setError(null)
    setValidationErrors({})
    setShowPassword(false)
    setConnectionResult(null)
  }, [database, open, initialFormState])

  // Set selected engine when engines finish loading (separate effect to avoid race condition)
  useEffect(() => {
    if (database?.engine_id && engines.length > 0 && !loadingEngines) {
      const engine = engines.find(e => e.id === database.engine_id)
      setSelectedEngine(engine || null)
    } else if (!database) {
      setSelectedEngine(null)
    }
  }, [database, engines, loadingEngines])

  const handleChange = (field: keyof CreateDatabaseInput, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleTypeChange = (type: DatabaseType) => {
    const typeConfig = DATABASE_TYPES.find((t) => t.value === type)
    setFormData((prev) => ({
      ...prev,
      database_type: type,
      port: typeConfig?.defaultPort || prev.port,
    }))
  }

  const handleEngineChange = (engine: Engine | null) => {
    setSelectedEngine(engine)
    if (engine) {
      // Auto-fill connection details from engine
      setFormData((prev) => ({
        ...prev,
        engine_id: engine.id,
        database_type: engine.engine_type as DatabaseType,
        host: engine.host,
        port: engine.port,
        // If engine has credentials, offer to use them
        use_engine_credentials: engine.auth_method === 'user_password' && !!engine.username,
        username: engine.username || prev.username,
        // If engine has policy, offer to use it
        use_engine_policy: !!engine.policy_id,
      }))
    } else {
      // Clear engine-related fields
      setFormData((prev) => ({
        ...prev,
        engine_id: undefined,
        use_engine_credentials: false,
        use_engine_policy: false,
      }))
    }
  }

  const handleUseEngineCredentialsChange = (useEngineCredentials: boolean) => {
    setFormData((prev) => ({
      ...prev,
      use_engine_credentials: useEngineCredentials,
      // If using engine credentials, copy username from engine
      username: useEngineCredentials && selectedEngine?.username ? selectedEngine.username : prev.username,
    }))
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!(formData.name || '').trim()) {
      errors.name = 'Name is required'
    }
    if (!(formData.host || '').trim()) {
      errors.host = 'Host is required'
    }
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      errors.port = 'Port must be between 1 and 65535'
    }
    if (!(formData.database_name || '').trim()) {
      errors.database_name = 'Database name is required'
    }
    // Only require username/password if not using engine credentials
    if (!formData.use_engine_credentials) {
      if (!(formData.username || '').trim()) {
        errors.username = 'Username is required'
      }
      if (!isEditing && !(formData.password || '').trim()) {
        errors.password = 'Password is required'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const canTestConnection = (): boolean => {
    // If using engine credentials, we can test if we have engine with credentials
    if (formData.use_engine_credentials && selectedEngine?.auth_method === 'user_password') {
      return !!(
        (formData.host || '').trim() &&
        formData.port &&
        (formData.database_name || '').trim()
      )
    }
    // Otherwise need username/password
    return !!(
      (formData.host || '').trim() &&
      formData.port &&
      (formData.database_name || '').trim() &&
      (formData.username || '').trim() &&
      (formData.password || '').trim()
    )
  }

  const handleTestConnection = async () => {
    if (!canTestConnection()) {
      setError('Please fill in host, port, database name, username, and password to test connection')
      return
    }

    setTestingConnection(true)
    setConnectionResult(null)
    setError(null)

    try {
      const result = await databasesApi.testConnection({
        database_type: formData.database_type,
        host: formData.host,
        port: formData.port,
        database_name: formData.database_name,
        username: formData.use_engine_credentials ? undefined : formData.username,
        password: formData.use_engine_credentials ? undefined : formData.password,
        engine_id: formData.engine_id,
        use_engine_credentials: formData.use_engine_credentials,
      })
      setConnectionResult(result)
    } catch (err) {
      setConnectionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setError(null)
    try {
      await onSubmit(formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  // Get selected policy details
  const selectedPolicy = policies.find(p => p.id === formData.policy_id)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit Database' : 'Add Database'}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={2}>
            {/* Server (Engine) Selection */}
            <Grid item xs={12}>
              <Autocomplete
                options={engines}
                getOptionLabel={(option) => option.name}
                value={selectedEngine}
                onChange={(_, newValue) => handleEngineChange(newValue)}
                loading={loadingEngines}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Server (optional)"
                    placeholder="Select a server or enter connection details manually"
                    helperText="Select a server to auto-fill connection details"
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.engine_type.toUpperCase()} - {option.host}:{option.port}
                      </Typography>
                    </Box>
                  </li>
                )}
                disabled={isEditing}
              />
            </Grid>

            {/* Name */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                error={!!validationErrors.name}
                helperText={validationErrors.name}
                placeholder="My Production Database"
              />
            </Grid>

            {/* Database Type */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth disabled={!!selectedEngine}>
                <InputLabel>Database Type</InputLabel>
                <Select
                  value={formData.database_type}
                  label="Database Type"
                  onChange={(e) => handleTypeChange(e.target.value as DatabaseType)}
                >
                  {DATABASE_TYPES.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Backup Policy */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Backup Policy</InputLabel>
                <Select
                  value={formData.use_engine_policy ? '__server__' : (formData.policy_id || 'production-standard')}
                  label="Backup Policy"
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '__server__') {
                      handleChange('use_engine_policy', true)
                    } else {
                      setFormData((prev) => ({
                        ...prev,
                        use_engine_policy: false,
                        policy_id: value,
                      }))
                    }
                  }}
                  disabled={loadingPolicies}
                >
                  {/* Server policy option - only if engine has policy */}
                  {selectedEngine?.policy_id && (
                    <MenuItem value="__server__">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                        <span>Use Server Policy</span>
                        <Chip label="Inherited" size="small" color="info" sx={{ height: 18, fontSize: '0.65rem' }} />
                      </Box>
                    </MenuItem>
                  )}
                  {loadingPolicies ? (
                    <MenuItem value="production-standard">Loading...</MenuItem>
                  ) : (
                    policies.map((policy) => (
                      <MenuItem key={policy.id} value={policy.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <span>{policy.name}</span>
                          {policy.is_system && (
                            <Chip label="System" size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                          )}
                        </Box>
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>

            {/* Policy Summary */}
            {formData.use_engine_policy && selectedEngine?.policy_id ? (
              <Grid item xs={12}>
                <Alert severity="info" icon={<Cable />}>
                  <Typography variant="body2">
                    Using policy from server: <strong>{policies.find(p => p.id === selectedEngine.policy_id)?.name || selectedEngine.policy_id}</strong>
                  </Typography>
                  {(() => {
                    const enginePolicy = policies.find(p => p.id === selectedEngine.policy_id)
                    return enginePolicy ? (
                      <Typography variant="caption" color="text.secondary">
                        Retention: {getPolicySummary(enginePolicy)}
                      </Typography>
                    ) : null
                  })()}
                </Alert>
              </Grid>
            ) : selectedPolicy && (
              <Grid item xs={12}>
                <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Policy retention: <strong>{getPolicySummary(selectedPolicy)}</strong>
                  </Typography>
                  {selectedPolicy.description && (
                    <Typography variant="caption" color="text.secondary">
                      {selectedPolicy.description}
                    </Typography>
                  )}
                </Box>
              </Grid>
            )}

            {/* Host */}
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Host"
                value={formData.host}
                onChange={(e) => handleChange('host', e.target.value)}
                error={!!validationErrors.host}
                helperText={validationErrors.host || (selectedEngine ? 'From selected server' : undefined)}
                placeholder="db.example.com"
                disabled={!!selectedEngine}
              />
            </Grid>

            {/* Port */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Port"
                type="number"
                value={formData.port}
                onChange={(e) => handleChange('port', parseInt(e.target.value) || 0)}
                error={!!validationErrors.port}
                helperText={validationErrors.port}
                disabled={!!selectedEngine}
              />
            </Grid>

            {/* Database Name */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Database Name"
                value={formData.database_name}
                onChange={(e) => handleChange('database_name', e.target.value)}
                error={!!validationErrors.database_name}
                helperText={validationErrors.database_name}
                placeholder="mydb"
              />
            </Grid>

            <Divider sx={{ width: '100%', my: 1 }} />

            {/* Credentials Section */}
            {selectedEngine && selectedEngine.auth_method === 'user_password' && selectedEngine.username && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.use_engine_credentials || false}
                      onChange={(e) => handleUseEngineCredentialsChange(e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">
                        Use server credentials
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Use username/password from "{selectedEngine.name}" ({selectedEngine.username})
                      </Typography>
                    </Box>
                  }
                />
              </Grid>
            )}

            {/* Username - hidden when using engine credentials */}
            {!formData.use_engine_credentials && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Username"
                  value={formData.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  error={!!validationErrors.username}
                  helperText={validationErrors.username}
                />
              </Grid>
            )}

            {/* Password - hidden when using engine credentials */}
            {!formData.use_engine_credentials && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={isEditing ? 'Password (leave empty to keep current)' : 'Password'}
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  error={!!validationErrors.password}
                  helperText={validationErrors.password}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            )}

            {/* Show info when using engine credentials */}
            {formData.use_engine_credentials && selectedEngine && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  This database will use credentials from server "{selectedEngine.name}"
                </Alert>
              </Grid>
            )}

            {/* Test Connection Button */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={testingConnection ? <CircularProgress size={16} /> : <Cable />}
                    onClick={handleTestConnection}
                    disabled={testingConnection || !canTestConnection()}
                    sx={{ flexShrink: 0 }}
                  >
                    {testingConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                  {connectionResult?.success && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <CheckCircle color="success" fontSize="small" />
                      <Typography variant="body2" color="success.main">
                        Connected{connectionResult.duration_ms && ` (${connectionResult.duration_ms}ms)`}
                      </Typography>
                    </Box>
                  )}
                </Box>
                {connectionResult && !connectionResult.success && (
                  <Alert severity="error" sx={{ py: 0.5 }}>
                    {connectionResult.message.length > 100
                      ? connectionResult.message.substring(0, 100) + '...'
                      : connectionResult.message}
                  </Alert>
                )}
              </Box>
            </Grid>

            {/* Switches */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 3 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.enabled}
                      onChange={(e) => handleChange('enabled', e.target.checked)}
                    />
                  }
                  label="Enabled"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.compression}
                      onChange={(e) => handleChange('compression', e.target.checked)}
                    />
                  }
                  label="Compress backups"
                />
              </Box>
            </Grid>
          </Grid>

          {isEditing && (
            <Typography variant="caption" color="textSecondary" sx={{ mt: 2, display: 'block' }}>
              Note: Leave password empty to keep the existing password.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Database'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
