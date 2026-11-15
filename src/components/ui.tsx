import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-brand text-white shadow-sm hover:bg-brand-600 hover:shadow-glow active:scale-[0.98]',
  secondary: 'border border-line bg-white text-ink hover:bg-surface',
  danger: 'bg-danger text-white hover:bg-red-600',
  ghost: 'text-ink-soft hover:bg-surface',
} as const

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  size?: 'sm' | 'md'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

const fieldBase =
  'w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-ink-mute transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-surface disabled:text-ink-mute'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(fieldBase, 'h-10', invalid ? 'border-danger' : 'border-line', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={invalid || undefined} className={cn(fieldBase, 'h-10', invalid ? 'border-danger' : 'border-line', className)} {...rest}>
        {children}
      </select>
    )
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ invalid, className, ...rest }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(fieldBase, 'min-h-[84px] py-2', invalid ? 'border-danger' : 'border-line', className)} {...rest} />
  },
)

export function Field({ label, error, hint, className, children }: { label: string; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-line bg-white shadow-card', className)}>{children}</div>
}

export function CardHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="truncate text-xs text-ink-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

const tones = {
  neutral: 'bg-surface text-ink-soft ring-line',
  success: 'bg-success-50 text-success ring-success/20',
  warning: 'bg-warning-50 text-amber-700 ring-warning/30',
  danger: 'bg-danger-50 text-danger ring-danger/20',
  info: 'bg-brand-50 text-brand-700 ring-brand/20',
} as const
export type Tone = keyof typeof tones

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'available': case 'active': case 'verified': case 'paid': case 'success': case 'held': return 'success'
    case 'occupied': case 'invited': case 'partially_paid': case 'partially_refunded': return 'info'
    case 'reserved': case 'pending': case 'under_maintenance': case 'unverified': return 'warning'
    case 'rejected': case 'suspended': case 'overdue': case 'failed': case 'refunded': return 'danger'
    default: return 'neutral'
  }
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line/70', className)} aria-hidden />
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand"><Icon className="h-6 w-6" aria-hidden /></div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-sm text-danger">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-col gap-2 sm:flex-row sm:items-center [&>*]:w-full sm:[&>*]:w-auto">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'info' }: { label: string; value: ReactNode; hint?: string; icon: LucideIcon; tone?: Tone }) {
  return (
    <Card className="p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-mute sm:truncate">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold text-ink sm:text-2xl">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-ink-mute sm:truncate">{hint}</p>}
        </div>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone === 'success' ? 'bg-success-50 text-success' : tone === 'warning' ? 'bg-warning-50 text-warning' : tone === 'danger' ? 'bg-danger-50 text-danger' : 'bg-brand-50 text-brand')}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
    </Card>
  )
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="relative overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">{children}</table></div>
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cn('whitespace-nowrap border-b border-line bg-surface/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-mute', className)}>{children}</th>
)
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cn('border-b border-line px-4 py-3 align-middle text-ink', className)}>{children}</td>
)

export function SortButton({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink" aria-label={`Sort by ${label}`}>
      {label}<span aria-hidden>{active ? (dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  )
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-soft">
      <span>{from}–{to} of {total}</span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="px-2">Page {page} / {pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand', className)} aria-label="Loading" />
}

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="7" fill={light ? '#F4F3F0' : '#0E1621'} />
        <path d="M9 26V12.5L15 8v18z" fill={light ? '#1F5A8A' : '#5E86A8'} />
        <path d="M15 26V5.5L23 9v17z" fill={light ? '#0E1621' : '#F4F3F0'} />
        <g fill="#C8963E"><rect x="17" y="10" width="1.8" height="2.4" /><rect x="20.2" y="10.8" width="1.8" height="2.4" /><rect x="17" y="15" width="1.8" height="2.4" /><rect x="20.2" y="15.8" width="1.8" height="2.4" /><rect x="17" y="20" width="1.8" height="2.4" /></g>
      </svg>
      <span className={light ? 'text-white' : 'text-navy'}>RentMaster</span>
    </span>
  )
}
