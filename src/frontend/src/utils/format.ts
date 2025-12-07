/**
 * Formatting utilities for consistent display across the application.
 */

/**
 * Format bytes to human-readable file size.
 * Uses 2 decimal places for consistency.
 *
 * @param bytes - Size in bytes (can be null/undefined)
 * @returns Formatted string (e.g., "1.50 MB", "256.00 KB")
 */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return '-'

  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024

  if (bytes < KB) {
    return `${bytes} bytes`
  }
  if (bytes < MB) {
    return `${(bytes / KB).toFixed(2)} KB`
  }
  if (bytes < GB) {
    return `${(bytes / MB).toFixed(2)} MB`
  }
  return `${(bytes / GB).toFixed(2)} GB`
}

/**
 * Format duration in seconds to human-readable string.
 *
 * @param seconds - Duration in seconds (can be null/undefined)
 * @returns Formatted string (e.g., "1m 30s", "45.5s")
 */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null || seconds === 0) return '-'

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}
