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
} from '@mui/material'
import { Visibility, VisibilityOff, CheckCircle, Cable } from '@mui/icons-material'
import type { DatabaseConfig, CreateDatabaseInput, DatabaseType } from '../../types'
import { useSettings } from '../../contexts/SettingsContext'
import { databasesApi } from '../../api'

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

const SCHEDULE_OPTIONS = [
  { value: '*/15 * * * *', label: 'Every 15 minutes' },
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 0 * * *', label: 'Daily (midnight)' },
  { value: '0 0 * * 0', label: 'Weekly (Sunday midnight)' },
]

export function DatabaseFormDialog({
  open,
  onClose,
  onSubmit,
  database,
  isLoading = false,
}: DatabaseFormDialogProps) {
  const { settings } = useSettings()

  // Use settings defaults for new databases
  const initialFormState: CreateDatabaseInput = useMemo(() => ({
    name: '',
    database_type: 'mysql',
    host: '',
    port: 3306,
    database_name: '',
    username: '',
    password: '',
    schedule: '0 0 * * *',
    enabled: true,
    retention_days: settings.defaultRetentionDays,
    compression: settings.defaultCompression,
  }), [settings.defaultRetentionDays, settings.defaultCompression])

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
        schedule: database.schedule,
        enabled: database.enabled,
        retention_days: database.retention_days,
        compression: database.compression,
      })
    } else {
      setFormData(initialFormState)
    }
    setError(null)
    setValidationErrors({})
    setShowPassword(false)
    setConnectionResult(null)
  }, [database, open, initialFormState])

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

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!formData.name.trim()) {
      errors.name = 'Name is required'
    }
    if (!formData.host.trim()) {
      errors.host = 'Host is required'
    }
    if (!formData.port || formData.port < 1 || formData.port > 65535) {
      errors.port = 'Port must be between 1 and 65535'
    }
    if (!formData.database_name.trim()) {
      errors.database_name = 'Database name is required'
    }
    if (!formData.username.trim()) {
      errors.username = 'Username is required'
    }
    if (!isEditing && !formData.password.trim()) {
      errors.password = 'Password is required'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const canTestConnection = (): boolean => {
    return !!(
      formData.host.trim() &&
      formData.port &&
      formData.database_name.trim() &&
      formData.username.trim() &&
      formData.password.trim()
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
        username: formData.username,
        password: formData.password,
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
              <FormControl fullWidth>
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

            {/* Schedule */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Backup Schedule</InputLabel>
                <Select
                  value={formData.schedule}
                  label="Backup Schedule"
                  onChange={(e) => handleChange('schedule', e.target.value)}
                >
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Host */}
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Host"
                value={formData.host}
                onChange={(e) => handleChange('host', e.target.value)}
                error={!!validationErrors.host}
                helperText={validationErrors.host}
                placeholder="db.example.com"
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

            {/* Username */}
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

            {/* Password */}
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

            {/* Retention Days */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Retention Days"
                type="number"
                value={formData.retention_days}
                onChange={(e) => handleChange('retention_days', parseInt(e.target.value) || 7)}
                InputProps={{
                  inputProps: { min: 1, max: 365 },
                }}
                helperText="How long to keep backups"
              />
            </Grid>

            {/* Switches */}
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
