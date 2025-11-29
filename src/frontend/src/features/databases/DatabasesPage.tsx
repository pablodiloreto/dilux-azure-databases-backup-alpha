import { useState } from 'react'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
} from '@mui/material'
import {
  Add as AddIcon,
  PlayArrow as PlayIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useDatabases, useDeleteDatabase, useTriggerBackup } from '../../hooks/useDatabases'
import type { DatabaseConfig } from '../../types'

function getDatabaseTypeColor(type: string): 'primary' | 'secondary' | 'success' | 'warning' {
  switch (type) {
    case 'mysql':
      return 'primary'
    case 'postgresql':
      return 'secondary'
    case 'sqlserver':
      return 'success'
    case 'azure_sql':
      return 'warning'
    default:
      return 'primary'
  }
}

export function DatabasesPage() {
  const { data: databases, isLoading, error } = useDatabases()
  const deleteMutation = useDeleteDatabase()
  const triggerBackupMutation = useTriggerBackup()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedDb, setSelectedDb] = useState<DatabaseConfig | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const handleDeleteClick = (db: DatabaseConfig) => {
    setSelectedDb(db)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedDb) {
      try {
        await deleteMutation.mutateAsync(selectedDb.id)
        setSnackbar({ open: true, message: 'Database deleted successfully', severity: 'success' })
      } catch {
        setSnackbar({ open: true, message: 'Failed to delete database', severity: 'error' })
      }
    }
    setDeleteDialogOpen(false)
    setSelectedDb(null)
  }

  const handleTriggerBackup = async (db: DatabaseConfig) => {
    try {
      await triggerBackupMutation.mutateAsync(db.id)
      setSnackbar({ open: true, message: `Backup triggered for ${db.name}`, severity: 'success' })
    } catch {
      setSnackbar({ open: true, message: 'Failed to trigger backup', severity: 'error' })
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ mt: 4 }}>
        <Alert severity="error">Failed to load databases. Please try again.</Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Databases</Typography>
        <Button variant="contained" startIcon={<AddIcon />}>
          Add Database
        </Button>
      </Box>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Host</TableCell>
                  <TableCell>Database</TableCell>
                  <TableCell>Schedule</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {databases && databases.length > 0 ? (
                  databases.map((db) => (
                    <TableRow key={db.id} hover>
                      <TableCell>
                        <Typography variant="body1" fontWeight={500}>
                          {db.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={db.database_type.toUpperCase()}
                          color={getDatabaseTypeColor(db.database_type)}
                        />
                      </TableCell>
                      <TableCell>
                        {db.host}:{db.port}
                      </TableCell>
                      <TableCell>{db.database_name}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {db.schedule}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={db.enabled ? 'Enabled' : 'Disabled'}
                          color={db.enabled ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleTriggerBackup(db)}
                          title="Trigger Backup"
                        >
                          <PlayIcon />
                        </IconButton>
                        <IconButton size="small" title="Edit">
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteClick(db)}
                          title="Delete"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="textSecondary" sx={{ py: 4 }}>
                        No databases configured. Click "Add Database" to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Database</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedDb?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
