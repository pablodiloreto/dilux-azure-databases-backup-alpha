import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  TextField,
  Button,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
} from '@mui/material'
import {
  Notifications as NotificationsIcon,
  DarkMode as DarkModeIcon,
  Storage as StorageIcon,
  Schedule as ScheduleIcon,
  Info as InfoIcon,
} from '@mui/icons-material'

export function SettingsPage() {
  // Mock settings state (will be persisted later)
  const [settings, setSettings] = useState({
    darkMode: false,
    emailNotifications: false,
    defaultRetentionDays: 30,
    defaultCompression: true,
  })

  const handleToggle = (key: keyof typeof settings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <Box sx={{ maxWidth: 800 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure your backup preferences and application settings.
      </Typography>

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
                  onChange={() => handleToggle('darkMode')}
                  disabled
                />
                <Chip label="Coming soon" size="small" sx={{ ml: 1 }} />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Notifications
          </Typography>
          <List disablePadding>
            <ListItem>
              <ListItemIcon>
                <NotificationsIcon />
              </ListItemIcon>
              <ListItemText
                primary="Email Notifications"
                secondary="Receive email alerts for backup failures"
              />
              <ListItemSecondaryAction>
                <Switch
                  checked={settings.emailNotifications}
                  onChange={() => handleToggle('emailNotifications')}
                  disabled
                />
                <Chip label="Coming soon" size="small" sx={{ ml: 1 }} />
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

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Default Retention (days)"
              type="number"
              value={settings.defaultRetentionDays}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultRetentionDays: parseInt(e.target.value) || 30,
                }))
              }
              size="small"
              sx={{ maxWidth: 200 }}
              helperText="How long to keep backups by default"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={settings.defaultCompression}
                  onChange={() => handleToggle('defaultCompression')}
                />
              }
              label="Enable compression by default"
            />
          </Box>
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
                secondary="Azure Blob Storage (Azurite - Development)"
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

      {/* Save Button */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Settings are stored locally in this development version. In production,
        they will be persisted to Azure Table Storage.
      </Alert>

      <Button variant="contained" color="primary">
        Save Settings
      </Button>
    </Box>
  )
}
