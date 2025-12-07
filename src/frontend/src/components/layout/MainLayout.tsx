import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Breadcrumbs,
  Link,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Storage as StorageIcon,
  Backup as BackupIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  NavigateNext as NavigateNextIcon,
  Home as HomeIcon,
  MonitorHeart as StatusIcon,
} from '@mui/icons-material'
import { useSettings } from '../../contexts/SettingsContext'

// Mock user data (will be replaced with Azure AD auth)
const mockUser = {
  name: 'Admin User',
  email: 'admin@dilux.tech',
  avatar: 'https://ui-avatars.com/api/?name=Admin&background=1976d2&color=fff',
}

const DRAWER_WIDTH = 240
const DRAWER_WIDTH_COLLAPSED = 64

// localStorage key for sidebar state
const SIDEBAR_COLLAPSED_KEY = 'dilux-sidebar-collapsed'

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
}

interface MainLayoutProps {
  children: React.ReactNode
}

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'Databases', icon: <StorageIcon />, path: '/databases' },
  { text: 'Backups', icon: <BackupIcon />, path: '/backups' },
]

// Breadcrumb config
const breadcrumbNameMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/databases': 'Databases',
  '/backups': 'Backups',
  '/settings': 'Settings',
  '/status': 'System Status',
}

export function MainLayout({ children }: MainLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { settings, toggleDarkMode } = useSettings()

  const drawerWidth = collapsed && !isMobile ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed
    setCollapsed(newCollapsed)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newCollapsed))
  }

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleUserMenuClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = () => {
    handleUserMenuClose()
    // TODO: Implement Azure AD logout
    console.log('Logout clicked - will implement with Azure AD')
  }

  // Generate breadcrumbs from current path
  const pathnames = location.pathname.split('/').filter((x) => x)
  const breadcrumbs = pathnames.map((_, index) => {
    const path = `/${pathnames.slice(0, index + 1).join('/')}`
    const name = breadcrumbNameMap[path] || pathnames[index]
    const isLast = index === pathnames.length - 1
    return { path, name, isLast }
  })

  const drawerContent = (showText: boolean, showCollapseButton: boolean) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Toolbar sx={{ justifyContent: 'center', px: showText ? 2 : 1 }}>
        {showText ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BackupIcon color="primary" />
            <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700 }}>
              Dilux Backup
            </Typography>
          </Box>
        ) : (
          <BackupIcon color="primary" sx={{ fontSize: 28 }} />
        )}
      </Toolbar>
      <Divider />

      {/* Main menu */}
      <List sx={{ flexGrow: 1 }}>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ display: 'block' }}>
            <Tooltip title={showText ? '' : item.text} placement="right" arrow>
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => {
                  navigate(item.path)
                  setMobileOpen(false)
                }}
                sx={{
                  minHeight: 48,
                  justifyContent: showText ? 'initial' : 'center',
                  px: 2.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    mr: showText ? 2 : 'auto',
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {showText && <ListItemText primary={item.text} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* Bottom menu */}
      <List>
        {/* Settings */}
        <ListItem disablePadding sx={{ display: 'block' }}>
          <Tooltip title={showText ? '' : 'Settings'} placement="right" arrow>
            <ListItemButton
              selected={location.pathname === '/settings'}
              onClick={() => {
                navigate('/settings')
                setMobileOpen(false)
              }}
              sx={{
                minHeight: 48,
                justifyContent: showText ? 'initial' : 'center',
                px: 2.5,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: showText ? 2 : 'auto',
                  justifyContent: 'center',
                }}
              >
                <SettingsIcon />
              </ListItemIcon>
              {showText && <ListItemText primary="Settings" />}
            </ListItemButton>
          </Tooltip>
        </ListItem>

        {/* Status */}
        <ListItem disablePadding sx={{ display: 'block' }}>
          <Tooltip title={showText ? '' : 'System Status'} placement="right" arrow>
            <ListItemButton
              selected={location.pathname === '/status'}
              onClick={() => {
                navigate('/status')
                setMobileOpen(false)
              }}
              sx={{
                minHeight: 48,
                justifyContent: showText ? 'initial' : 'center',
                px: 2.5,
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: showText ? 2 : 'auto',
                  justifyContent: 'center',
                }}
              >
                <StatusIcon />
              </ListItemIcon>
              {showText && <ListItemText primary="Status" />}
            </ListItemButton>
          </Tooltip>
        </ListItem>

        {/* Collapse/Expand button - only on desktop */}
        {showCollapseButton && (
          <ListItem disablePadding sx={{ display: 'block' }}>
            <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right" arrow>
              <ListItemButton
                onClick={handleCollapseToggle}
                sx={{
                  minHeight: 48,
                  justifyContent: 'center',
                  px: 2.5,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 0,
                    justifyContent: 'center',
                  }}
                >
                  {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                </ListItemIcon>
              </ListItemButton>
            </Tooltip>
          </ListItem>
        )}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex' }}>
      {/* AppBar */}
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar>
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/* Breadcrumbs */}
          <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" sx={{ color: 'inherit', opacity: 0.7 }} />}
            sx={{ flexGrow: 1, color: 'inherit' }}
          >
            <Link
              component="button"
              underline="hover"
              sx={{ display: 'flex', alignItems: 'center', color: 'inherit', opacity: 0.8 }}
              onClick={() => navigate('/dashboard')}
            >
              <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
            </Link>
            {breadcrumbs.map(({ path, name, isLast }) =>
              isLast ? (
                <Typography key={path} color="inherit" fontWeight={500}>
                  {name}
                </Typography>
              ) : (
                <Link
                  key={path}
                  component="button"
                  underline="hover"
                  color="inherit"
                  sx={{ opacity: 0.8 }}
                  onClick={() => navigate(path)}
                >
                  {name}
                </Link>
              )
            )}
          </Breadcrumbs>

          {/* Dark mode toggle */}
          <Tooltip title={settings.darkMode ? 'Light mode' : 'Dark mode'}>
            <IconButton color="inherit" onClick={toggleDarkMode} sx={{ mr: 1 }}>
              {settings.darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>

          {/* User menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>
              {mockUser.name}
            </Typography>
            <Tooltip title="Account settings">
              <IconButton onClick={handleUserMenuOpen} sx={{ p: 0 }}>
                <Avatar
                  alt={mockUser.name}
                  src={mockUser.avatar}
                  sx={{ width: 36, height: 36 }}
                />
              </IconButton>
            </Tooltip>
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            onClick={handleUserMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              sx: { mt: 1, minWidth: 200 }
            }}
          >
            <MenuItem disabled>
              <Box>
                <Typography variant="body2" fontWeight={600}>{mockUser.name}</Typography>
                <Typography variant="caption" color="text.secondary">{mockUser.email}</Typography>
              </Box>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { handleUserMenuClose(); navigate('/settings'); }}>
              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
              Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{
          width: { sm: drawerWidth },
          flexShrink: { sm: 0 },
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawerContent(true, false)}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              transition: theme.transitions.create('width', {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              overflowX: 'hidden',
            },
          }}
          open
        >
          {drawerContent(!collapsed, true)}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          backgroundColor: 'background.default',
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
        }}
      >
        <Toolbar />
        {children}
      </Box>
    </Box>
  )
}
