/**
 * Authentication Guard Component
 *
 * Blocks access to the app until the user is authenticated.
 * Shows a login screen when not authenticated.
 */

import { Box, Button, Typography, Paper, CircularProgress } from '@mui/material'
import { Login as LoginIcon } from '@mui/icons-material'
import { useAuth } from '../../contexts/AuthContext'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, login, error, authMode } = useAuth()

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={48} />
        <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
          Verificando autenticación...
        </Typography>
      </Box>
    )
  }

  // Show login screen when not authenticated
  if (!isAuthenticated) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default',
          p: 3,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            maxWidth: 400,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <Typography variant="h4" gutterBottom fontWeight={700}>
            Dilux DB Backups
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Sistema de respaldos automatizados para bases de datos
          </Typography>

          {error && (
            <Typography color="error" sx={{ mb: 2 }}>
              {error}
            </Typography>
          )}

          <Button
            variant="contained"
            size="large"
            startIcon={<LoginIcon />}
            onClick={login}
            fullWidth
            sx={{ py: 1.5 }}
          >
            Iniciar sesión con Microsoft
          </Button>

          {authMode === 'mock' && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 2 }}>
              Modo de desarrollo (Mock Auth)
            </Typography>
          )}
        </Paper>
      </Box>
    )
  }

  // User is authenticated - render children
  return <>{children}</>
}
