import { Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { controlHeight, fieldFrameClass, fieldLabelClass } from '../../lib/styles'

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
        <ListboxButton className={`${fieldFrameClass} ${controlHeight} flex w-full items-center justify-between gap-2 px-3 text-left data-open:border-violet-500 data-open:ring-2 data-open:ring-violet-500/30`}>
          <span className="truncate">{selected?.label ?? value}</span>
          <Chevron />
        </ListboxButton>
        <ListboxOptions
          anchor={{ to: 'bottom start', gap: 4 }}
          className="z-[60] max-h-72 w-(--button-width) min-w-44 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg outline-none dark:border-zinc-700 dark:bg-zinc-900"
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
      className="group flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-sm text-zinc-700 select-none data-focus:bg-violet-50 data-focus:text-violet-900 data-selected:font-medium dark:text-zinc-200 dark:data-focus:bg-violet-950/60 dark:data-focus:text-violet-100"
    >
      <span aria-hidden="true" className="invisible w-3.5 shrink-0 text-violet-600 group-data-selected:visible dark:text-violet-400">
        ✓
      </span>
      <span className="truncate">{option.label}</span>
    </ListboxOption>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="size-4 shrink-0 text-zinc-400">
      <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
