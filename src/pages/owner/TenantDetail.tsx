import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRightLeft, DoorOpen, LogOut, Mail, Pencil, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize, initials } from '@/lib/utils'
import type { AssignmentWithUnit, Tenant } from '@/lib/types'
import { TenantFormModal, useInviteTenant } from './Tenants'
import { AssignModal, EndTenancyModal, TransferModal } from './tenancyModals'

function Row({ label, value }: { label: string; value?: string | null }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-ink-mute">{label}</dt><dd className="text-right font-medium text-ink">{value || '—'}</dd></div>
}

export default function TenantDetail() {
  const { id = '' } = useParams()
  const [edit, setEdit] = useState(false)
  const [assign, setAssign] = useState(false)
  const [transfer, setTransfer] = useState<AssignmentWithUnit | null>(null)
  const [endT, setEndT] = useState<AssignmentWithUnit | null>(null)
  const invite = useInviteTenant()

  const tenant = useQuery({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_profiles').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
      if (error) throw error
      return data as Tenant | null
    },
  })
  const history = useQuery({
    queryKey: ['tenant-assignments', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_assignments').select('*, unit:property_units(unit_number, property:properties(id, name))').eq('tenant_id', id).order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AssignmentWithUnit[]
    },
  })
  const deposit = useQuery({
    queryKey: ['tenant-deposits', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('security_deposits').select('expected_amount,status').eq('tenant_id', id)
      if (error) throw error
      return data ?? []
    },
  })

  if (tenant.isLoading) return <><Skeleton className="mb-4 h-8 w-64" /><Skeleton className="h-64" /></>
  if (tenant.isError) return <Card><ErrorState message={errMsg(tenant.error)} onRetry={() => void tenant.refetch()} /></Card>
  const t = tenant.data
  if (!t) return <Card><EmptyState icon={ArrowLeft} title="Tenant not found" action={<Link to="/owner/tenants"><Button>Back to tenants</Button></Link>} /></Card>

  const active = history.data?.find((a) => a.status === 'active') ?? null
  const archived = t.status === 'archived'

  return (
    <>
      <Link to="/owner/tenants" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />All tenants</Link>
      <PageHeader
        title={t.full_name}
        description={t.user_id ? 'Has a RENTMASTER login' : t.status === 'invited' ? 'Invitation sent' : 'No login yet'}
        actions={<>
          {!t.user_id && t.email && !archived && <Button variant="secondary" loading={invite.isPending} onClick={() => invite.mutate(t.id)}><Mail className="h-4 w-4" />Invite to login</Button>}
          <Button variant="secondary" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" />Edit</Button>
        </>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-base font-semibold text-white">{initials(t.full_name)}</span>
            <div className="min-w-0"><p className="truncate font-semibold">{t.full_name}</p><div className="mt-1 flex gap-1.5"><Badge tone={statusTone(t.status)}>{humanize(t.status)}</Badge><Badge tone={statusTone(t.identity_status)}>{humanize(t.identity_status)}</Badge></div></div>
          </div>
          <dl className="mt-4 divide-y divide-line">
            <Row label="Mobile" value={t.phone} /><Row label="Email" value={t.email} /><Row label="Date of birth" value={t.date_of_birth ? formatDate(t.date_of_birth) : null} />
            <Row label="Permanent address" value={t.permanent_address} />
            <Row label="Emergency contact" value={[t.emergency_contact_name, t.emergency_contact_phone].filter(Boolean).join(' · ')} />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Current tenancy" action={!active && !archived && <Button size="sm" onClick={() => setAssign(true)}><UserPlus className="h-4 w-4" />Assign to unit</Button>} />
          {history.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : !active ? (
            <EmptyState icon={DoorOpen} title="Not assigned to a unit" description={archived ? 'This tenant is archived.' : 'Assign this tenant to an available unit to start a tenancy.'} />
          ) : (
            <div className="p-5">
              <p className="text-sm text-ink-mute">{active.unit?.property?.name}</p>
              <p className="text-lg font-semibold">Unit {active.unit?.unit_number}</p>
              <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
                <Row label="Move-in date" value={formatDate(active.start_date)} /><Row label="Monthly rent" value={formatINR(active.monthly_rent)} />
                <Row label="Security deposit" value={formatINR(active.security_deposit)} /><Row label="Rent due day" value={`${active.rent_due_day} of each month`} />
                <Row label="Billing cycle" value={humanize(active.billing_cycle)} />
                <Row label="Deposit record" value={deposit.data?.length ? humanize(deposit.data[0].status) : '—'} />
              </dl>
              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
                <Button variant="secondary" onClick={() => setTransfer(active)}><ArrowRightLeft className="h-4 w-4" />Transfer to another unit</Button>
                <Button variant="danger" onClick={() => setEndT(active)}><LogOut className="h-4 w-4" />End tenancy</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Rental history" />
        {history.isError ? <ErrorState message={errMsg(history.error)} /> : !history.data?.length ? <p className="px-5 py-8 text-center text-sm text-ink-mute">No tenancies yet.</p> : (
          <TableWrap>
            <thead><tr><Th>Property</Th><Th>Unit</Th><Th>From</Th><Th>To</Th><Th>Rent</Th><Th>Status</Th></tr></thead>
            <tbody>
              {history.data.map((a) => (
                <tr key={a.id}>
                  <Td>{a.unit?.property ? <Link to={`/owner/properties/${a.unit.property.id}`} className="text-brand hover:underline">{a.unit.property.name}</Link> : '—'}</Td>
                  <Td>{a.unit?.unit_number}</Td><Td>{formatDate(a.start_date)}</Td><Td>{a.end_date ? formatDate(a.end_date) : '—'}</Td>
                  <Td>{formatINR(a.monthly_rent)}</Td>
                  <Td><Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{humanize(a.status)}</Badge>{a.end_reason && <p className="mt-1 text-xs text-ink-mute">{a.end_reason}</p>}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Payments and documents" />
        <p className="px-5 py-6 text-sm text-ink-mute">Payment history, pending rent and tenant documents appear here once the financial modules (Phase 3) and document storage (Phase 4) are built.</p>
      </Card>

      <TenantFormModal open={edit} onClose={() => setEdit(false)} tenant={t} />
      <AssignModal open={assign} onClose={() => setAssign(false)} tenant={t} />
      <TransferModal open={!!transfer} onClose={() => setTransfer(null)} assignment={transfer} />
      <EndTenancyModal open={!!endT} onClose={() => setEndT(null)} assignment={endT} />
    </>
  )
}
