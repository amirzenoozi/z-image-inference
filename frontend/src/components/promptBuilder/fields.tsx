import { useId, type ReactNode } from 'react'
import { INHERIT_SCENE, NOT_SET, RANDOM, REMOVE } from '../../lib/promptBuilder/build'
import { chipClass, fieldClass, tabClass } from '../../lib/styles'

const labelClass = 'text-[11px] font-medium text-zinc-600 dark:text-zinc-300'

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">{children}</div>
}

export function StepIntro({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">{children}</p>
}

interface ChoiceSelectProps {
  label: string
  value: string
  groups: { label?: string; options: readonly string[] }[]
  allowRemove?: boolean
  allowInherit?: boolean
  allowRandom?: boolean
  onChange: (value: string) => void
}

export function ChoiceSelect({ label, value, groups, allowRemove = false, allowInherit = false, allowRandom = true, onChange }: ChoiceSelectProps) {
  const id = useId()
  const known = groups.some((group) => group.options.includes(value)) || [NOT_SET, RANDOM, REMOVE, INHERIT_SCENE].includes(value)
  return (
    <div className={labelClass}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={known ? value : NOT_SET} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} mt-1 py-1.5 text-xs`}>
        <option value={NOT_SET}>Not set</option>
        {allowRandom && <option value={RANDOM}>🎲 Random</option>}
        {allowRemove && <option value={REMOVE}>Remove (without)</option>}
        {allowInherit && <option value={INHERIT_SCENE}>Match the scene</option>}
        {groups.map((group, index) =>
          group.label ? (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => <option key={option} value={option}>{option}</option>)}
            </optgroup>
          ) : (
            group.options.map((option) => <option key={`${index}-${option}`} value={option}>{option}</option>)
          ),
        )}
      </select>
    </div>
  )
}

interface TextFieldProps {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  wide?: boolean
}

export function TextField({ label, value, placeholder, onChange, wide = false }: TextFieldProps) {
  const id = useId()
  return (
    <div className={`${labelClass} ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="text" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} mt-1 py-1.5 text-xs`} />
    </div>
  )
}

interface ChipGroupProps {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (value: string[]) => void
}

/** Multi-select chips; the order they were picked in is the order they appear in the prompt. */
export function ChipGroup({ label, options, value, onChange }: ChipGroupProps) {
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])
  return (
    <fieldset className="sm:col-span-2">
      <legend className={labelClass}>{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button key={option} type="button" aria-pressed={value.includes(option)} onClick={() => toggle(option)} className={`rounded-full border px-2.5 py-1 text-xs transition ${chipClass(value.includes(option))}`}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className={labelClass}>{label}</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 sm:grid-cols-4 dark:bg-zinc-800/70">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-lg py-1.5 text-xs font-medium transition ${tabClass(value === option.value)}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
