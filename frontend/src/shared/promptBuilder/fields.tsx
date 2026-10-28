import { useId, type ReactNode } from 'react'
import { optionTitle, t, type MessageKey } from '../../i18n'
import { INHERIT_SCENE, NOT_SET, RANDOM, REMOVE } from '../../lib/promptBuilder/build'
import { fieldLabelClass, tabClass } from '../../lib/styles'
import { MultiSelect, Select, type SelectGroup } from '../form/Select'
import { TextInput } from '../form/TextInput'

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

const SPECIAL_LABELS: Record<string, MessageKey> = {
  [NOT_SET]: 'builder.choiceNotSet',
  [RANDOM]: 'builder.choiceRandom',
  [REMOVE]: 'builder.choiceRemove',
  [INHERIT_SCENE]: 'builder.choiceMatchScene',
}

function choiceGroups({ groups, allowRemove = false, allowInherit = false, allowRandom = true }: ChoiceSelectProps): SelectGroup[] {
  const special = [NOT_SET, ...(allowRandom ? [RANDOM] : []), ...(allowRemove ? [REMOVE] : []), ...(allowInherit ? [INHERIT_SCENE] : [])]
  return [
    { options: special.map((value) => ({ value, label: t(SPECIAL_LABELS[value]) })) },
    ...groups.map((group) => ({ label: group.label, options: group.options.map((option) => ({ value: option, label: optionTitle(option) })) })),
  ]
}

export function ChoiceSelect(props: ChoiceSelectProps) {
  const { label, value, onChange } = props
  const groups = choiceGroups(props)
  const known = groups.some((group) => group.options.some((option) => option.value === value))
  return <Select label={label} value={known ? value : NOT_SET} groups={groups} onChange={onChange} />
}

interface MultiChoiceSelectProps extends Omit<ChoiceSelectProps, 'value' | 'onChange'> {
  values: string[]
  onChange: (values: string[]) => void
}

/** A choice that takes several options; Not set is having none, so it is left out of the list. */
export function MultiChoiceSelect({ values, onChange, ...props }: MultiChoiceSelectProps) {
  const groups = choiceGroups({ ...props, value: NOT_SET, onChange: () => {} })
  const withoutNotSet = groups.map((group) => ({ ...group, options: group.options.filter((option) => option.value !== NOT_SET) }))
  return <MultiSelect label={props.label} values={values} groups={withoutNotSet} placeholder={t('builder.choiceNotSet')} onChange={onChange} />
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
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className={`${fieldLabelClass} mb-1 block`}>
        {label}
      </label>
      <TextInput id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

interface CheckboxGroupProps {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (value: string[]) => void
}

/** Checkboxes for picking several options; the order they were ticked in is the order they appear in the prompt. */
export function CheckboxGroup({ label, options, value, onChange }: CheckboxGroupProps) {
  const toggle = (option: string) => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])
  return (
    <fieldset className="sm:col-span-2">
      <legend className={labelClass}>{label}</legend>
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-start gap-2 text-xs text-zinc-700 dark:text-zinc-200">
            <input type="checkbox" checked={value.includes(option)} onChange={() => toggle(option)} className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-violet-600" />
            {optionTitle(option)}
          </label>
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
