import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Building2, MapPin, Pencil, Plus, RotateCcw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pager, Select, Skeleton, statusTone } from '@/components/ui'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useDebounced } from '@/components/GlobalSearch'
import { errMsg } from '@/lib/errors'
import { humanize, likeTerm } from '@/lib/utils'
import type { Property, PropertySummary } from '@/lib/types'
import { PropertyFormModal } from './forms'

const PAGE = 9

export default function Properties() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'active' | 'archived'>('active')
  const [editing, setEditing] = useState<Property | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ p: Property; archive: boolean } | null>(null)
  const q = likeTerm(useDebounced(text, 300))
  const toast = useToast()
  const qc = useQueryClient()

  const list = useQuery({
    queryKey: ['properties', { q, page, status }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('properties').select('*', { count: 'exact' }).is('deleted_at', null).eq('status', status).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
      if (q) query = query.ilike('name', `%${q}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: (data ?? []) as Property[], total: count ?? 0 }
    },
  })
  const summary = useQuery({
    queryKey: ['owner-prop-summary'],
    queryFn: async () => { const { data, error } = await supabase.rpc('owner_property_summary'); if (error) throw error; return (data ?? []) as PropertySummary[] },
  })
  const counts = new Map((summary.data ?? []).map((s) => [s.property_id, s]))

  const archive = useMutation({
    mutationFn: async ({ p, archive }: { p: Property; archive: boolean }) => {
      const { error } = await supabase.from('properties').update({ status: archive ? 'archived' : 'active' }).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => { void qc.invalidateQueries(); toast.success(v.archive ? 'Property archived.' : 'Property restored.'); setConfirm(null) },
    onError: (e) => { toast.error(errMsg(e)); setConfirm(null) },
  })

  const onSearch = (v: string) => { setText(v); setPage(1); setParams(v ? { q: v } : {}, { replace: true }) }

  return (
    <>
      <PageHeader title="My properties" description="Buildings and houses you rent out." actions={<Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />Add property</Button>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input className="pl-9" placeholder="Search by property name" aria-label="Search properties" value={text} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" className="sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value as 'active' | 'archived'); setPage(1) }}>
          <option value="active">Active</option><option value="archived">Archived</option>
        </Select>
      </div>

      {list.isError ? <Card><ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /></Card>
        : list.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
        : list.data && list.data.rows.length === 0 ? (
          <Card><EmptyState icon={Building2} title={q ? 'No properties match your search' : status === 'archived' ? 'No archived properties' : 'No properties yet'} description={q || status === 'archived' ? undefined : 'Add your first property to start managing units and tenants.'} action={!q && status === 'active' ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}>Add property</Button> : undefined} /></Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.data?.rows.map((p) => {
                const c = counts.get(p.id)
                return (
                  <Card key={p.id} className="flex flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/owner/properties/${p.id}`} className="min-w-0"><h2 className="truncate font-semibold text-ink hover:text-brand">{p.name}</h2></Link>
                      <Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink-mute">{humanize(p.property_type)}{p.building_name ? ` · ${p.building_name}` : ''}</p>
                    <p className="mt-3 flex items-start gap-1.5 text-sm text-ink-soft"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{p.address_line}, {p.city}, {p.state} {p.pincode}</span></p>
                    <p className="mt-3 text-sm"><span className="font-medium">{c?.total_units ?? 0}</span> units · <span className="font-medium">{c?.occupied_units ?? 0}</span> occupied</p>
                    <div className="mt-4 flex gap-2 border-t border-line pt-3">
                      <Link to={`/owner/properties/${p.id}`} className="flex-1"><Button variant="secondary" size="sm" className="w-full">Open</Button></Link>
                      <Button variant="ghost" size="sm" aria-label={`Edit ${p.name}`} onClick={() => { setEditing(p); setFormOpen(true) }}><Pencil className="h-4 w-4" /></Button>
                      {p.status === 'active'
                        ? <Button variant="ghost" size="sm" aria-label={`Archive ${p.name}`} onClick={() => setConfirm({ p, archive: true })}><Archive className="h-4 w-4" /></Button>
                        : <Button variant="ghost" size="sm" aria-label={`Restore ${p.name}`} onClick={() => setConfirm({ p, archive: false })}><RotateCcw className="h-4 w-4" /></Button>}
                    </div>
                  </Card>
                )
              })}
            </div>
            <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}

      <PropertyFormModal open={formOpen} onClose={() => setFormOpen(false)} property={editing} />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.archive ? 'Archive property?' : 'Restore property?'}
        message={confirm?.archive ? <>“{confirm?.p.name}” will be hidden from your active list. Properties with active tenants cannot be archived. You can restore it later.</> : <>“{confirm?.p.name}” will return to your active properties.</>}
        confirmLabel={confirm?.archive ? 'Archive' : 'Restore'}
        danger={confirm?.archive}
        loading={archive.isPending}
        onConfirm={() => confirm && archive.mutate(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}
