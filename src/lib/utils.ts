import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })

export function formatINR(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  return inr.format(Number.isFinite(n) ? n : 0)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function humanize(s: string): string {
  if (s === 'upi') return 'UPI'
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function parseAmenities(s?: string): string[] {
  return Array.from(new Set((s ?? '').split(',').map((x) => x.trim()).filter(Boolean))).slice(0, 30)
}

export function emptyToNull(v?: string | null): string | null {
  const t = v?.trim()
  return t ? t : null
}

/** Strip characters that act as wildcards in ILIKE so user text is matched literally. */
export function likeTerm(q: string): string {
  return q.replace(/[%_\\,()]/g, '').trim()
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** Post-login redirect target: same-site absolute paths only (no //host, backslashes, schemes or whitespace). */
export function safeRedirect(from: unknown): string {
  return typeof from === 'string' && /^\/(?![/\\])[^\\\s:]*$/.test(from) && from !== '/login' ? from : '/app'
}
