import { t } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { saveEdit } from '../api'
import { errorMessage } from '../lib/hooks'
import { RATIOS, ratioLabel, aspectOf, describeEdits, flip, isChanged, toRecipe, turn, useEditHistory, withRatio, type RatioId } from '../lib/imageEdits'
import { chipClass, secondaryButtonClass } from '../lib/styles'
import type { HistoryItem } from '../types'
import { IconButton } from './IconButton'
import { ImageEditor } from './ImageEditor'
import { ErrorNotice } from './ui'
import { FlipHorizontal2, FlipVertical2, Redo2, RotateCcw, RotateCw, Undo2 } from 'lucide-react'

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'failed'; error: string }

interface Props {
  item: HistoryItem
  /** Set when the viewer wants to close; with unsaved edits the session asks first. */
  closeRequested: boolean
  onCloseAnswered: (close: boolean) => void
  onChangedChange: (changed: boolean) => void
  onCancel: () => void
  onSaved: (item: HistoryItem) => void
}

/** Undo and redo by keyboard while editing; other keys are left alone. */
function useUndoKeys(undo: () => void, redo: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])
}

/** Edit mode of the image view: the editor takes the image's place and the tools take the details' place. */
export function EditSession({ item, closeRequested, onCloseAnswered, onChangedChange, onCancel, onSaved }: Props) {
  const history = useEditHistory()
  const { edits } = history
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const recipe = toRecipe(edits, item)
  const changed = isChanged(edits)
  useUndoKeys(history.undo, history.redo)
  useEffect(() => onChangedChange(changed), [changed, onChangedChange])

  const saveNew = async () => {
    if (recipe.status !== 'ready') return
    setSave({ status: 'saving' })
    try {
      onSaved(await saveEdit(item.id, recipe.recipe))
    } catch (error) {
      setSave({ status: 'failed', error: errorMessage(error) })
    }
  }

  return (
    <>
      <div className="relative h-[60vh] overflow-hidden rounded-xl bg-zinc-100 lg:h-full dark:bg-zinc-800">
        <ImageEditor
          item={item}
          edits={edits}
          aspect={aspectOf(edits.ratio, item, edits.turns)}
          onPreview={(crop) => history.preview({ ...edits, crop })}
          onCommit={(crop) => history.commit({ ...edits, crop })}
        />
      </div>
      <div className="flex min-h-0 flex-col gap-4 text-sm lg:h-full">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <Tools item={item} history={history} />
          <p aria-label={t('history.edits')} className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
            {describeEdits(edits, item)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('history.saveNote')}</p>
          {save.status === 'failed' && <ErrorNotice message={save.error} />}
        </div>
        <div role="group" aria-label={t('history.editActions')} className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {closeRequested ? (
            <DiscardQuestion onAnswer={onCloseAnswered} />
          ) : (
            <>
              {recipe.status === 'invalid' && changed && <p className="text-xs text-red-600 dark:text-red-400">{recipe.reason}</p>}
              <button type="button" onClick={onCancel} className={secondaryButtonClass}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void saveNew()}
                disabled={recipe.status !== 'ready' || save.status === 'saving'}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {save.status === 'saving' ? t('common.saving') : t('history.saveAsNew')}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function DiscardQuestion({ onAnswer }: { onAnswer: (close: boolean) => void }) {
  return (
    <>
      <p role="status" className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
        {t('history.discardQuestion')}
      </p>
      <button type="button" onClick={() => onAnswer(false)} className={secondaryButtonClass}>
        {t('history.keepEditing')}
      </button>
      <button type="button" onClick={() => onAnswer(true)} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500">
        {t('history.discard')}
      </button>
    </>
  )
}

function ToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">{label}</h3>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

const toolClass = `${secondaryButtonClass} inline-flex min-w-10 items-center justify-center`

function Tools({ item, history }: { item: HistoryItem; history: ReturnType<typeof useEditHistory> }) {
  const { edits, commit } = history
  return (
    <>
      <ToolGroup label={t('history.rotate')}>
        <IconButton label={t('history.rotateLeft')} onClick={() => commit(turn(edits, -1))} className={toolClass}>
          <RotateCcw />
        </IconButton>
        <IconButton label={t('history.rotateRight')} onClick={() => commit(turn(edits, 1))} className={toolClass}>
          <RotateCw />
        </IconButton>
      </ToolGroup>
      <ToolGroup label={t('history.flip')}>
        <IconButton label={t('history.flipHorizontally')} onClick={() => commit(flip(edits, 'horizontal'))} className={toolClass}>
          <FlipHorizontal2 />
        </IconButton>
        <IconButton label={t('history.flipVertically')} onClick={() => commit(flip(edits, 'vertical'))} className={toolClass}>
          <FlipVertical2 />
        </IconButton>
      </ToolGroup>
      <ToolGroup label={t('history.crop')}>
        <div role="radiogroup" aria-label={t('history.cropRatio')} className="flex flex-wrap gap-1.5">
          {RATIOS.map((ratio) => (
            <RatioChip key={ratio.id} id={ratio.id} label={ratioLabel(ratio.id)} selected={edits.ratio === ratio.id} onSelect={(id) => commit(withRatio(edits, id, item))} />
          ))}
        </div>
        <button type="button" onClick={() => commit({ ...edits, crop: null })} disabled={!edits.crop} className="text-xs font-medium text-violet-600 hover:text-violet-500 disabled:opacity-40 dark:text-violet-400">
          {t('history.clearCrop')}
        </button>
      </ToolGroup>
      <ToolGroup label={t('history.editHistory')}>
        <IconButton label={t('history.undo')} shortcut="⌘Z" onClick={history.undo} disabled={!history.canUndo} className={toolClass}>
          <Undo2 />
        </IconButton>
        <IconButton label={t('history.redo')} shortcut="⇧⌘Z" onClick={history.redo} disabled={!history.canRedo} className={toolClass}>
          <Redo2 />
        </IconButton>
        <button type="button" onClick={history.reset} disabled={!isChanged(edits)} className={secondaryButtonClass}>
          {t('history.reset')}
        </button>
      </ToolGroup>
    </>
  )
}

function RatioChip({ id, label, selected, onSelect }: { id: RatioId; label: string; selected: boolean; onSelect: (id: RatioId) => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(id)} className={`rounded-lg border px-2.5 py-1 text-xs ${chipClass(selected)}`}>
      {label}
    </button>
  )
}
