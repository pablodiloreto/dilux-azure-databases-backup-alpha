import { useState } from 'react'
import {
  Box,
  Typography,
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
  Alert,
  TextField,
  MenuItem,
  Button,
} from '@mui/material'
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useBackupHistory } from '../../hooks/useBackups'
import { useDatabases } from '../../hooks/useDatabases'
import { backupsApi } from '../../api/backups'
import type { BackupResult } from '../../types'

function getStatusColor(status: string): 'success' | 'error' | 'warning' | 'info' | 'default' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'in_progress':
      return 'warning'
    case 'pending':
      return 'info'
    default:
      return 'default'
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '-'
  const mb = bytes / 1024 / 1024
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(2)} KB`
  }
  return `${mb.toFixed(2)} MB`
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`
}

export function BackupsPage() {
  const [databaseFilter, setDatabaseFilter] = useState<string>('')
  const { data: databases } = useDatabases()
  const { data: backups, isLoading, error, refetch } = useBackupHistory({
    databaseId: databaseFilter || undefined,
    limit: 50,
  })

  const handleDownload = async (backup: BackupResult) => {
    if (!backup.blob_name) return

    try {
      const url = await backupsApi.getDownloadUrl(backup.blob_name)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Failed to get download URL:', err)
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
        <Alert severity="error">Failed to load backup history. Please try again.</Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Backup History</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          select
          label="Filter by Database"
          value={databaseFilter}
          onChange={(e) => setDatabaseFilter(e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All Databases</MenuItem>
          {databases?.map((db) => (
            <MenuItem key={db.id} value={db.id}>
              {db.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Database</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Triggered By</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {backups && backups.length > 0 ? (
                  backups.map((backup) => (
                    <TableRow key={backup.id} hover>
                      <TableCell>
                        <Typography variant="body1" fontWeight={500}>
                          {backup.database_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" textTransform="uppercase">
                          {backup.database_type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={backup.status}
                          color={getStatusColor(backup.status)}
                        />
                      </TableCell>
                      <TableCell>{formatFileSize(backup.file_size_bytes)}</TableCell>
                      <TableCell>{formatDuration(backup.duration_seconds)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={backup.triggered_by}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(backup.created_at).toLocaleDateString()}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {new Date(backup.created_at).toLocaleTimeString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {backup.status === 'completed' && backup.blob_name && (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleDownload(backup)}
                            title="Download Backup"
                          >
                            <DownloadIcon />
                          </IconButton>
                        )}
                        {backup.status === 'failed' && backup.error_message && (
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ display: 'block', maxWidth: 150 }}
                          >
                            {backup.error_message}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography color="textSecondary" sx={{ py: 4 }}>
                        No backup history found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  )
}
