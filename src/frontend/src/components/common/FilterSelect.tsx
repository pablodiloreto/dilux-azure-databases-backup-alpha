import { FormControl, Select, MenuItem, SelectChangeEvent } from '@mui/material'

export interface FilterOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  options: FilterOption[]
  allLabel: string
  onChange: (value: string) => void
  minWidth?: number
  disabled?: boolean
}

/**
 * Consistent filter select component.
 * Shows "All X" as default value (not floating label).
 * When a value is selected, it shows the selected value.
 */
export function FilterSelect({
  value,
  options,
  allLabel,
  onChange,
  minWidth = 140,
  disabled = false,
}: FilterSelectProps) {
  const handleChange = (event: SelectChangeEvent<string>) => {
    onChange(event.target.value)
  }

  return (
    <FormControl size="small" sx={{ minWidth }}>
      <Select
        value={value}
        onChange={handleChange}
        displayEmpty
        disabled={disabled}
      >
        <MenuItem value="">{allLabel}</MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
