import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Mail, Plus, Search, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, SortButton, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { useDebounced } from '@/components/GlobalSearch'
import { errMsg } from '@/lib/errors'
import { tenantSchema, type TenantForm } from '@/lib/schemas'
import { emptyToNull, formatDate, humanize, likeTerm } from '@/lib/utils'
import type { Tenant } from '@/lib/types'

const PAGE = 15
const defaults: TenantForm = { full_name: '', email: '', phone: '', date_of_birth: '', permanent_address: '', emergency_contact_name: '', emergency_contact_phone: '', identity_status: 'unverified' }

export function TenantFormModal({ open, onClose, tenant }: { open: boolean; onClose: () => void; tenant?: Tenant | null }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TenantForm>({ resolver: zodResolver(tenantSchema), defaultValues: defaults })

  useEffect(() => {
    if (!open) return
    reset(tenant ? {
      full_name: tenant.full_name, email: tenant.email ?? '', phone: tenant.phone ?? '', date_of_birth: tenant.date_of_birth ?? '',
      permanent_address: tenant.permanent_address ?? '', emergency_contact_name: tenant.emergency_contact_name ?? '',
      emergency_contact_phone: tenant.emergency_contact_phone ?? '', identity_status: tenant.identity_status,
    } : defaults)
  }, [open, tenant, reset])

  const m = useMutation({
    mutationFn: async (v: TenantForm) => {
      const row = {
        full_name: v.full_name, email: emptyToNull(v.email), phone: emptyToNull(v.phone), date_of_birth: emptyToNull(v.date_of_birth),
        permanent_address: emptyToNull(v.permanent_address), emergency_contact_name: emptyToNull(v.emergency_contact_name),
        emergency_contact_phone: emptyToNull(v.emergency_contact_phone), identity_status: v.identity_status,
      }
      if (tenant) {
        const { error } = await supabase.from('tenant_profiles').update(row).eq('id', tenant.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tenant_profiles').insert({ ...row, owner_id: user!.id, status: 'active' })
        if (error) throw error
      }
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success(tenant ? 'Tenant updated.' : 'Tenant added.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title={tenant ? 'Edit tenant' : 'Add tenant'} size="lg">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2" error={errors.full_name?.message}><Input invalid={!!errors.full_name} {...register('full_name')} /></Field>
          <Field label="Email" hint="Needed to invite the tenant to their own login." error={errors.email?.message}><Input type="email" invalid={!!errors.email} {...register('email')} /></Field>
          <Field label="Mobile number" error={errors.phone?.message}><Input type="tel" inputMode="tel" invalid={!!errors.phone} {...register('phone')} /></Field>
          <Field label="Date of birth (optional)" error={errors.date_of_birth?.message}><Input type="date" invalid={!!errors.date_of_birth} {...register('date_of_birth')} /></Field>
          <Field label="Identity verification" error={errors.identity_status?.message}>
            <Select {...register('identity_status')}>{['unverified', 'pending', 'verified', 'rejected'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
          </Field>
          <Field label="Permanent address" className="sm:col-span-2" error={errors.permanent_address?.message}><Input {...register('permanent_address')} /></Field>
          <Field label="Emergency contact name" error={errors.emergency_contact_name?.message}><Input {...register('emergency_contact_name')} /></Field>
          <Field label="Emergency contact phone" error={errors.emergency_contact_phone?.message}><Input type="tel" inputMode="tel" invalid={!!errors.emergency_contact_phone} {...register('emergency_contact_phone')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel={tenant ? 'Save changes' : 'Add tenant'} loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function useInviteTenant() {
  const toast = useToast()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { data, error } = await supabase.functions.invoke('invite-tenant', { body: { tenantId } })
      if (error) {
        // functions.invoke wraps non-2xx responses; surface the server's message when present.
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') { const body = await ctx.json().catch(() => null); if (body?.error) throw new Error(body.error) }
        throw error
      }
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Invitation email sent.') },
    onError: (e) => toast.error(errMsg(e)),
  })
}

type SortKey = 'full_name' | 'created_at'

export default function Tenants() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'created_at', dir: 'desc' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [archiving, setArchiving] = useState<Tenant | null>(null)
  const q = likeTerm(useDebounced(text, 300))
  const toast = useToast()
  const qc = useQueryClient()
  const invite = useInviteTenant()

  const list = useQuery({
    queryKey: ['tenants', { q, status, page, sort }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('tenant_profiles').select('*', { count: 'exact' }).is('deleted_at', null).order(sort.key, { ascending: sort.dir === 'asc' }).range((page - 1) * PAGE, page * PAGE - 1)
      query = status ? query.eq('status', status) : query.neq('status', 'archived')
      if (q) query = query.ilike('full_name', `%${q}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: (data ?? []) as Tenant[], total: count ?? 0 }
    },
  })

  const archive = useMutation({
    mutationFn: async (t: Tenant) => { const { error } = await supabase.rpc('archive_tenant', { p_tenant_id: t.id }); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Tenant archived.'); setArchiving(null) },
    onError: (e) => { toast.error(errMsg(e)); setArchiving(null) },
  })

  const toggle = (key: SortKey) => { setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' })); setPage(1) }

  return (
    <>
      <PageHeader title="Tenants" description="People renting from you." actions={<Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="h-4 w-4" />Add tenant</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input className="pl-9" placeholder="Search by tenant name" aria-label="Search tenants" value={text} onChange={(e) => { setText(e.target.value); setPage(1); setParams(e.target.value ? { q: e.target.value } : {}, { replace: true }) }} />
        </div>
        <Select aria-label="Filter by status" className="sm:w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Current tenants</option><option value="invited">Invited</option><option value="active">Active</option><option value="archived">Archived</option>
        </Select>
      </div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={Users} title={q || status ? 'No tenants match' : 'No tenants yet'} description={q || status ? 'Try a different search or filter.' : 'Add a tenant, then assign them to a unit.'} action={!q && !status ? <Button onClick={() => { setEditing(null); setFormOpen(true) }}>Add tenant</Button> : undefined} />
        ) : (
          <>
            <TableWrap>
              <thead><tr>
                <Th><SortButton label="Name" active={sort.key === 'full_name'} dir={sort.dir} onClick={() => toggle('full_name')} /></Th>
                <Th>Contact</Th><Th>Identity</Th><Th>Account</Th>
                <Th><SortButton label="Added" active={sort.key === 'created_at'} dir={sort.dir} onClick={() => toggle('created_at')} /></Th>
                <Th><span className="sr-only">Actions</span></Th>
              </tr></thead>
              <tbody>
                {list.data?.rows.map((t) => (
                  <tr key={t.id}>
                    <Td><Link to={`/owner/tenants/${t.id}`} className="font-medium text-brand hover:underline">{t.full_name}</Link></Td>
                    <Td><p>{t.phone ?? '—'}</p><p className="text-xs text-ink-mute">{t.email ?? 'No email'}</p></Td>
                    <Td><Badge tone={statusTone(t.identity_status)}>{humanize(t.identity_status)}</Badge></Td>
                    <Td><Badge tone={statusTone(t.status)}>{t.user_id ? 'Has login' : humanize(t.status)}</Badge></Td>
                    <Td>{formatDate(t.created_at)}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {!t.user_id && t.email && t.status !== 'archived' && <Button size="sm" variant="secondary" loading={invite.isPending && invite.variables === t.id} onClick={() => invite.mutate(t.id)}><Mail className="h-4 w-4" />Invite</Button>}
                        {t.status !== 'archived' && <Button size="sm" variant="ghost" aria-label={`Archive ${t.full_name}`} onClick={() => setArchiving(t)}><Archive className="h-4 w-4" /></Button>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>

      <TenantFormModal open={formOpen} onClose={() => setFormOpen(false)} tenant={editing} />
      <ConfirmDialog open={!!archiving} title="Archive tenant?" danger confirmLabel="Archive" loading={archive.isPending}
        message={<>{archiving?.full_name} will move to your archived tenants. Tenants with an active tenancy cannot be archived — end the tenancy first.</>}
        onConfirm={() => archiving && archive.mutate(archiving)} onCancel={() => setArchiving(null)} />
    </>
  )
}
