import { Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { controlHeight, fieldFrameClass, fieldLabelClass } from '../../lib/styles'
import { Check, ChevronDown } from 'lucide-react'

const buttonClass = `${fieldFrameClass} ${controlHeight} flex w-full items-center justify-between gap-2 px-3 text-left data-open:border-violet-500 data-open:ring-2 data-open:ring-violet-500/30`
const optionsClass =
  'z-[60] max-h-72 w-(--button-width) min-w-44 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg outline-none dark:border-zinc-700 dark:bg-zinc-900'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectGroup {
  /** Shown as a small heading above the group's options; leave out for options without a heading. */
  label?: string
  options: SelectOption[]
}

interface Props {
  label: string
  value: string
  groups: SelectGroup[]
  onChange: (value: string) => void
  /** Keeps the label for screen readers only, for selects whose purpose is clear from where they are. */
  hideLabel?: boolean
  className?: string
}

export function Select({ label, value, groups, onChange, hideLabel = false, className = '' }: Props) {
  const selected = groups.flatMap((group) => group.options).find((option) => option.value === value)
  return (
    <Field className={className}>
      <Label className={hideLabel ? 'sr-only' : `${fieldLabelClass} mb-1 block`}>{label}</Label>
      <Listbox value={value} onChange={onChange}>
        <ListboxButton className={buttonClass}>
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronDown className="shrink-0 text-zinc-400" />
        </ListboxButton>
        <ListboxOptions
          anchor={{ to: 'bottom start', gap: 4 }}
          className={optionsClass}
        >
          {groups.map((group, index) => (
            <OptionGroup key={group.label ?? `group-${index}`} group={group} />
          ))}
        </ListboxOptions>
      </Listbox>
    </Field>
  )
}

interface MultiSelectProps {
  label: string
  values: string[]
  groups: SelectGroup[]
  /** Shown in the button while nothing is picked. */
  placeholder: string
  onChange: (values: string[]) => void
}

/** A select that keeps its list open for ticking several options; the button lists them in the order picked. */
export function MultiSelect({ label, values, groups, placeholder, onChange }: MultiSelectProps) {
  const labels = new Map(groups.flatMap((group) => group.options).map((option) => [option.value, option.label]))
  const shown = values.map((value) => labels.get(value) ?? value).join(', ')
  return (
    <Field>
      <Label className={`${fieldLabelClass} mb-1 block`}>{label}</Label>
      <Listbox value={values} onChange={onChange} multiple>
        <ListboxButton className={buttonClass}>
          <span className="truncate">{shown || placeholder}</span>
          <ChevronDown className="shrink-0 text-zinc-400" />
        </ListboxButton>
        <ListboxOptions
          anchor={{ to: 'bottom start', gap: 4 }}
          className={optionsClass}
        >
          {groups.map((group, index) => (
            <OptionGroup key={group.label ?? `group-${index}`} group={group} />
          ))}
        </ListboxOptions>
      </Listbox>
    </Field>
  )
}

function OptionGroup({ group }: { group: SelectGroup }) {
  const options = group.options.map((option) => <SelectItem key={option.value} option={option} />)
  if (!group.label) return options
  return (
    <div role="group" aria-label={group.label}>
      <div aria-hidden="true" className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
        {group.label}
      </div>
      {options}
    </div>
  )
}

function SelectItem({ option }: { option: SelectOption }) {
  return (
    <ListboxOption
      value={option.value}
      className="group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-zinc-700 select-none data-focus:bg-violet-50 data-focus:text-violet-900 data-selected:font-medium dark:text-zinc-200 dark:data-focus:bg-violet-950/60 dark:data-focus:text-violet-100"
    >
      <Check className="invisible size-4 shrink-0 text-violet-600 group-data-selected:visible dark:text-violet-400" />
      <span className="truncate">{option.label}</span>
    </ListboxOption>
  )
}
