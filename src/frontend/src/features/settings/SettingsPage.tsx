import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  Divider,
  TextField,
  Alert,
  Snackbar,
  CircularProgress,
  Skeleton,
  FormControl,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import {
  DarkMode as DarkModeIcon,
  Compress as CompressIcon,
  EventRepeat as RetentionIcon,
  PersonAdd as AccessRequestIcon,
  ViewList as PageSizeIcon,
} from '@mui/icons-material'
import { useState, ReactNode } from 'react'
import { useSettings } from '../../contexts/SettingsContext'

// Responsive setting row component
interface SettingRowProps {
  icon: ReactNode
  title: string
  description: string
  control: ReactNode
  disabled?: boolean
}

function SettingRow({ icon, title, description, control }: SettingRowProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? 1.5 : 2,
        py: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flex: 1 }}>
        <Box sx={{ color: 'action.active', mt: 0.25 }}>{icon}</Box>
        <Box>
          <Typography variant="body1" fontWeight={500}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ ml: isMobile ? 5 : 0, flexShrink: 0 }}>{control}</Box>
    </Box>
  )
}

export function SettingsPage() {
  const { settings, isLoading, error, updateUserPreferences, updateSystemSettings, toggleDarkMode } = useSettings()
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const handleUpdateUserPreference = async (updates: Parameters<typeof updateUserPreferences>[0]) => {
    setSaving(true)
    try {
      await updateUserPreferences(updates)
      setSnackbar({ open: true, message: 'Preference saved', severity: 'success' })
    } catch {
      setSnackbar({ open: true, message: 'Failed to save preference', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateSystemSetting = async (updates: Parameters<typeof updateSystemSettings>[0]) => {
    setSaving(true)
    try {
      await updateSystemSettings(updates)
      setSnackbar({ open: true, message: 'Setting saved', severity: 'success' })
    } catch {
      setSnackbar({ open: true, message: 'Failed to save setting', severity: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDarkMode = () => {
    toggleDarkMode()
    setSnackbar({ open: true, message: 'Theme updated', severity: 'success' })
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
    <Box sx={{ maxWidth: 800, overflow: 'hidden' }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Configure your preferences and system-wide backup settings.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* User Preferences */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Your Preferences
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These settings are personal to your account.
          </Typography>
          <SettingRow
            icon={<DarkModeIcon />}
            title="Dark Mode"
            description="Use dark theme across the application"
            control={
              <Switch
                checked={settings.darkMode}
                onChange={handleToggleDarkMode}
                disabled={saving}
              />
            }
          />
          <Divider />
          <SettingRow
            icon={<PageSizeIcon />}
            title="Items Per Page"
            description="Default number of items to show in lists"
            control={
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <Select
                  value={settings.pageSize}
                  onChange={(e) =>
                    handleUpdateUserPreference({
                      pageSize: e.target.value as number,
                    })
                  }
                  disabled={saving}
                >
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={25}>25</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                  <MenuItem value={100}>100</MenuItem>
                </Select>
              </FormControl>
            }
          />
        </CardContent>
      </Card>

      {/* System Settings - Backup Defaults */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Backup Defaults
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            System-wide defaults for new database configurations. Changes apply to all users.
          </Typography>
          <SettingRow
            icon={<RetentionIcon />}
            title="Default Retention"
            description="How many days to keep backups"
            control={
              <TextField
                type="number"
                value={settings.defaultRetentionDays}
                onChange={(e) =>
                  handleUpdateSystemSetting({
                    defaultRetentionDays: parseInt(e.target.value) || 30,
                  })
                }
                size="small"
                sx={{ width: 80 }}
                inputProps={{ min: 1, max: 365 }}
                disabled={saving}
              />
            }
          />
          <Divider />
          <SettingRow
            icon={<CompressIcon />}
            title="Enable Compression"
            description="Compress backup files by default (gzip)"
            control={
              <Switch
                checked={settings.defaultCompression}
                onChange={() =>
                  handleUpdateSystemSetting({
                    defaultCompression: !settings.defaultCompression,
                  })
                }
                disabled={saving}
              />
            }
          />
        </CardContent>
      </Card>

      {/* System Settings - Access Control */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Access Control
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            System-wide access settings. Changes apply to all users.
          </Typography>
          <SettingRow
            icon={<AccessRequestIcon />}
            title="Allow Access Requests"
            description="Let unauthorized Azure AD users submit access requests for admin approval"
            control={
              <Switch
                checked={settings.accessRequestsEnabled}
                onChange={() =>
                  handleUpdateSystemSetting({
                    accessRequestsEnabled: !settings.accessRequestsEnabled,
                  })
                }
                disabled={saving}
              />
            }
          />
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Your preferences are stored in your user profile. System settings are shared across all users.
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
