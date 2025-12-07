import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { KeyboardArrowDown as LoadMoreIcon } from '@mui/icons-material'

interface LoadMoreProps {
  currentCount: number
  totalCount: number
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
}

/**
 * Consistent "Load More" component for paginated lists.
 * Shows count, loading state, and load more button.
 */
export function LoadMore({
  currentCount,
  totalCount,
  hasMore,
  isLoading,
  onLoadMore,
}: LoadMoreProps) {
  return (
    <Box sx={{ p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
      {isLoading ? (
        <CircularProgress size={24} />
      ) : hasMore ? (
        <>
          <Typography variant="caption" color="text.secondary">
            Showing {currentCount} of {totalCount}
          </Typography>
          <Button
            variant="outlined"
            endIcon={<LoadMoreIcon />}
            onClick={onLoadMore}
          >
            Load More
          </Button>
        </>
      ) : currentCount > 0 ? (
        <Typography variant="caption" color="text.secondary">
          Showing all {totalCount} items
        </Typography>
      ) : null}
    </Box>
  )
}
