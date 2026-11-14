import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

interface ToastApi { success: (m: string) => void; error: (m: string) => void }
interface Item { id: number; kind: 'success' | 'error'; msg: string }

const Ctx = createContext<ToastApi | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])
  const push = useCallback((kind: Item['kind'], msg: string) => {
    const id = ++seq
    setItems((i) => [...i, { id, kind, msg }])
    window.setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 5000)
  }, [])
  const api = useMemo<ToastApi>(() => ({ success: (m) => push('success', m), error: (m) => push('error', m) }), [push])
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg bg-navy px-4 py-3 text-sm text-white shadow-pop">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used inside ToastProvider')
  return c
}
