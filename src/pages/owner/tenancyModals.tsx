import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FormActions, Modal } from '@/components/Modal'
import { Field, Input, Select } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { assignSchema, BILLING_CYCLES, type AssignForm } from '@/lib/schemas'
import { formatINR, humanize, todayISO } from '@/lib/utils'
import type { AssignmentWithUnit, Tenant, Unit } from '@/lib/types'

type UnitOption = Pick<Unit, 'id' | 'unit_number' | 'monthly_rent' | 'security_deposit' | 'status'> & { property: { name: string } | null }

function useAvailableUnits(enabled: boolean) {
  return useQuery({
    queryKey: ['available-units'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('property_units').select('id,unit_number,monthly_rent,security_deposit,status,property:properties(name)').is('deleted_at', null).in('status', ['available', 'reserved']).order('unit_number')
      if (error) throw error
      return (data ?? []) as unknown as UnitOption[]
    },
  })
}

function useOwnerDueDay(enabled: boolean) {
  return useQuery({
    queryKey: ['owner-due-day'],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from('owner_profiles').select('rent_due_day').maybeSingle()
      return (data?.rent_due_day as number | undefined) ?? 5
    },
  })
}

/** Assign a tenant to a unit. Pass `unit` (from a unit row) or `tenant` (from a tenant page). */
export function AssignModal({ open, onClose, unit, tenant }: { open: boolean; onClose: () => void; unit?: Unit | null; tenant?: Tenant | null }) {
  const toast = useToast()
  const qc = useQueryClient()
  const tenants = useQuery({
    queryKey: ['assignable-tenants'],
    enabled: open && !tenant,
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_profiles').select('id,full_name,email').is('deleted_at', null).neq('status', 'archived').order('full_name').limit(500)
      if (error) throw error
      return (data ?? []) as Pick<Tenant, 'id' | 'full_name' | 'email'>[]
    },
  })
  const units = useAvailableUnits(open && !unit)
  const dueDay = useOwnerDueDay(open)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<AssignForm>({ resolver: zodResolver(assignSchema) })
  const unitId = watch('unit_id')

  useEffect(() => {
    if (!open) return
    reset({
      tenant_id: tenant?.id ?? '', unit_id: unit?.id ?? '', start_date: todayISO(),
      monthly_rent: unit ? Number(unit.monthly_rent) : 0, security_deposit: unit ? Number(unit.security_deposit) : 0,
      rent_due_day: dueDay.data ?? 5, billing_cycle: 'monthly',
    })
  }, [open, unit, tenant, dueDay.data, reset])

  useEffect(() => {
    if (unit || !unitId) return
    const u = units.data?.find((x) => x.id === unitId)
    if (u) { setValue('monthly_rent', Number(u.monthly_rent)); setValue('security_deposit', Number(u.security_deposit)) }
  }, [unitId, units.data, unit, setValue])

  const m = useMutation({
    mutationFn: async (v: AssignForm) => {
      const { error } = await supabase.rpc('assign_tenant', {
        p_tenant_id: v.tenant_id, p_unit_id: v.unit_id, p_start_date: v.start_date, p_monthly_rent: v.monthly_rent,
        p_security_deposit: v.security_deposit, p_rent_due_day: v.rent_due_day, p_billing_cycle: v.billing_cycle,
      })
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Tenant assigned.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title="Assign tenant to unit" description="Creates the tenancy and its deposit record, and marks the unit as occupied." size="lg">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tenant" error={errors.tenant_id?.message}>
            {tenant ? <><Input value={tenant.full_name} disabled readOnly /><input type="hidden" {...register('tenant_id')} /></> : (
              <Select invalid={!!errors.tenant_id} {...register('tenant_id')}>
                <option value="">Choose a tenant…</option>
                {tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}{t.email ? ` (${t.email})` : ''}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Unit" error={errors.unit_id?.message}>
            {unit ? <><Input value={`Unit ${unit.unit_number}`} disabled readOnly /><input type="hidden" {...register('unit_id')} /></> : (
              <Select invalid={!!errors.unit_id} {...register('unit_id')}>
                <option value="">Choose a unit…</option>
                {units.data?.map((u) => <option key={u.id} value={u.id}>{u.property?.name} · Unit {u.unit_number} ({formatINR(u.monthly_rent)})</option>)}
              </Select>
            )}
          </Field>
          <Field label="Move-in date" error={errors.start_date?.message}><Input type="date" invalid={!!errors.start_date} {...register('start_date')} /></Field>
          <Field label="Billing cycle" error={errors.billing_cycle?.message}>
            <Select {...register('billing_cycle')}>{BILLING_CYCLES.map((b) => <option key={b} value={b}>{humanize(b)}</option>)}</Select>
          </Field>
          <Field label="Monthly rent (₹)" error={errors.monthly_rent?.message}><Input type="number" min={0} step="0.01" inputMode="decimal" invalid={!!errors.monthly_rent} {...register('monthly_rent')} /></Field>
          <Field label="Security deposit (₹)" error={errors.security_deposit?.message}><Input type="number" min={0} step="0.01" inputMode="decimal" invalid={!!errors.security_deposit} {...register('security_deposit')} /></Field>
          <Field label="Rent due day of month (1–28)" error={errors.rent_due_day?.message}><Input type="number" min={1} max={28} inputMode="numeric" invalid={!!errors.rent_due_day} {...register('rent_due_day')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Assign tenant" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function TransferModal({ open, onClose, assignment }: { open: boolean; onClose: () => void; assignment: AssignmentWithUnit | null }) {
  const toast = useToast()
  const qc = useQueryClient()
  const units = useAvailableUnits(open)
  const [unitId, setUnitId] = useState('')
  const [date, setDate] = useState(todayISO())
  const [rent, setRent] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (open) { setUnitId(''); setDate(todayISO()); setRent(''); setErr(null) } }, [open])

  const m = useMutation({
    mutationFn: async () => {
      if (!assignment) return
      const { error } = await supabase.rpc('transfer_tenant', { p_assignment_id: assignment.id, p_new_unit_id: unitId, p_effective_date: date, p_monthly_rent: rent.trim() === '' ? null : Number(rent) })
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Tenant transferred.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!unitId) return setErr('Choose the destination unit.')
    if (rent.trim() !== '' && !(Number(rent) >= 0)) return setErr('Enter a valid rent or leave it blank to use the unit’s rent.')
    setErr(null)
    m.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title="Transfer tenant" description="Ends the current tenancy and starts a new one in the destination unit. The security deposit stays on the original record.">
      <form onSubmit={submit} noValidate>
        <div className="space-y-4">
          <Field label="Destination unit">
            <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Choose a unit…</option>
              {units.data?.filter((u) => u.id !== assignment?.unit_id).map((u) => <option key={u.id} value={u.id}>{u.property?.name} · Unit {u.unit_number} ({formatINR(u.monthly_rent)})</option>)}
            </Select>
          </Field>
          <Field label="Effective date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="New monthly rent (₹, optional)" hint="Leave blank to use the destination unit’s rent."><Input type="number" min={0} step="0.01" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        </div>
        <FormActions onCancel={onClose} submitLabel="Transfer" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function EndTenancyModal({ open, onClose, assignment }: { open: boolean; onClose: () => void; assignment: AssignmentWithUnit | null }) {
  const toast = useToast()
  const qc = useQueryClient()
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) { setDate(todayISO()); setReason('') } }, [open])

  const m = useMutation({
    mutationFn: async () => {
      if (!assignment) return
      const { error } = await supabase.rpc('end_tenancy', { p_assignment_id: assignment.id, p_end_date: date, p_reason: reason.trim() || null })
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Tenancy ended. The unit is now available.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title="End tenancy" description="Records the move-out date and makes the unit available again.">
      <form onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
        <div className="space-y-4">
          <Field label="Move-out date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Reason (optional)"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="End tenancy" loading={m.isPending} />
      </form>
    </Modal>
  )
}
