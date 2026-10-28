import { useState } from 'react'
import { createCharacter } from '../../api'
import { useCharacters } from '../../lib/characters'
import { errorMessage } from '../../lib/hooks'
import type { BuilderState } from '../../lib/promptBuilder/build'
import { characterProblem, traitsOf, traitsSummary } from '../../lib/promptBuilder/character'
import { secondaryButtonClass } from '../../lib/styles'
import type { Character } from '../../types'
import { TextInput } from '../form/TextInput'
import { UserRound } from 'lucide-react'

/** Shown in place of the Subject, Face & hair and Body steps while a character is chosen: its look is fixed. */
export function CharacterSummary({ character }: { character: Character }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <UserRound className="mt-0.5 shrink-0 text-violet-500" />
      <div className="space-y-1">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">{character.name}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">{traitsSummary(character.traits)}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          The face, hair and body come from this character. Change them on the Characters page, or pick “No character” in Create.
        </p>
      </div>
    </div>
  )
}

type SaveState = { status: 'closed' } | { status: 'editing'; error: string | null } | { status: 'saving' }

/** Saves the Subject, Face & hair and Body choices as a named character, which Create then uses. */
export function SaveAsCharacter({ state, onSaved }: { state: BuilderState; onSaved: (character: Character) => void }) {
  const { reload } = useCharacters()
  const [name, setName] = useState('')
  const [save, setSave] = useState<SaveState>({ status: 'closed' })
  if (save.status === 'closed') {
    return (
      <button type="button" onClick={() => setSave({ status: 'editing', error: null })} className={`${secondaryButtonClass} mt-4`}>
        Save as character…
      </button>
    )
  }
  const traits = traitsOf(state)
  const submit = async () => {
    const problem = characterProblem(name, traits)
    if (problem) return setSave({ status: 'editing', error: problem })
    setSave({ status: 'saving' })
    try {
      const character = await createCharacter({ name: name.trim(), traits })
      reload()
      onSaved(character)
    } catch (error) {
      setSave({ status: 'editing', error: errorMessage(error) })
    }
  }
  return (
    <form
      aria-label="Save as character"
      className="mt-4 space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p className="text-xs text-zinc-600 dark:text-zinc-300">Keeps who they are, their face, hair and body, so every image of them matches.</p>
      <div className="flex gap-2">
        <TextInput aria-label="Character name" placeholder="Name, e.g. Ava" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} className="flex-1" autoFocus />
        <button type="button" onClick={() => setSave({ status: 'closed' })} className={secondaryButtonClass}>
          Cancel
        </button>
        <button type="submit" disabled={save.status === 'saving'} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
          {save.status === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      {save.status === 'editing' && save.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {save.error}
        </p>
      )}
    </form>
  )
}
