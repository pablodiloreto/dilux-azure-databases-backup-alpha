import { Box, LinearProgress, Skeleton, Fade } from '@mui/material'

interface LoadingOverlayProps {
  loading: boolean
  /** Show a subtle linear progress bar at the top instead of overlay */
  variant?: 'overlay' | 'linear' | 'skeleton-table' | 'skeleton-cards'
  /** Number of skeleton rows/cards to show */
  count?: number
  /** Column count for table skeleton */
  columns?: number
}

/**
 * A loading indicator component with multiple variants:
 * - 'linear': Subtle progress bar at top (recommended for refreshes)
 * - 'skeleton-table': Table row skeletons
 * - 'skeleton-cards': Card skeletons
 * - 'overlay': Legacy overlay with spinner (not recommended)
 */
export function LoadingOverlay({
  loading,
  variant = 'linear',
  count = 5,
  columns = 6,
}: LoadingOverlayProps) {
  if (!loading) return null

  // Linear progress bar - subtle indicator at top
  if (variant === 'linear') {
    return (
      <Fade in={loading} timeout={200}>
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
          <LinearProgress />
        </Box>
      </Fade>
    )
  }

  // Table skeleton
  if (variant === 'skeleton-table') {
    return (
      <Box sx={{ width: '100%' }}>
        {Array.from({ length: count }).map((_, rowIndex) => (
          <Box
            key={rowIndex}
            sx={{
              display: 'flex',
              gap: 2,
              py: 1.5,
              px: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                variant="text"
                sx={{
                  flex: colIndex === columns - 2 ? 2 : 1,
                  height: 24,
                }}
              />
            ))}
          </Box>
        ))}
      </Box>
    )
  }

  // Card skeleton
  if (variant === 'skeleton-cards') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Array.from({ length: count }).map((_, index) => (
          <Box
            key={index}
            sx={{
              p: 2,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Skeleton variant="text" width="40%" height={24} />
              <Skeleton variant="rounded" width={60} height={24} />
            </Box>
            <Skeleton variant="text" width="60%" height={20} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Skeleton variant="text" width="30%" height={16} />
              <Skeleton variant="text" width="25%" height={16} />
            </Box>
          </Box>
        ))}
      </Box>
    )
  }

  // Legacy overlay (kept for backwards compatibility but not recommended)
  return (
    <Fade in={loading} timeout={200}>
      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
        <LinearProgress />
      </Box>
    </Fade>
  )
}

/**
 * Table skeleton for initial loading state
 */
export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <Box sx={{ width: '100%' }}>
      {/* Header skeleton */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          py: 1.5,
          px: 2,
          borderBottom: '2px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton
            key={colIndex}
            variant="text"
            sx={{
              flex: colIndex === columns - 2 ? 2 : 1,
              height: 20,
            }}
          />
        ))}
      </Box>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Box
          key={rowIndex}
          sx={{
            display: 'flex',
            gap: 2,
            py: 1.5,
            px: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              sx={{
                flex: colIndex === columns - 2 ? 2 : 1,
                height: 24,
              }}
            />
          ))}
        </Box>
      ))}
    </Box>
  )
}

/**
 * Card list skeleton for initial loading state
 */
export function CardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: count }).map((_, index) => (
        <Box
          key={index}
          sx={{
            p: 2,
            borderRadius: 1,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Skeleton variant="circular" width={20} height={20} />
              <Skeleton variant="text" width={120} height={24} />
            </Box>
            <Skeleton variant="rounded" width={60} height={20} />
          </Box>
          <Skeleton variant="text" width="70%" height={20} sx={{ mb: 0.5 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Skeleton variant="text" width="35%" height={16} />
            <Skeleton variant="text" width="30%" height={16} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}

/**
 * Stats cards skeleton
 */
export function StatsCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      {Array.from({ length: count }).map((_, index) => (
        <Box
          key={index}
          sx={{
            flex: '1 1 200px',
            p: 2,
            borderRadius: 1,
            bgcolor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Skeleton variant="text" width="60%" height={20} sx={{ mb: 1 }} />
          <Skeleton variant="text" width="40%" height={36} />
        </Box>
      ))}
    </Box>
  )
}
