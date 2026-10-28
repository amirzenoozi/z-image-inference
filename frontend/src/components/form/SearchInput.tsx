import { TextInput } from './TextInput'
import { IconButton } from '../IconButton'

interface Props {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  className?: string
}

export function SearchInput({ label, value, placeholder, onChange, className }: Props) {
  return (
    <TextInput
      type="search"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      icon={<SearchIcon />}
      end={
        value && (
          <IconButton label="Clear search" onClick={() => onChange('')} className="flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
            ×
          </IconButton>
        )
      }
    />
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 4 4" strokeLinecap="round" />
    </svg>
  )
}
