import { t } from '../../i18n'
import { TextInput } from './TextInput'
import { IconButton } from '../IconButton'
import { Search, X } from 'lucide-react'

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
      icon={<Search />}
      end={
        value && (
          <IconButton label={t('common.clearSearch')} onClick={() => onChange('')} className="flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
            <X className="size-3.5" />
          </IconButton>
        )
      }
    />
  )
}
