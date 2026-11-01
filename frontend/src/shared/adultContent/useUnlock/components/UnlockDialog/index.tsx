import { useState, type FormEvent } from 'react'
import { checkUnlockWord } from '../../../../../api'
import { t } from '../../../../../i18n'
import { errorMessage } from '../../../../../lib/hooks'
import { secondaryButtonClass } from '../../../../../lib/styles'
import { TextInput } from '../../../../form/TextInput'
import { Modal } from '../../../../ui/Modal'

type Check = { status: 'idle' } | { status: 'checking' } | { status: 'wrong' } | { status: 'failed'; error: string }

/** The hidden word typed into a field, for phones; the right one switches the lock and closes the dialog. */
export function UnlockDialog({ onMatch, onClose }: { onMatch: () => void; onClose: () => void }) {
  const [word, setWord] = useState('')
  const [check, setCheck] = useState<Check>({ status: 'idle' })
  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    setCheck({ status: 'checking' })
    try {
      if (!(await checkUnlockWord(word))) return setCheck({ status: 'wrong' })
      onMatch()
      onClose()
    } catch (error) {
      setCheck({ status: 'failed', error: errorMessage(error) })
    }
  }
  const checking = check.status === 'checking'
  return (
    <Modal
      title={t('common.unlockTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('common.cancel')}
          </button>
          <button type="button" onClick={() => void submit()} disabled={checking || !word} className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 max-sm:w-full">
            {t('common.unlockConfirm')}
          </button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-2">
        <label htmlFor="unlock-word" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {t('common.unlockLabel')}
        </label>
        <TextInput id="unlock-word" type="password" autoFocus autoComplete="off" value={word} onChange={(event) => setWord(event.target.value)} className="text-base sm:text-sm" />
        {check.status === 'wrong' && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{t('common.unlockWrong')}</p>}
        {check.status === 'failed' && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{check.error}</p>}
      </form>
    </Modal>
  )
}
