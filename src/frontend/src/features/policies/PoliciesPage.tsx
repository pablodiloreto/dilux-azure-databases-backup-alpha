import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Button,
  Tooltip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Grid,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Policy as PolicyIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { apiClient } from '../../api/client'
import { BackupPolicy, TierConfig, BackupPoliciesResponse } from '../../types'

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Helper to get policy summary string
function getPolicySummary(policy: BackupPolicy): string {
  const parts: string[] = []
  if (policy.hourly.enabled && policy.hourly.keep_count > 0) parts.push(`${policy.hourly.keep_count}h`)
  if (policy.daily.enabled && policy.daily.keep_count > 0) parts.push(`${policy.daily.keep_count}d`)
  if (policy.weekly.enabled && policy.weekly.keep_count > 0) parts.push(`${policy.weekly.keep_count}w`)
  if (policy.monthly.enabled && policy.monthly.keep_count > 0) parts.push(`${policy.monthly.keep_count}m`)
  if (policy.yearly.enabled && policy.yearly.keep_count > 0) parts.push(`${policy.yearly.keep_count}y`)
  return parts.join('/') || 'No retention'
}

// Helper to get tier schedule description
function getTierScheduleDesc(tier: string, config: TierConfig): string {
  if (!config.enabled) return 'Disabled'

  switch (tier) {
    case 'hourly':
      return config.interval_hours === 1 ? 'Every hour' : `Every ${config.interval_hours} hours`
    case 'daily':
      return `Daily at ${config.time}`
    case 'weekly':
      return `${DAYS_OF_WEEK[config.day_of_week || 0]} at ${config.time}`
    case 'monthly':
      return `Day ${config.day_of_month} at ${config.time}`
    case 'yearly':
      return `${MONTHS[config.month || 1]} ${config.day_of_month} at ${config.time}`
    default:
      return 'Unknown'
  }
}

// Default tier config
const defaultTierConfig: TierConfig = {
  enabled: false,
  keep_count: 0,
  interval_hours: 1,
  time: '02:00',
  day_of_week: 0,
  day_of_month: 1,
  month: 1,
}

