import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Plus, Send, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, Textarea } from '@/components/ui'
import { FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { commentSchema, MAINT_CATEGORIES, MAINT_STATUSES, maintenanceOwnerSchema, maintenanceSchema, URGENCIES, type MaintenanceForm, type MaintenanceOwnerForm } from '@/lib/schemas'
import { emptyToNull, formatDate, formatINR, humanize } from '@/lib/utils'
import type { MaintenanceAttachment, MaintenanceComment, MaintenanceReq } from '@/lib/types'
import { useTenancies } from '../tenant/hooks'

type Role = 'owner' | 'tenant'
const PAGE = 12
const MAX_PHOTOS = 3
const IMG: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const urgencyTone = (u: string) => (u === 'emergency' ? 'danger' : u === 'high' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral'
const statusToneM = (s: string) => (s === 'resolved' || s === 'closed' ? 'success' : s === 'rejected' ? 'danger' : s === 'new' ? 'info' : 'warning') as 'success' | 'danger' | 'info' | 'warning'

async function uploadPhotos(files: File[], ownerId: string, requestId: string, userId: string) {
  for (const f of files) {
    const path = `${ownerId}/${requestId}/${crypto.randomUUID()}.${IMG[f.type]}`
    const up = await supabase.storage.from('maintenance-files').upload(path, f, { contentType: f.type })
    if (up.error) throw up.error
    const { error } = await supabase.from('maintenance_attachments').insert({ request_id: requestId, uploaded_by: userId, storage_path: path, mime_type: f.type })
    if (error) { await supabase.storage.from('maintenance-files').remove([path]); throw error }
  }
}

function PhotoPicker({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const toast = useToast(); const ref = useRef<HTMLInputElement>(null)
  const add = (list: FileList | null) => {
    const next = [...files]
    for (const f of Array.from(list ?? [])) {
      if (!IMG[f.type]) { toast.error(`${f.name}: use a JPG, PNG or WebP photo.`); continue }
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is larger than 5 MB.`); continue }
      if (next.length >= MAX_PHOTOS) { toast.error(`You can add up to ${MAX_PHOTOS} photos.`); break }
      next.push(f)
    }
    setFiles(next); if (ref.current) ref.current.value = ''
  }
  return (
    <div>
      <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" id="photo-input" onChange={(e) => add(e.target.files)} />
      <label htmlFor="photo-input" className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface"><ImagePlus className="h-4 w-4" />Add photos</label>
      {files.length > 0 && <ul className="mt-2 space-y-1 text-sm text-ink-soft">{files.map((f, i) => <li key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5"><span className="truncate">{f.name}</span><button type="button" className="text-xs text-danger hover:underline" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></li>)}</ul>}
    </div>
  )
}

function NewRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const tenancies = useTenancies()
  const [files, setFiles] = useState<File[]>([])
  const [tenancyIdx, setTenancyIdx] = useState(0)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<MaintenanceForm>({ resolver: zodResolver(maintenanceSchema) })
  useEffect(() => { if (open) { reset({ title: '', category: 'other', urgency: 'medium', description: '', preferred_visit_at: '' }); setFiles([]); setTenancyIdx(0) } }, [open, reset])
  const list = tenancies.data ?? []
  const m = useMutation({
    mutationFn: async (v: MaintenanceForm) => {
      const t = list[tenancyIdx]; if (!t) throw new Error('You need an active tenancy to raise a request.')
      const { data, error } = await supabase.from('maintenance_requests').insert({
        tenant_id: t.tenant_id, unit_id: t.unit.id, title: v.title, category: v.category, urgency: v.urgency,
        description: emptyToNull(v.description), preferred_visit_at: v.preferred_visit_at ? new Date(`${v.preferred_visit_at}T10:00:00`).toISOString() : null,
      } as never).select('id, owner_id').single()
      if (error) throw error
      const row = data as { id: string; owner_id: string }
      try { await uploadPhotos(files, row.owner_id, row.id, user!.id) } catch { toast.error('The request was sent, but a photo could not be uploaded.') }
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Request sent to your owner.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New maintenance request" description="Describe the problem. Your owner is notified straight away.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {list.length > 1 && <Field label="Which home?" className="sm:col-span-2"><Select value={tenancyIdx} onChange={(e) => setTenancyIdx(Number(e.target.value))}>{list.map((t, i) => <option key={t.assignment_id} value={i}>{t.property.name} · {t.unit.unit_number}</option>)}</Select></Field>}
          <Field label="Title" className="sm:col-span-2" error={errors.title?.message}><Input invalid={!!errors.title} placeholder="e.g. Kitchen tap is leaking" {...register('title')} /></Field>
          <Field label="Category"><Select {...register('category')}>{MAINT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
          <Field label="Urgency"><Select {...register('urgency')}>{URGENCIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
          <Field label="Details (optional)" className="sm:col-span-2" error={errors.description?.message}><Textarea rows={3} {...register('description')} /></Field>
          <Field label="Preferred visit date (optional)"><Input type="date" {...register('preferred_visit_at')} /></Field>
          <Field label={`Photos (up to ${MAX_PHOTOS}, optional)`}><PhotoPicker files={files} setFiles={setFiles} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Send request" loading={m.isPending} />
      </form>
    </Modal>
  )
}

function DetailModal({ req, role, onClose }: { req: MaintenanceReq | null; role: Role; onClose: () => void }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const id = req?.id
  const thread = useQuery({ enabled: !!id, queryKey: ['maint-thread', id], refetchInterval: 15000, queryFn: async () => {
    const [c, a] = await Promise.all([
      supabase.from('maintenance_comments').select('*').eq('request_id', id!).order('created_at'),
      supabase.from('maintenance_attachments').select('*').eq('request_id', id!).order('created_at'),
    ])
    if (c.error) throw c.error; if (a.error) throw a.error
    const atts = (a.data ?? []) as MaintenanceAttachment[]
    const urls = atts.length ? await supabase.storage.from('maintenance-files').createSignedUrls(atts.map((x) => x.storage_path), 300) : { data: [] }
    return { comments: (c.data ?? []) as MaintenanceComment[], photos: (urls.data ?? []).filter((u) => u.signedUrl).map((u) => u.signedUrl as string) }
  } })
  const detail = useQuery({ enabled: !!id, queryKey: ['maint-req', id], queryFn: async () => {
    const { data, error } = await supabase.from('maintenance_requests').select('*').eq('id', id!).single(); if (error) throw error; return data as MaintenanceReq } })
  const r = detail.data ?? req

  const ownerForm = useForm<MaintenanceOwnerForm>({ resolver: zodResolver(maintenanceOwnerSchema) })
  useEffect(() => { if (r) ownerForm.reset({ status: r.status, assigned_to: r.assigned_to ?? '', repair_cost: r.repair_cost === null ? '' : String(r.repair_cost) }) }, [r?.id, r?.status, r?.assigned_to, r?.repair_cost]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async (v: MaintenanceOwnerForm) => {
      const { error } = await supabase.from('maintenance_requests').update({ status: v.status, assigned_to: emptyToNull(v.assigned_to), repair_cost: v.repair_cost ? Number(v.repair_cost) : null }).eq('id', id!)
      if (error) throw error
    }, onSuccess: () => { void qc.invalidateQueries(); toast.success('Request updated.') }, onError: (e) => toast.error(errMsg(e)),
  })
  const cForm = useForm<{ body: string }>({ resolver: zodResolver(commentSchema) })
  const post = useMutation({
    mutationFn: async (v: { body: string }) => { const { error } = await supabase.from('maintenance_comments').insert({ request_id: id!, author_id: user!.id, body: v.body }); if (error) throw error },
    onSuccess: () => { cForm.reset({ body: '' }); void qc.invalidateQueries({ queryKey: ['maint-thread', id] }) }, onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={!!req} onClose={onClose} size="lg" title={r?.title ?? 'Request'} description={r ? `Raised ${formatDate(r.created_at)}${r.tenant_profiles?.full_name ? ` by ${r.tenant_profiles.full_name}` : ''}` : undefined}>
      {!r ? <SkeletonRows rows={3} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={statusToneM(r.status)}>{humanize(r.status)}</Badge><Badge tone={urgencyTone(r.urgency)}>{humanize(r.urgency)} urgency</Badge><Badge tone="neutral">{humanize(r.category)}</Badge>
            {r.property_units && <span className="text-ink-soft">{r.property_units.properties?.name} · {r.property_units.unit_number}</span>}
          </div>
          {r.description && <p className="whitespace-pre-wrap text-sm text-ink-soft">{r.description}</p>}
          {r.preferred_visit_at && <p className="text-sm text-ink-soft">Preferred visit: {formatDate(r.preferred_visit_at)}</p>}
          {role === 'tenant' && (r.assigned_to || r.repair_cost !== null) && <p className="text-sm text-ink-soft">{r.assigned_to ? `Assigned to ${r.assigned_to}. ` : ''}{r.repair_cost !== null ? `Repair cost: ${formatINR(r.repair_cost)}.` : ''}</p>}

          {(thread.data?.photos.length ?? 0) > 0 && <div className="flex flex-wrap gap-2">{thread.data?.photos.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Attached photo" className="h-24 w-24 rounded-lg border border-line object-cover" /></a>)}</div>}

          {role === 'owner' && (
            <form onSubmit={ownerForm.handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
              <Field label="Status"><Select {...ownerForm.register('status')}>{MAINT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
              <Field label="Assigned to"><Input placeholder="Plumber / staff name" {...ownerForm.register('assigned_to')} /></Field>
              <Field label="Repair cost (₹)" error={ownerForm.formState.errors.repair_cost?.message}><Input inputMode="decimal" {...ownerForm.register('repair_cost')} /></Field>
              <div className="sm:col-span-3 sm:text-right"><Button type="submit" size="sm" loading={save.isPending}>Save changes</Button></div>
            </form>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Conversation</h3>
            {thread.isLoading ? <SkeletonRows rows={2} /> : thread.data?.comments.length === 0 ? <p className="text-sm text-ink-mute">No messages yet.</p> : (
              <ul className="space-y-2">{thread.data?.comments.map((c) => {
                const mine = c.author_id === user?.id
                return <li key={c.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mine ? 'ml-auto bg-brand/10' : 'bg-surface'}`}><p className="mb-0.5 text-xs text-ink-mute">{mine ? 'You' : c.author_id === r.owner_id ? 'Owner' : 'Tenant'} · {formatDate(c.created_at)}</p><p className="whitespace-pre-wrap">{c.body}</p></li>
              })}</ul>
            )}
            <form onSubmit={cForm.handleSubmit((v) => post.mutate(v))} className="mt-3 flex gap-2" noValidate>
              <Input aria-label="Message" placeholder="Write a message…" invalid={!!cForm.formState.errors.body} {...cForm.register('body')} />
              <Button type="submit" loading={post.isPending} aria-label="Send message"><Send className="h-4 w-4" /></Button>
            </form>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function MaintenancePage({ role }: { role: Role }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<MaintenanceReq | null>(null)
  const list = useQuery({ queryKey: ['maint-list', role, status, page], placeholderData: keepPreviousData, queryFn: async () => {
    let q = supabase.from('maintenance_requests').select(role === 'owner' ? '*, tenant_profiles(full_name), property_units(unit_number, properties(name))' : '*', { count: 'exact' })
    if (status) q = q.eq('status', status)
    const { data, error, count } = await q.order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as unknown as MaintenanceReq[], total: count ?? 0 } } })
  return (
    <>
      <PageHeader title="Maintenance" description={role === 'owner' ? 'Requests from your tenants.' : 'Raise and track repair requests.'}
        actions={role === 'tenant' ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New request</Button> : undefined} />
      <div className="mb-4 sm:w-56"><Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">All statuses</option>{MAINT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={Wrench} title="No requests" description={role === 'tenant' ? 'Something broken? Raise a request and your owner will be notified.' : 'Requests from tenants will appear here.'} />
        ) : (<>
          <ul className="divide-y divide-line">{list.data?.rows.map((r) => (
            <li key={r.id}><button className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface" onClick={() => setSel(r)}>
              <div className="min-w-0"><p className="truncate font-medium text-ink">{r.title}</p>
                <p className="text-xs text-ink-mute">{formatDate(r.created_at)} · {humanize(r.category)}{role === 'owner' ? ` · ${r.tenant_profiles?.full_name ?? ''} · ${r.property_units?.unit_number ?? ''}` : ''}</p></div>
              <div className="flex gap-2"><Badge tone={urgencyTone(r.urgency)}>{humanize(r.urgency)}</Badge><Badge tone={statusToneM(r.status)}>{humanize(r.status)}</Badge></div>
            </button></li>))}</ul>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
      {role === 'tenant' && <NewRequestModal open={open} onClose={() => setOpen(false)} />}
      <DetailModal req={sel} role={role} onClose={() => setSel(null)} />
    </>
  )
}
