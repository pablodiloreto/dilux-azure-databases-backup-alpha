import { useState, useEffect } from 'react'
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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Tooltip,
  Switch,
  FormControlLabel,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  AdminPanelSettings as AdminIcon,
  Engineering as OperatorIcon,
  Visibility as ViewerIcon,
} from '@mui/icons-material'
import { useAuth } from '../../contexts/AuthContext'
import { usersApi } from '../../api/users'
import type { User, UserRole, CreateUserInput, UpdateUserInput } from '../../types'

function getRoleIcon(role: UserRole) {
  switch (role) {
    case 'admin':
      return <AdminIcon fontSize="small" />
    case 'operator':
      return <OperatorIcon fontSize="small" />
    case 'viewer':
      return <ViewerIcon fontSize="small" />
  }
}

function getRoleColor(role: UserRole): 'error' | 'warning' | 'info' {
  switch (role) {
    case 'admin':
      return 'error'
    case 'operator':
      return 'warning'
    case 'viewer':
      return 'info'
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(dateStr).toLocaleString()
}

export function UsersPage() {
  const { user: currentUser, canManageUsers, isLoading: authLoading } = useAuth()

  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)

  // Form state
  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('viewer')
  const [formEnabled, setFormEnabled] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const fetchUsers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await usersApi.getAll()
      setUsers(data)
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setError('Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers()
    }
  }, [canManageUsers])

  const handleOpenCreate = () => {
    setEditingUser(null)
    setFormEmail('')
    setFormName('')
    setFormRole('viewer')
    setFormEnabled(true)
    setFormError(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (user: User) => {
    setEditingUser(user)
    setFormEmail(user.email)
    setFormName(user.name)
    setFormRole(user.role)
    setFormEnabled(user.enabled)
    setFormError(null)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingUser(null)
    setFormError(null)
  }

  const handleSave = async () => {
    setFormError(null)
    setIsSaving(true)

    try {
      if (editingUser) {
        // Update existing user
        const input: UpdateUserInput = {
          name: formName,
          role: formRole,
          enabled: formEnabled,
        }
        await usersApi.update(editingUser.id, input)
      } else {
        // Create new user
        const input: CreateUserInput = {
          email: formEmail,
          name: formName,
          role: formRole,
        }
        await usersApi.create(input)
      }

      handleCloseDialog()
      fetchUsers()
    } catch (err: unknown) {
      console.error('Failed to save user:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to save user'
      setFormError(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user)
    setDeleteConfirmOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return

    try {
      await usersApi.delete(userToDelete.id)
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
      fetchUsers()
    } catch (err) {
      console.error('Failed to delete user:', err)
      setError('Failed to delete user')
    }
  }

  // Show access denied if not admin
  if (!authLoading && !canManageUsers) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          User Management
        </Typography>
        <Alert severity="error">
          Access denied. Only administrators can manage users.
        </Alert>
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">User Management</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchUsers}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {/* Info banner */}
      <Alert severity="info" sx={{ mb: 3 }}>
        Users must have an Azure AD account to log in. Add their email here and they'll be activated on first login.
      </Alert>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Users Table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Login</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="textSecondary">
                        No users found. Add your first user above.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={500}>
                            {user.name}
                          </Typography>
                          {user.id === currentUser?.id && (
                            <Chip size="small" label="You" color="primary" variant="outlined" />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          icon={getRoleIcon(user.role)}
                          label={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          color={getRoleColor(user.role)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={user.enabled ? 'Active' : 'Disabled'}
                          color={user.enabled ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="textSecondary">
                          {formatDate(user.last_login)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Edit user">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenEdit(user)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {user.id !== currentUser?.id && (
                          <Tooltip title="Delete user">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteClick(user)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingUser ? 'Edit User' : 'Add New User'}
        </DialogTitle>
        <DialogContent>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Email"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              disabled={!!editingUser} // Can't change email after creation
              required
              fullWidth
              helperText={editingUser ? 'Email cannot be changed' : 'Must match their Azure AD email'}
            />
            <TextField
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              fullWidth
            />
            <TextField
              select
              label="Role"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              fullWidth
              helperText={
                formRole === 'admin'
                  ? 'Full access: manage users, databases, backups, settings'
                  : formRole === 'operator'
                  ? 'Can trigger backups and manage databases, but not users'
                  : 'Read-only access to dashboards and backup history'
              }
            >
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="operator">Operator</MenuItem>
              <MenuItem value="viewer">Viewer</MenuItem>
            </TextField>
            {editingUser && (
              <FormControlLabel
                control={
                  <Switch
                    checked={formEnabled}
                    onChange={(e) => setFormEnabled(e.target.checked)}
                    disabled={editingUser.id === currentUser?.id}
                  />
                }
                label="Account enabled"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={isSaving || !formEmail || !formName}
          >
            {isSaving ? <CircularProgress size={20} /> : editingUser ? 'Save' : 'Add User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Delete User?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{userToDelete?.name}</strong> ({userToDelete?.email})?
          </Typography>
          <Typography color="textSecondary" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
