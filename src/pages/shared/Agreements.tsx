import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, FileSignature, Pencil, Plus, RefreshCw, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, statusTone, TableWrap, Td, Textarea, Th } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { emptyToNull, formatDate, formatINR, humanize, todayISO } from '@/lib/utils'

const PAGE = 12
const date = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg)
const money = z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100000000, 'Amount is too large')

const agreementSchema = z.object({
  assignment_id: z.string().uuid('Choose a tenancy'),
  start_date: date('Choose the start date'),
  expiry_date: date('Choose the end date'),
  monthly_rent: money,
  security_deposit: money,
  notice_period_days: z.coerce.number({ invalid_type_error: 'Enter days' }).int().min(0, 'Cannot be negative').max(365, 'At most 365 days'),
  escalation_terms: z.string().trim().max(2000, 'At most 2000 characters').optional(),
  status: z.enum(['draft', 'active']),
  document_id: z.string().optional(),
}).refine((v) => v.expiry_date >= v.start_date, { path: ['expiry_date'], message: 'The end date must be on or after the start date' })
type AgreementForm = z.infer<typeof agreementSchema>

const renewSchema = z.object({
  new_expiry: date('Choose the new end date'),
  monthly_rent: z.string().optional(),
  notes: z.string().trim().max(2000, 'At most 2000 characters').optional(),
})
type RenewForm = z.infer<typeof renewSchema>

interface Agreement {
  id: string; assignment_id: string; tenant_id: string; start_date: string; expiry_date: string; monthly_rent: number; security_deposit: number
  notice_period_days: number; escalation_terms: string | null; status: string; document_id: string | null
  tenant_profiles?: { full_name: string } | null
  property_units?: { unit_number: string; properties?: { name: string } | null } | null
}
interface Tenancy { id: string; start_date: string; monthly_rent: number; security_deposit: number; tenant_profiles: { full_name: string } | null; property_units: { unit_number: string; properties: { name: string } | null } | null }

