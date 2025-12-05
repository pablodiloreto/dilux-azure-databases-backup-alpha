import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  Divider,
  TextField,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Snackbar,
  CircularProgress,
  Skeleton,
} from '@mui/material'
import {
  DarkMode as DarkModeIcon,
  Storage as StorageIcon,
  Schedule as ScheduleIcon,
  Info as InfoIcon,
  Compress as CompressIcon,
  EventRepeat as RetentionIcon,
} from '@mui/icons-material'
import { useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'

export function SettingsPage() {
  const { settings, isLoading, error, updateSettings, toggleDarkMode } = useSettings()
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const handleUpdateSetting = async (updates: Parameters<typeof updateSettings>[0]) => {
    setSaving(true)
    try {
      await updateSettings(updates)
      setSnackbar({ open: true, message: 'Setting saved', severity: 'success' })
    } catch {
      setSnackbar({ open: true, message: 'Failed to save setting', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDarkMode = async () => {
    setSaving(true)
    try {
      await toggleDarkMode()
      setSnackbar({ open: true, message: 'Theme updated', severity: 'success' })
    } catch {
      setSnackbar({ open: true, message: 'Failed to update theme', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 800 }}>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Skeleton variant="text" width={150} height={32} />
            <Skeleton variant="rectangular" height={60} sx={{ mt: 2 }} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Skeleton variant="text" width={150} height={32} />
            <Skeleton variant="rectangular" height={120} sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 800 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure your backup preferences and application settings.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Appearance */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Appearance
          </Typography>
          <List disablePadding>
            <ListItem>
              <ListItemIcon>
                <DarkModeIcon />
              </ListItemIcon>
              <ListItemText
                primary="Dark Mode"
                secondary="Use dark theme across the application"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.darkMode}
                  onChange={handleToggleDarkMode}
                  disabled={saving}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </CardContent>
      </Card>

      {/* Backup Defaults */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Backup Defaults
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Default values for new database configurations.
          </Typography>

          <List disablePadding>
            <ListItem>
              <ListItemIcon>
                <RetentionIcon />
              </ListItemIcon>
              <ListItemText
                primary="Default Retention"
                secondary="How many days to keep backups"
              />
              <ListItemSecondaryAction>
                <TextField
                  type="number"
                  value={settings.defaultRetentionDays}
                  onChange={(e) =>
                    handleUpdateSetting({
                      defaultRetentionDays: parseInt(e.target.value) || 30,
                    })
                  }
                  size="small"
                  sx={{ width: 80 }}
                  inputProps={{ min: 1, max: 365 }}
                  disabled={saving}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemIcon>
                <CompressIcon />
              </ListItemIcon>
              <ListItemText
                primary="Enable Compression"
                secondary="Compress backup files by default (gzip)"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.defaultCompression}
                  onChange={() =>
                    handleUpdateSetting({
                      defaultCompression: !settings.defaultCompression,
                    })
                  }
                  disabled={saving}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            System Information
          </Typography>
          <List disablePadding>
            <ListItem>
              <ListItemIcon>
                <InfoIcon />
              </ListItemIcon>
              <ListItemText primary="Version" secondary="0.1.0-alpha" />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemIcon>
                <StorageIcon />
              </ListItemIcon>
              <ListItemText
                primary="Storage"
                secondary="Azure Table Storage (settings persist across devices)"
              />
            </ListItem>
            <Divider component="li" />
            <ListItem>
              <ListItemIcon>
                <ScheduleIcon />
              </ListItemIcon>
              <ListItemText
                primary="Scheduler"
                secondary="Azure Functions Timer Trigger"
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Settings are automatically saved to Azure Table Storage and persist across all devices.
      </Alert>

      {saving && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Saving...
          </Typography>
        </Box>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        message={snackbar.message}
      />
    </Box>
  )
}