export function PoliciesPage() {
  const [policies, setPolicies] = useState<BackupPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPolicy, setEditingPolicy] = useState<BackupPolicy | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [policyToDelete, setPolicyToDelete] = useState<BackupPolicy | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formHourly, setFormHourly] = useState<TierConfig>({ ...defaultTierConfig })
  const [formDaily, setFormDaily] = useState<TierConfig>({ ...defaultTierConfig })
  const [formWeekly, setFormWeekly] = useState<TierConfig>({ ...defaultTierConfig })
  const [formMonthly, setFormMonthly] = useState<TierConfig>({ ...defaultTierConfig })
  const [formYearly, setFormYearly] = useState<TierConfig>({ ...defaultTierConfig })

  // Fetch policies
  const fetchPolicies = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<BackupPoliciesResponse>('/backup-policies')
      setPolicies(response.data.policies)
      setError(null)
    } catch (err) {
      setError('Failed to load backup policies')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPolicies()
  }, [])

  // Open dialog for create/edit
  const openDialog = (policy?: BackupPolicy) => {
    if (policy) {
      setEditingPolicy(policy)
      setFormName(policy.name)
      setFormDescription(policy.description || '')
      setFormHourly({ ...defaultTierConfig, ...policy.hourly })
      setFormDaily({ ...defaultTierConfig, ...policy.daily })
      setFormWeekly({ ...defaultTierConfig, ...policy.weekly })
      setFormMonthly({ ...defaultTierConfig, ...policy.monthly })
      setFormYearly({ ...defaultTierConfig, ...policy.yearly })
    } else {
      setEditingPolicy(null)
      setFormName('')
      setFormDescription('')
      setFormHourly({ ...defaultTierConfig })
      setFormDaily({ ...defaultTierConfig, enabled: true, keep_count: 7 })
      setFormWeekly({ ...defaultTierConfig })
      setFormMonthly({ ...defaultTierConfig })
      setFormYearly({ ...defaultTierConfig })
    }
    setDialogOpen(true)
  }

  // Save policy
  const handleSave = async () => {
    try {
      setSaving(true)
      const payload = {
        name: formName,
        description: formDescription || undefined,
        hourly: formHourly,
        daily: formDaily,
        weekly: formWeekly,
        monthly: formMonthly,
        yearly: formYearly,
      }

      if (editingPolicy) {
        await apiClient.put(`/backup-policies/${editingPolicy.id}`, payload)
      } else {
        await apiClient.post('/backup-policies', payload)
      }

      setDialogOpen(false)
      fetchPolicies()
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save policy'
      setError(errorMsg)
    } finally {
      setSaving(false)
    }
  }

  // Delete policy
  const handleDelete = async () => {
    if (!policyToDelete) return
    try {
      await apiClient.delete(`/backup-policies/${policyToDelete.id}`)
      setDeleteDialogOpen(false)
      setPolicyToDelete(null)
      fetchPolicies()
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to delete policy'
      setError(errorMsg)
    }
  }

  // Tier configuration component
  const TierConfigFields = ({
    tier,
    config,
    onChange,
  }: {
    tier: string
    config: TierConfig
    onChange: (config: TierConfig) => void
  }) => (
    <Box sx={{ mb: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
          {tier}
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={config.enabled}
              onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
              size="small"
            />
          }
          label={config.enabled ? 'Enabled' : 'Disabled'}
          labelPlacement="start"
        />
      </Box>

      {config.enabled && (
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Keep Count"
              type="number"
              size="small"
              fullWidth
              value={config.keep_count}
              onChange={(e) => onChange({ ...config, keep_count: parseInt(e.target.value) || 0 })}
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>

          {tier === 'hourly' && (
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Interval</InputLabel>
                <Select
                  value={config.interval_hours || 1}
                  label="Interval"
                  onChange={(e) => onChange({ ...config, interval_hours: e.target.value as number })}
                >
                  {[1, 2, 3, 4, 6, 8, 12].map((h) => (
                    <MenuItem key={h} value={h}>{h === 1 ? 'Every hour' : `Every ${h} hours`}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {tier !== 'hourly' && (
            <Grid item xs={6}>
              <TextField
                label="Time (HH:MM)"
                size="small"
                fullWidth
                value={config.time || '02:00'}
                onChange={(e) => onChange({ ...config, time: e.target.value })}
                placeholder="02:00"
              />
            </Grid>
          )}

          {tier === 'weekly' && (
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Day of Week</InputLabel>
                <Select
                  value={config.day_of_week || 0}
                  label="Day of Week"
                  onChange={(e) => onChange({ ...config, day_of_week: e.target.value as number })}
                >
                  {DAYS_OF_WEEK.map((day, i) => (
                    <MenuItem key={i} value={i}>{day}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {(tier === 'monthly' || tier === 'yearly') && (
            <Grid item xs={tier === 'yearly' ? 6 : 12}>
              <FormControl fullWidth size="small">
                <InputLabel>Day of Month</InputLabel>
                <Select
                  value={config.day_of_month || 1}
                  label="Day of Month"
                  onChange={(e) => onChange({ ...config, day_of_month: e.target.value as number })}
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          {tier === 'yearly' && (
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Month</InputLabel>
                <Select
                  value={config.month || 1}
                  label="Month"
                  onChange={(e) => onChange({ ...config, month: e.target.value as number })}
                >
                  {MONTHS.slice(1).map((m, i) => (
                    <MenuItem key={i + 1} value={i + 1}>{m}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  )

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Backup Policies
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure backup schedules and retention for each tier
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openDialog()}
        >
          New Policy
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Policies Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Hourly</TableCell>
              <TableCell>Daily</TableCell>
              <TableCell>Weekly</TableCell>
              <TableCell>Monthly</TableCell>
              <TableCell>Yearly</TableCell>
              <TableCell>Summary</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {policies.map((policy) => (
              <TableRow key={policy.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PolicyIcon fontSize="small" color="action" />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {policy.name}
                        {policy.is_system && (
                          <Chip
                            label="System"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ ml: 1, height: 20 }}
                          />
                        )}
                      </Typography>
                      {policy.description && (
                        <Typography variant="caption" color="text.secondary">
                          {policy.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  {policy.hourly.enabled ? (
                    <Chip label={`${policy.hourly.keep_count}`} size="small" color="info" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {policy.daily.enabled ? (
                    <Chip label={`${policy.daily.keep_count}`} size="small" color="success" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {policy.weekly.enabled ? (
                    <Chip label={`${policy.weekly.keep_count}`} size="small" color="warning" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {policy.monthly.enabled ? (
                    <Chip label={`${policy.monthly.keep_count}`} size="small" color="secondary" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell>
                  {policy.yearly.enabled ? (
                    <Chip label={`${policy.yearly.keep_count}`} size="small" color="error" />
                  ) : (
                    <Typography variant="caption" color="text.disabled">-</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Tooltip title="Retention summary: hourly/daily/weekly/monthly/yearly">
                    <Chip
                      label={getPolicySummary(policy)}
                      size="small"
                      variant="outlined"
                      icon={<InfoIcon />}
                    />
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openDialog(policy)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {!policy.is_system && (
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          setPolicyToDelete(policy)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingPolicy ? `Edit Policy: ${editingPolicy.name}` : 'Create Backup Policy'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Policy Name"
                  fullWidth
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  disabled={editingPolicy?.is_system}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Description"
                  fullWidth
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" gutterBottom>
              Tier Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Configure schedule and retention for each backup tier. Enabled tiers will create backups at their scheduled times.
            </Typography>

            <TierConfigFields tier="hourly" config={formHourly} onChange={setFormHourly} />
            <TierConfigFields tier="daily" config={formDaily} onChange={setFormDaily} />
            <TierConfigFields tier="weekly" config={formWeekly} onChange={setFormWeekly} />
            <TierConfigFields tier="monthly" config={formMonthly} onChange={setFormMonthly} />
            <TierConfigFields tier="yearly" config={formYearly} onChange={setFormYearly} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !formName}
          >
            {saving ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Policy</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the policy "{policyToDelete?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Databases using this policy will need to be reassigned to a different policy.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
