import { useState } from 'react'
import { isServerDown } from '../../../lib/modelStatus'
import type { Loadable, ModelCategory, ModelInfo, ModelStatusReport } from '../../../types'
import { secondaryButtonClass } from '../../../lib/styles'
import { Modal } from '../../../shared/ui/Modal'
import { ModelChooser } from './ModelChooser'
import { DownloadBadge, SourceLink } from './modelParts'
import { modelDescription } from '../../../lib/categories'
import { t } from '../../../i18n'

interface Props {
  models: ModelInfo[]
  categories: ModelCategory[]
  selectedId: string
  status: Loadable<ModelStatusReport>
  onSelect: (model: ModelInfo) => void
  onStatusChanged: () => void
}

/** The sidebar shows only the selected model; the full list opens in a dialog. */
export function ModelPicker({ models, categories, selectedId, status, onSelect, onStatusChanged }: Props) {
  const [choosing, setChoosing] = useState(false)
  const selected = models.find((model) => model.id === selectedId) ?? models[0]
  const serverDown = isServerDown(status)
  return (
    <div className="space-y-2">
      <SelectedModel model={selected} status={status} serverDown={serverDown} onChange={() => setChoosing(true)} />
      {serverDown && (
        <p role="status" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <ServerDownNote />
        </p>
      )}
      {choosing && (
        <Modal title={t('create.chooseModel')} onClose={() => setChoosing(false)} size="lg">
          <ModelChooser
            models={models}
            categories={categories}
            selectedId={selected.id}
            status={status}
            serverDown={serverDown}
            onChanged={onStatusChanged}
            onSelect={(model) => {
              onSelect(model)
              setChoosing(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}

interface SelectedModelProps {
  model: ModelInfo
  status: Loadable<ModelStatusReport>
  serverDown: boolean
  onChange: () => void
}

function SelectedModel({ model, status, serverDown, onChange }: SelectedModelProps) {
  return (
    <div role="group" aria-label={t('create.selectedModel')} className="rounded-xl border border-violet-500 bg-violet-50/60 p-3 dark:bg-violet-950/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-violet-900 dark:text-violet-100">{model.label}</span>
        <button type="button" onClick={onChange} className={`${secondaryButtonClass} shrink-0 bg-white py-1 text-xs dark:bg-zinc-900`}>
          {t('create.change')}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{modelDescription(model)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{model.speed_hint}</span>
        <SourceLink model={model} />
      </div>
      {!serverDown && <DownloadBadge model={model} status={status} />}
    </div>
  )
}

/** The command stays as it is; only the sentence around it is translated. */
function ServerDownNote() {
  const [before, after] = t('create.serverDownNote').split('{command}')
  return (
    <>
      {before}
      <code>uv run python backend/model_server.py</code>
      {after}
    </>
  )
}
