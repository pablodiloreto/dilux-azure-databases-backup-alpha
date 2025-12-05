import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  Divider,
  TextField,
  Button,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Snackbar,
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
  const { settings, updateSettings, toggleDarkMode } = useSettings()
  const [snackbar, setSnackbar] = useState(false)

  const handleSave = () => {
    // Settings are already persisted via context/localStorage
    setSnackbar(true)
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
                  onChange={toggleDarkMode}
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
                    updateSettings({
                      defaultRetentionDays: parseInt(e.target.value) || 30,
                    })
                  }
                  size="small"
                  sx={{ width: 80 }}
                  inputProps={{ min: 1, max: 365 }}
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
                    updateSettings({
                      defaultCompression: !settings.defaultCompression,
                    })
                  }
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

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Settings are automatically saved to your browser's local storage.
      </Alert>

      <Button variant="contained" color="primary" onClick={handleSave}>
        Save Settings
      </Button>

      <Snackbar
        open={snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(false)}
        message="Settings saved successfully"
      />
    </Box>
  )
}