const daysLeft = (d: string) => Math.round((new Date(d + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000)

function Expiry({ a }: { a: Agreement }) {
  if (a.status !== 'active') return null
  const n = daysLeft(a.expiry_date)
  if (n < 0) return <Badge tone="danger">Ended {Math.abs(n)} day(s) ago</Badge>
  if (n <= 30) return <Badge tone="warning">{n === 0 ? 'Ends today' : `Ends in ${n} day(s)`}</Badge>
  return null
}

function AgreementModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Agreement | null }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const tenancies = useQuery({ enabled: open && !editing, queryKey: ['agreement-tenancies'], queryFn: async () => {
    const { data, error } = await supabase.from('tenant_assignments').select('id, start_date, monthly_rent, security_deposit, tenant_profiles(full_name), property_units(unit_number, properties(name))').eq('status', 'active').order('start_date', { ascending: false })
    if (error) throw error; return (data ?? []) as unknown as Tenancy[] } })
  const docs = useQuery({ enabled: open, queryKey: ['agreement-docs'], queryFn: async () => {
    const { data, error } = await supabase.from('documents').select('id, title').eq('doc_type', 'agreement').is('deleted_at', null).order('created_at', { ascending: false }); if (error) throw error; return data ?? [] } })
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<AgreementForm>({ resolver: zodResolver(agreementSchema) })
  useEffect(() => {
    if (!open) return
    if (editing) reset({ assignment_id: editing.assignment_id, start_date: editing.start_date, expiry_date: editing.expiry_date, monthly_rent: editing.monthly_rent, security_deposit: editing.security_deposit, notice_period_days: editing.notice_period_days, escalation_terms: editing.escalation_terms ?? '', status: editing.status === 'draft' ? 'draft' : 'active', document_id: editing.document_id ?? '' })
    else reset({ assignment_id: '', start_date: '', expiry_date: '', monthly_rent: 0, security_deposit: 0, notice_period_days: 30, escalation_terms: '', status: 'active', document_id: '' })
  }, [open, editing, reset])
  const m = useMutation({
    mutationFn: async (v: AgreementForm) => {
      const body = { start_date: v.start_date, expiry_date: v.expiry_date, monthly_rent: v.monthly_rent, security_deposit: v.security_deposit, notice_period_days: v.notice_period_days,
        escalation_terms: emptyToNull(v.escalation_terms), status: v.status, document_id: emptyToNull(v.document_id) }
      if (editing) { const { error } = await supabase.from('rental_agreements').update(body).eq('id', editing.id); if (error) throw error; return }
      const t = tenancies.data?.find((x) => x.id === v.assignment_id)
      if (!t) throw new Error('Choose a tenancy')
      const { data: a, error: ae } = await supabase.from('tenant_assignments').select('tenant_id, unit_id').eq('id', v.assignment_id).single(); if (ae) throw ae
      const { error } = await supabase.from('rental_agreements').insert({ ...body, owner_id: user!.id, assignment_id: v.assignment_id, tenant_id: a.tenant_id, unit_id: a.unit_id }); if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success(editing ? 'Agreement updated.' : 'Agreement recorded.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const pick = (id: string) => {
    const t = tenancies.data?.find((x) => x.id === id)
    if (t) { setValue('start_date', t.start_date); setValue('monthly_rent', t.monthly_rent); setValue('security_deposit', t.security_deposit) }
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit agreement' : 'Record agreement'} description="This records the key terms for tracking and reminders. It is not a legal document; attach your signed copy from Documents." size="lg">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {editing ? <Field label="Tenancy" className="sm:col-span-2"><Input value={`${editing.tenant_profiles?.full_name ?? ''} · ${editing.property_units?.properties?.name ?? ''} ${editing.property_units?.unit_number ?? ''}`} disabled readOnly /></Field> : (
            <Field label="Tenancy" className="sm:col-span-2" error={errors.assignment_id?.message} hint={tenancies.data?.length === 0 ? 'No active tenancies. Assign a tenant to a unit first.' : undefined}>
              <Select invalid={!!errors.assignment_id} {...register('assignment_id', { onChange: (e) => pick(e.target.value) })}>
                <option value="">Choose a tenant and unit</option>
                {tenancies.data?.map((t) => <option key={t.id} value={t.id}>{t.tenant_profiles?.full_name} · {t.property_units?.properties?.name} {t.property_units?.unit_number}</option>)}
              </Select>
            </Field>)}
          <Field label="Start date" error={errors.start_date?.message}><Input type="date" invalid={!!errors.start_date} {...register('start_date')} /></Field>
          <Field label="End date" error={errors.expiry_date?.message}><Input type="date" invalid={!!errors.expiry_date} {...register('expiry_date')} /></Field>
          <Field label="Monthly rent (₹)" error={errors.monthly_rent?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.monthly_rent} {...register('monthly_rent')} /></Field>
          <Field label="Security deposit (₹)" error={errors.security_deposit?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.security_deposit} {...register('security_deposit')} /></Field>
          <Field label="Notice period (days)" error={errors.notice_period_days?.message}><Input type="number" inputMode="numeric" invalid={!!errors.notice_period_days} {...register('notice_period_days')} /></Field>
          <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="draft">Draft</option></Select></Field>
          <Field label="Signed copy (optional)" className="sm:col-span-2" hint="Upload the agreement under Documents first (type: Agreement), then link it here."><Select {...register('document_id')}><option value="">None</option>{docs.data?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select></Field>
          <Field label="Rent escalation and other terms (optional)" className="sm:col-span-2" error={errors.escalation_terms?.message}><Textarea rows={3} invalid={!!errors.escalation_terms} {...register('escalation_terms')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel={editing ? 'Save changes' : 'Record agreement'} loading={m.isPending} />
      </form>
    </Modal>
  )
}

function RenewModal({ agreement, onClose }: { agreement: Agreement | null; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<RenewForm>({ resolver: zodResolver(renewSchema) })
  useEffect(() => { if (agreement) reset({ new_expiry: '', monthly_rent: '', notes: agreement.escalation_terms ?? '' }) }, [agreement, reset])
  const m = useMutation({
    mutationFn: async (v: RenewForm) => {
      const rent = v.monthly_rent?.trim() ? Number(v.monthly_rent) : null
      if (rent !== null && (!Number.isFinite(rent) || rent < 0)) throw new Error('Enter a valid monthly rent')
      const { error } = await supabase.rpc('renew_agreement', { p_id: agreement!.id, p_new_expiry: v.new_expiry, p_monthly_rent: rent, p_notes: emptyToNull(v.notes) }); if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Agreement renewed.'); onClose() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={!!agreement} onClose={onClose} title="Renew agreement" description={agreement ? `The new term starts on ${formatDate(new Date(new Date(agreement.expiry_date + 'T00:00:00').getTime() + 86400000).toISOString().slice(0, 10))}, the day after the current one ends.` : undefined}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4">
          <Field label="New end date" error={errors.new_expiry?.message}><Input type="date" invalid={!!errors.new_expiry} {...register('new_expiry')} /></Field>
          <Field label="New monthly rent (₹)" hint={agreement ? `Leave empty to keep ${formatINR(agreement.monthly_rent)}.` : undefined}><Input type="number" step="0.01" inputMode="decimal" {...register('monthly_rent')} /></Field>
          <Field label="Terms (optional)" error={errors.notes?.message}><Textarea rows={3} {...register('notes')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Renew" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export default function AgreementsPage({ role }: { role: 'owner' | 'tenant' }) {
  const toast = useToast(); const qc = useQueryClient()
  const [page, setPage] = useState(1); const [status, setStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<Agreement | null>(null)
  const [renewing, setRenewing] = useState<Agreement | null>(null); const [ending, setEnding] = useState<Agreement | null>(null)
  const list = useQuery({ queryKey: ['agreements', role, status, page], placeholderData: keepPreviousData, queryFn: async () => {
    let q = supabase.from('rental_agreements').select(role === 'owner' ? '*, tenant_profiles(full_name), property_units(unit_number, properties(name))' : '*', { count: 'exact' })
    if (status) q = q.eq('status', status)
    const { data, error, count } = await q.order('expiry_date', { ascending: true }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as unknown as Agreement[], total: count ?? 0 } } })
  const terminate = useMutation({
    mutationFn: async (a: Agreement) => { const { error } = await supabase.from('rental_agreements').update({ status: 'terminated' }).eq('id', a.id); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Agreement marked as terminated.'); setEnding(null) }, onError: (e) => { toast.error(errMsg(e)); setEnding(null) },
  })
  const viewDoc = async (id: string) => {
    const { data: d } = await supabase.from('documents').select('storage_path').eq('id', id).maybeSingle()
    if (!d) return toast.error('Could not find the document.')
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 120)
    if (error || !data) return toast.error('Could not open this document.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  const owner = role === 'owner'
  return (
    <>
      <PageHeader title={owner ? 'Rental agreements' : 'My agreements'} description={owner ? 'Track agreement terms and end dates. You get a reminder 30 and 7 days before an agreement ends.' : 'The agreement terms your owner has recorded for your tenancy.'}
        actions={owner ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />Record agreement</Button> : undefined} />
      <div className="mb-4 sm:w-56"><Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">All statuses</option>{['active', 'draft', 'expired', 'renewed', 'terminated'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={FileSignature} title="No agreements" description={owner ? 'Record an agreement to track its end date and get renewal reminders.' : 'Your owner has not recorded an agreement yet.'} />
        ) : (<>
          <TableWrap>
            <thead><tr>{owner && <Th>Tenant and unit</Th>}<Th>Term</Th><Th>Rent</Th><Th>Deposit</Th><Th>Notice</Th><Th>Status</Th>{owner && <Th><span className="sr-only">Actions</span></Th>}</tr></thead>
            <tbody>{list.data?.rows.map((a) => (
              <tr key={a.id}>
                {owner && <Td><p className="font-medium">{a.tenant_profiles?.full_name}</p><p className="text-xs text-ink-mute">{a.property_units?.properties?.name} · {a.property_units?.unit_number}</p></Td>}
                <Td>{formatDate(a.start_date)} to {formatDate(a.expiry_date)}{a.escalation_terms && <p className="mt-0.5 max-w-xs text-xs text-ink-mute">{a.escalation_terms}</p>}</Td>
                <Td>{formatINR(a.monthly_rent)}</Td><Td>{formatINR(a.security_deposit)}</Td><Td>{a.notice_period_days} days</Td>
                <Td><div className="flex flex-wrap gap-1"><Badge tone={statusTone(a.status)}>{humanize(a.status)}</Badge><Expiry a={a} /></div></Td>
                {owner && <Td><div className="flex justify-end gap-1">
                  {a.document_id && <Button size="sm" variant="ghost" aria-label="View signed copy" onClick={() => void viewDoc(a.document_id!)}><Eye className="h-4 w-4" /></Button>}
                  {(a.status === 'active' || a.status === 'draft') && <Button size="sm" variant="ghost" aria-label="Edit agreement" onClick={() => { setEditing(a); setFormOpen(true) }}><Pencil className="h-4 w-4" /></Button>}
                  {a.status === 'active' && <Button size="sm" variant="ghost" aria-label="Renew agreement" onClick={() => setRenewing(a)}><RefreshCw className="h-4 w-4" /></Button>}
                  {a.status === 'active' && <Button size="sm" variant="ghost" aria-label="Terminate agreement" onClick={() => setEnding(a)}><XCircle className="h-4 w-4" /></Button>}
                </div></Td>}
              </tr>))}</tbody>
          </TableWrap>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
      {owner && <AgreementModal open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />}
      {owner && <RenewModal agreement={renewing} onClose={() => setRenewing(null)} />}
      <ConfirmDialog open={!!ending} danger confirmLabel="Terminate" title="Terminate agreement?" loading={terminate.isPending}
        message={<>The agreement for {ending?.tenant_profiles?.full_name} will be marked as terminated. This does not end the tenancy; use End tenancy on the tenant page for that.</>}
        onConfirm={() => ending && terminate.mutate(ending)} onCancel={() => setEnding(null)} />
    </>
  )
}
