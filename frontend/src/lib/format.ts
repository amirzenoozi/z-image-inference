const GB = 1_000_000_000

/** Bytes as gigabytes with one decimal, e.g. "4.1 GB". */
export function formatGb(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`
}

export function gigabytes(gb: number): number {
  return gb * GB
}
