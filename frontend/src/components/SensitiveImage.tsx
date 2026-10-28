import { t } from '../i18n'
import { EyeOff } from 'lucide-react'

interface Props {
  src: string
  sensitive: boolean
  /** The frame's size and shape; the image fills it. */
  className?: string
  imgClassName?: string
  /** Hides the "Sensitive" label, for thumbnails too small to hold it. */
  compact?: boolean
}

/** An image for lists and thumbnails, blurred when it is sensitive; opening the image shows it as it is. */
export function SensitiveImage({ src, sensitive, className = '', imgClassName = '', compact = false }: Props) {
  return (
    <span className={`relative block overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${className}`}>
      <img src={src} alt="" loading="lazy" className={`size-full object-cover ${sensitive ? 'scale-110 blur-xl' : ''} ${imgClassName}`} />
      {sensitive && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/20 text-xs font-medium text-white">
          <EyeOff />
          {!compact && t('history.sensitive')}
        </span>
      )}
    </span>
  )
}
