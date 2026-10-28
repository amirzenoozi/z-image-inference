const GB = 1_000_000_000

/** Bytes as gigabytes with one decimal, e.g. "4.1 GB". */
export function formatGb(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`
}

const MB = 1_000_000

/** Megabytes below 1 GB ("29 MB"), gigabytes above it ("1.2 GB"). */
export function formatSize(bytes: number): string {
  return bytes < GB ? `${Math.round(bytes / MB)} MB` : formatGb(bytes)
}

export function gigabytes(gb: number): number {
  return gb * GB
}
