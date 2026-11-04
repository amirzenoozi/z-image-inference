const DIALOG = '[role="dialog"][aria-modal="true"]'

/**
 * Whether the dialog holding `element` is the one on top: the last open dialog in the page, since a dialog opened over
 * another comes after it. Keys a dialog handles (Escape, the image viewer's keys) act only on the top one.
 */
export function isTopDialog(element: Element | null): boolean {
  const own = element?.closest(DIALOG)
  if (!own) return false
  const open = document.querySelectorAll(DIALOG)
  return open[open.length - 1] === own
}
