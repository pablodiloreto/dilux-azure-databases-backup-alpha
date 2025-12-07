import { ReactNode } from 'react'
import { Button, Paper, Stack } from '@mui/material'
import { Search as SearchIcon, FilterAltOff as ClearFiltersIcon } from '@mui/icons-material'

interface FilterBarProps {
  children: ReactNode
  hasActiveFilters: boolean
  hasChanges: boolean
  onSearch: () => void
  onClear: () => void
  isLoading?: boolean
}

/**
 * Consistent filter bar component.
 * - Shows filters in a row
 * - Search button is disabled until filters change
 * - Clear filters button appears only when filters are active
 * - Clear automatically resets to default state
 */
export function FilterBar({
  children,
  hasActiveFilters,
  hasChanges,
  onSearch,
  onClear,
  isLoading = false,
}: FilterBarProps) {
  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        {children}

        <Button
          variant="contained"
          startIcon={<SearchIcon />}
          onClick={onSearch}
          disabled={isLoading || !hasChanges}
          sx={{ minWidth: 100, height: 40 }}
        >
          Search
        </Button>

        {hasActiveFilters && (
          <Button
            variant="text"
            startIcon={<ClearFiltersIcon />}
            onClick={onClear}
            color="inherit"
            sx={{ height: 40 }}
          >
            Clear filters
          </Button>
        )}
      </Stack>
    </Paper>
  )
}

// Re-export FilterSelect for convenience
export { FilterSelect } from './FilterSelect'
export type { FilterOption } from './FilterSelect'
