import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  TablePagination,
  InputAdornment,
  Badge,
  Collapse,
} from '@mui/material'
import { ResponsiveTable, Column } from '../../components/common'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  AdminPanelSettings as AdminIcon,
  Engineering as OperatorIcon,
  Visibility as ViewerIcon,
  Search as SearchIcon,
  Check as ApproveIcon,
  Close as RejectIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  HourglassEmpty as PendingIcon,
} from '@mui/icons-material'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { usersApi, accessRequestsApi } from '../../api/users'
import type { User, UserRole, CreateUserInput, UpdateUserInput, AccessRequest } from '../../types'

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

type StatusFilter = 'all' | 'active' | 'disabled'

export function UsersPage() {
  const { user: currentUser, canManageUsers, isLoading: authLoading } = useAuth()
  const { settings } = useSettings()

  // Users state
  const [users, setUsers] = useState<User[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Access requests state
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [showPendingRequests, setShowPendingRequests] = useState(false) // Collapsed by default
  const [loadingRequests, setLoadingRequests] = useState(false)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)

  // Approve/Reject dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [requestToApprove, setRequestToApprove] = useState<AccessRequest | null>(null)
  const [approveRole, setApproveRole] = useState<UserRole>('viewer')
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [requestToReject, setRequestToReject] = useState<AccessRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Form state
  const [formEmail, setFormEmail] = useState('')
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('viewer')
  const [formEnabled, setFormEnabled] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await usersApi.getAll({
        page: page + 1, // API uses 1-based pages
        page_size: pageSize,
        search: searchQuery || undefined,
        status: statusFilter === 'all' ? '' : statusFilter,
      })
      setUsers(data.users)
      setTotalCount(data.total_count)
      setPendingCount(data.pending_requests_count)
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setError('Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, searchQuery, statusFilter])

  const fetchAccessRequests = useCallback(async () => {
    setLoadingRequests(true)
    try {
      const requests = await accessRequestsApi.getAll()
      setAccessRequests(requests)
    } catch (err) {
      console.error('Failed to fetch access requests:', err)
    } finally {
      setLoadingRequests(false)
    }
  }, [])

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers()
    }
  }, [canManageUsers, fetchUsers])

  useEffect(() => {
    if (canManageUsers && pendingCount > 0) {
      fetchAccessRequests()
    }
  }, [canManageUsers, pendingCount, fetchAccessRequests])

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
        const input: UpdateUserInput = {
          name: formName,
          role: formRole,
          enabled: formEnabled,
        }
        await usersApi.update(editingUser.id, input)
      } else {
        const input: CreateUserInput = {
          email: formEmail,
          name: formName || undefined,
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

  // Access request handlers
  const handleApproveClick = (request: AccessRequest) => {
    setRequestToApprove(request)
    setApproveRole('viewer')
    setApproveDialogOpen(true)
  }

  const handleApproveConfirm = async () => {
    if (!requestToApprove) return

    setIsSaving(true)
    try {
      await accessRequestsApi.approve(requestToApprove.id, approveRole)
      setApproveDialogOpen(false)
      setRequestToApprove(null)
      fetchUsers()
      fetchAccessRequests()
    } catch (err) {
      console.error('Failed to approve request:', err)
      setError('Failed to approve request')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRejectClick = (request: AccessRequest) => {
    setRequestToReject(request)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleRejectConfirm = async () => {
    if (!requestToReject) return

    setIsSaving(true)
    try {
      await accessRequestsApi.reject(requestToReject.id, rejectReason || undefined)
      setRejectDialogOpen(false)
      setRequestToReject(null)
      fetchUsers()
      fetchAccessRequests()
    } catch (err) {
      console.error('Failed to reject request:', err)
      setError('Failed to reject request')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(0)
    fetchUsers()
  }

  // Table columns for Access Requests
  const accessRequestColumns: Column<AccessRequest>[] = useMemo(() => [
    {
      id: 'name',
      label: 'Name',
      render: (request) => (
        <Typography variant="body2" fontWeight={500}>
          {request.name}
        </Typography>
      ),
      hideInMobileSummary: true,
    },
    {
      id: 'email',
      label: 'Email',
      render: (request) => request.email,
    },
    {
      id: 'requested',
      label: 'Requested',
      render: (request) => (
        <Typography variant="body2" color="textSecondary">
          {formatDate(request.requested_at)}
        </Typography>
      ),
      hideInMobileSummary: true,
    },
  ], [])

  // Table columns for ResponsiveTable
  const tableColumns: Column<User>[] = useMemo(() => [
    {
      id: 'name',
      label: 'Name',
      render: (user) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight={500}>
            {user.name}
          </Typography>
          {user.id === currentUser?.id && (
            <Chip size="small" label="You" color="primary" variant="outlined" />
          )}
        </Box>
      ),
      hideInMobileSummary: true, // shown as title
    },
    {
      id: 'email',
      label: 'Email',
      render: (user) => user.email,
      hideInMobileSummary: true, // too long for summary
    },
    {
      id: 'role',
      label: 'Role',
      render: (user) => (
        <Chip
          size="small"
          icon={getRoleIcon(user.role)}
          label={user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          color={getRoleColor(user.role)}
          variant="outlined"
        />
      ),
    },
    {
      id: 'status',
      label: 'Status',
      render: (user) => (
        <Chip
          size="small"
          label={user.enabled ? 'Active' : 'Disabled'}
          color={user.enabled ? 'success' : 'default'}
        />
      ),
    },
    {
      id: 'lastLogin',
      label: 'Last Login',
      render: (user) => (
        <Typography variant="body2" color="textSecondary">
          {formatDate(user.last_login)}
        </Typography>
      ),
      hideInMobileSummary: true,
    },
  ], [currentUser?.id])

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
    <Box sx={{ maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4">User Management</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { fetchUsers(); fetchAccessRequests(); }}
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
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Pending Access Requests */}
      {settings.accessRequestsEnabled && pendingCount > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ pb: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
              onClick={() => setShowPendingRequests(!showPendingRequests)}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Badge badgeContent={pendingCount} color="warning">
                  <PendingIcon color="warning" />
                </Badge>
                <Typography variant="h6">
                  Pending Access Requests
                </Typography>
              </Box>
              <IconButton size="small">
                {showPendingRequests ? <CollapseIcon /> : <ExpandIcon />}
              </IconButton>
            </Box>
          </CardContent>
          <Collapse in={showPendingRequests}>
            <Box sx={{ px: { xs: 0, sm: 0 } }}>
              {loadingRequests ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : (
                <ResponsiveTable
                  columns={accessRequestColumns}
                  data={accessRequests}
                  keyExtractor={(request) => request.id}
                  mobileTitle={(request) => request.name}
                  mobileSummaryColumns={['email']}
                  actions={(request) => (
                    <>
                      <Tooltip title="Approve">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleApproveClick(request)}
                        >
                          <ApproveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRejectClick(request)}
                        >
                          <RejectIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  emptyMessage="No pending requests"
                  size="small"
                />
              )}
            </Box>
          </Collapse>
        </Card>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box component="form" onSubmit={handleSearch} sx={{ flexGrow: 1, minWidth: 200 }}>
              <TextField
                size="small"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <TextField
              select
              size="small"
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter)
                setPage(0)
              }}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="disabled">Disabled</MenuItem>
            </TextField>
          </Box>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card sx={{ overflow: 'hidden' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <ResponsiveTable
            columns={tableColumns}
            data={users}
            keyExtractor={(user) => user.id}
            mobileTitle={(user) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {user.name}
                {user.id === currentUser?.id && (
                  <Chip size="small" label="You" color="primary" variant="outlined" />
                )}
              </Box>
            )}
            mobileSummaryColumns={['role', 'status']}
            actions={(user) => (
              <>
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
              </>
            )}
            emptyMessage={
              searchQuery || statusFilter !== 'all'
                ? 'No users match your filters.'
                : 'No users found. Add your first user above.'
            }
          />
        )}
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10))
            setPage(0)
          }}
          rowsPerPageOptions={[25, 50, 100]}
        />
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
              disabled={!!editingUser}
              required
              fullWidth
              helperText={editingUser ? 'Email cannot be changed' : 'Must match their Azure AD email'}
            />
            <TextField
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              fullWidth
              helperText={!editingUser ? 'Optional - will be set from Azure AD on first login' : undefined}
            />
            <TextField
              select
              label="Role"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              fullWidth
              disabled={editingUser?.id === currentUser?.id}
              helperText={
                editingUser?.id === currentUser?.id
                  ? 'You cannot change your own role'
                  : formRole === 'admin'
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
                label={
                  editingUser.id === currentUser?.id
                    ? 'Account enabled (you cannot disable yourself)'
                    : 'Account enabled'
                }
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={isSaving || !formEmail}
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

      {/* Approve Request Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Access Request</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Approve access for <strong>{requestToApprove?.name}</strong> ({requestToApprove?.email})?
          </Typography>
          <TextField
            select
            label="Role"
            value={approveRole}
            onChange={(e) => setApproveRole(e.target.value as UserRole)}
            fullWidth
            helperText={
              approveRole === 'admin'
                ? 'Full access: manage users, databases, backups, settings'
                : approveRole === 'operator'
                ? 'Can trigger backups and manage databases, but not users'
                : 'Read-only access to dashboards and backup history'
            }
          >
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="operator">Operator</MenuItem>
            <MenuItem value="viewer">Viewer</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleApproveConfirm} color="success" variant="contained" disabled={isSaving}>
            {isSaving ? <CircularProgress size={20} /> : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Request Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Access Request</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Reject access for <strong>{requestToReject?.name}</strong> ({requestToReject?.email})?
          </Typography>
          <TextField
            label="Reason (optional)"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Enter a reason for rejection..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleRejectConfirm} color="error" variant="contained" disabled={isSaving}>
            {isSaving ? <CircularProgress size={20} /> : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
