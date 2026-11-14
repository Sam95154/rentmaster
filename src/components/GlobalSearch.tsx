import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Search, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { likeTerm } from '@/lib/utils'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t) }, [value, ms])
  return v
}
export { useDebounced }

export function GlobalSearch() {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const q = likeTerm(useDebounced(text, 250))

  const res = useQuery({
    queryKey: ['global-search', q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const [p, t] = await Promise.all([
        supabase.from('properties').select('id,name,city').is('deleted_at', null).ilike('name', `%${q}%`).limit(5),
        supabase.from('tenant_profiles').select('id,full_name,email').is('deleted_at', null).ilike('full_name', `%${q}%`).limit(5),
      ])
      if (p.error) throw p.error
      if (t.error) throw t.error
      return { properties: p.data ?? [], tenants: t.data ?? [] }
    },
  })

  const close = () => { setOpen(false); setText('') }
  const none = res.data && res.data.properties.length === 0 && res.data.tenants.length === 0

  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        placeholder="Search properties and tenants"
        aria-label="Search properties and tenants"
        className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-mute focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {open && q.length >= 2 && (
        <>
          <button type="button" aria-label="Close search" className="fixed inset-0 z-30 cursor-default" onClick={close} />
          <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-96 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-pop">
            {res.isLoading && <p className="px-3 py-2 text-sm text-ink-mute">Searching…</p>}
            {res.isError && <p className="px-3 py-2 text-sm text-danger">Search failed. Try again.</p>}
            {none && <p className="px-3 py-2 text-sm text-ink-mute">No matches for “{q}”.</p>}
            {res.data?.properties.map((p) => (
              <Link key={p.id} to={`/owner/properties/${p.id}`} onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface">
                <Building2 className="h-4 w-4 text-brand" aria-hidden /><span className="truncate">{p.name}</span><span className="ml-auto text-xs text-ink-mute">{p.city}</span>
              </Link>
            ))}
            {res.data?.tenants.map((t) => (
              <Link key={t.id} to={`/owner/tenants/${t.id}`} onClick={close} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface">
                <Users className="h-4 w-4 text-brand" aria-hidden /><span className="truncate">{t.full_name}</span><span className="ml-auto truncate text-xs text-ink-mute">{t.email}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
