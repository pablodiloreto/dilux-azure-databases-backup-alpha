import { useState, ReactNode } from 'react'
import {
  Box,
  Card,
  CardContent,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
  Divider,
  Stack,
} from '@mui/material'
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material'

export interface Column<T> {
  id: string
  label: string
  // Render function for both table cell and mobile card
  render: (row: T) => ReactNode
  // Optional: hide in mobile summary (shown only when expanded)
  hideInMobileSummary?: boolean
  // Optional: align for table cell
  align?: 'left' | 'center' | 'right'
  // Optional: min width for table cell
  minWidth?: number
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  // For mobile: which columns to show in the collapsed summary (max 2-3)
  mobileSummaryColumns?: string[]
  // For mobile: title to show (usually first column)
  mobileTitle?: (row: T) => ReactNode
  // Optional: actions column (shown at the end)
  actions?: (row: T) => ReactNode
  // Empty state
  emptyMessage?: string
  // Size
  size?: 'small' | 'medium'
}

interface MobileRowProps<T> {
  row: T
  columns: Column<T>[]
  mobileTitle?: (row: T) => ReactNode
  mobileSummaryColumns?: string[]
  actions?: (row: T) => ReactNode
}

function MobileRow<T>({
  row,
  columns,
  mobileTitle,
  mobileSummaryColumns,
  actions,
}: MobileRowProps<T>) {
  const [expanded, setExpanded] = useState(false)

  // Columns to show in summary (collapsed view)
  const summaryColumns = mobileSummaryColumns
    ? columns.filter((c) => mobileSummaryColumns.includes(c.id))
    : columns.filter((c) => !c.hideInMobileSummary).slice(0, 3)

  // Columns to show only when expanded
  const expandedColumns = columns.filter(
    (c) => !summaryColumns.find((sc) => sc.id === c.id)
  )

  return (
    <Card sx={{ mb: 1 }} variant="outlined">
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        {/* Header row - always visible */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: expandedColumns.length > 0 ? 'pointer' : 'default',
          }}
          onClick={() => expandedColumns.length > 0 && setExpanded(!expanded)}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            {mobileTitle && (
              <Typography variant="subtitle2" fontWeight={600} noWrap>
                {mobileTitle(row)}
              </Typography>
            )}
            {/* Summary columns as chips/tags */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {summaryColumns.map((col) => (
                <Box key={col.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {col.label}:
                  </Typography>
                  <Typography variant="caption" component="span">
                    {col.render(row)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          {/* Actions and expand button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
            {actions && <Box onClick={(e) => e.stopPropagation()}>{actions(row)}</Box>}
            {expandedColumns.length > 0 && (
              <IconButton size="small">
                {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            )}
          </Box>
        </Box>

        {/* Expanded content */}
        {expandedColumns.length > 0 && (
          <Collapse in={expanded}>
            <Divider sx={{ my: 1 }} />
            <Stack spacing={0.5}>
              {expandedColumns.map((col) => (
                <Box
                  key={col.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {col.label}
                  </Typography>
                  <Typography variant="body2">{col.render(row)}</Typography>
                </Box>
              ))}
            </Stack>
          </Collapse>
        )}
      </CardContent>
    </Card>
  )
}

export function ResponsiveTable<T>({
  columns,
  data,
  keyExtractor,
  mobileSummaryColumns,
  mobileTitle,
  actions,
  emptyMessage = 'No data found',
  size = 'small',
}: ResponsiveTableProps<T>) {
  const theme = useTheme()
  // Use 'lg' breakpoint to switch to cards before horizontal scroll occurs
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))

  // Mobile view - cards
  if (isMobile) {
    if (data.length === 0) {
      return (
        <Card variant="outlined">
          <CardContent>
            <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
              {emptyMessage}
            </Typography>
          </CardContent>
        </Card>
      )
    }

    return (
      <Box>
        {data.map((row) => (
          <MobileRow
            key={keyExtractor(row)}
            row={row}
            columns={columns}
            mobileTitle={mobileTitle}
            mobileSummaryColumns={mobileSummaryColumns}
            actions={actions}
          />
        ))}
      </Box>
    )
  }

  // Desktop view - table
  return (
    <TableContainer>
      <Table size={size}>
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell
                key={col.id}
                align={col.align}
                sx={{ minWidth: col.minWidth }}
              >
                {col.label}
              </TableCell>
            ))}
            {actions && <TableCell align="center">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length > 0 ? (
            data.map((row) => (
              <TableRow key={keyExtractor(row)} hover>
                {columns.map((col) => (
                  <TableCell key={col.id} align={col.align}>
                    {col.render(row)}
                  </TableCell>
                ))}
                {actions && <TableCell align="center">{actions(row)}</TableCell>}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length + (actions ? 1 : 0)} align="center">
                <Typography color="text.secondary" sx={{ py: 4 }}>
                  {emptyMessage}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
