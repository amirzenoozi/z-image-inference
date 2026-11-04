import { Component, Suspense, type ReactNode } from 'react'
import { t } from '../../../i18n'
import { ErrorNotice } from '../ui'

interface Props {
  /** Shown while the part's code loads the first time it is opened. */
  fallback: ReactNode
  /** A dialog: a failure shows over the page, where the dialog would be. */
  dialog?: boolean
  children: ReactNode
}

/**
 * A part of the app that loads its code the first time it is opened (`lazy`). If that fails, usually because the app was
 * rebuilt while this page was open and the old file is gone, it says so with a way to reload, instead of the page going blank.
 */
export function LazyPart({ fallback, dialog = false, children }: Props) {
  return (
    <LoadBoundary dialog={dialog}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </LoadBoundary>
  )
}

class LoadBoundary extends Component<{ dialog: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    const notice = <ErrorNotice message={t('common.partNotLoaded')} onRetry={() => window.location.reload()} />
    if (!this.props.dialog) return <div className="mx-auto max-w-md p-8">{notice}</div>
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">{notice}</div>
  }
}
