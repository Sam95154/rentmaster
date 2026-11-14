import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, statusTone, TableWrap, Td, Textarea, Th } from '@/components/ui'
import { FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { ownerPlanSchema, planSchema, type OwnerPlanForm, type PlanForm } from '@/lib/schemas'
import { formatDate, formatINR, humanize } from '@/lib/utils'
import type { AdminSub, PlanRow } from '@/lib/types'

const lim = (n: number | null) => (n === null ? 'Unlimited' : String(n))
const toNum = (s: string) => (s.trim() === '' ? null : Number(s))

function PlanModal({ plan, open, onClose }: { plan: PlanRow | null; open: boolean; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<PlanForm>({ resolver: zodResolver(planSchema) as never, values: {
    name: plan?.name ?? '', price_monthly: plan?.price_monthly ?? 0, max_properties: plan?.max_properties?.toString() ?? '', max_units: plan?.max_units?.toString() ?? '',
    features: (plan?.features ?? []).join('\n'), active: plan?.active ?? true } })
  const m = useMutation({
    mutationFn: async (v: PlanForm) => { const { error } = await supabase.rpc('admin_upsert_plan', { p_id: plan?.id ?? null, p_name: v.name, p_price: v.price_monthly, p_max_properties: toNum(v.max_properties), p_max_units: toNum(v.max_units),
      p_features: v.features.split('\n').map((x) => x.trim()).filter(Boolean), p_active: v.active }); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Plan saved.'); onClose() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={open} onClose={onClose} title={plan ? 'Edit plan' : 'New plan'} description="Leave a limit empty for unlimited.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name?.message}><Input invalid={!!errors.name} {...register('name')} /></Field>
          <Field label="Price per month (₹)" error={errors.price_monthly?.message}><Input type="number" min="0" step="1" inputMode="decimal" invalid={!!errors.price_monthly} {...register('price_monthly')} /></Field>
          <Field label="Max properties" error={errors.max_properties?.message}><Input inputMode="numeric" invalid={!!errors.max_properties} {...register('max_properties')} /></Field>
          <Field label="Max units" error={errors.max_units?.message}><Input inputMode="numeric" invalid={!!errors.max_units} {...register('max_units')} /></Field>
          <Field label="Features (one per line)" className="sm:col-span-2" error={errors.features?.message}><Textarea rows={4} {...register('features')} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4" {...register('active')} />Plan is available to assign</label>
        </div>
        <FormActions onCancel={onClose} submitLabel="Save plan" loading={m.isPending} />
      </form>
    </Modal>
  )
}

function AssignModal({ sub, plans, onClose }: { sub: AdminSub | null; plans: PlanRow[]; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<OwnerPlanForm>({ resolver: zodResolver(ownerPlanSchema), values: {
    plan_id: sub?.plan_id ?? '', status: (['trialing', 'active', 'past_due', 'cancelled'].includes(sub?.status ?? '') ? sub!.status : 'active') as OwnerPlanForm['status'], period_end: sub?.period_end?.slice(0, 10) ?? '' } })
  const m = useMutation({
    mutationFn: async (v: OwnerPlanForm) => { const { error } = await supabase.rpc('admin_set_owner_plan', { p_owner: sub!.owner_id, p_plan: v.plan_id, p_status: v.status, p_period_end: v.period_end || null }); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Subscription updated.'); onClose() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={!!sub} onClose={onClose} title="Change plan" description={sub ? `${sub.owner_name || sub.owner_email} · currently using ${sub.properties} ${sub.properties === 1 ? 'property' : 'properties'} and ${sub.units} ${sub.units === 1 ? 'unit' : 'units'}` : undefined}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4">
          <Field label="Plan" error={errors.plan_id?.message}><Select invalid={!!errors.plan_id} {...register('plan_id')}><option value="">Choose…</option>{plans.filter((p) => p.active || p.id === sub?.plan_id).map((p) => <option key={p.id} value={p.id}>{p.name} ({lim(p.max_properties)} properties / {lim(p.max_units)} units)</option>)}</Select></Field>
          <Field label="Status"><Select {...register('status')}>{['trialing', 'active', 'past_due', 'cancelled'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
          <Field label="Period ends" hint="Optional. After this date the owner falls back to the Starter limits."><Input type="date" {...register('period_end')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Update" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export default function Subscriptions() {
  const [plan, setPlan] = useState<PlanRow | null>(null); const [planOpen, setPlanOpen] = useState(false); const [sub, setSub] = useState<AdminSub | null>(null)
  const plans = useQuery({ queryKey: ['admin-plans'], queryFn: async () => { const { data, error } = await supabase.from('subscription_plans').select('*').order('price_monthly'); if (error) throw error; return (data ?? []) as PlanRow[] } })
  const subs = useQuery({ queryKey: ['admin-subs'], queryFn: async () => { const { data, error } = await supabase.rpc('admin_list_subscriptions'); if (error) throw error; return (data ?? []) as AdminSub[] } })
  return (
    <>
      <PageHeader title="Subscriptions" description="Plans and the limits they enforce on owners." actions={<Button onClick={() => { setPlan(null); setPlanOpen(true) }}><Plus className="h-4 w-4" />New plan</Button>} />
      <Card>
        <CardHeader title="Plans" />
        {plans.isLoading ? <SkeletonRows rows={3} /> : plans.isError ? <ErrorState message={errMsg(plans.error)} onRetry={() => void plans.refetch()} /> : (
          <TableWrap>
            <thead><tr><Th>Name</Th><Th>Price / month</Th><Th>Properties</Th><Th>Units</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>{plans.data?.map((p) => (
              <tr key={p.id}><Td className="font-medium">{p.name}</Td><Td>{formatINR(p.price_monthly)}</Td><Td>{lim(p.max_properties)}</Td><Td>{lim(p.max_units)}</Td><Td><Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Active' : 'Hidden'}</Badge></Td>
                <Td className="text-right"><Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => { setPlan(p); setPlanOpen(true) }}><Pencil className="h-4 w-4" /></Button></Td></tr>))}</tbody>
          </TableWrap>)}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Owner subscriptions" subtitle="Owners without a paid plan use Starter limits." />
        {subs.isLoading ? <SkeletonRows /> : subs.isError ? <ErrorState message={errMsg(subs.error)} onRetry={() => void subs.refetch()} /> : (
          <TableWrap>
            <thead><tr><Th>Owner</Th><Th>Plan</Th><Th>Status</Th><Th>Properties</Th><Th>Units</Th><Th>Period ends</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>{subs.data?.map((s) => (
              <tr key={s.owner_id}><Td><span className="font-medium">{s.owner_name || '—'}</span><br /><span className="text-xs text-ink-mute">{s.owner_email}</span></Td><Td>{s.plan_name}</Td><Td><Badge tone={statusTone(s.status)}>{humanize(s.status)}</Badge></Td>
                <Td>{s.properties} / {lim(s.max_properties)}</Td><Td>{s.units} / {lim(s.max_units)}</Td><Td>{formatDate(s.period_end)}</Td>
                <Td className="text-right"><Button size="sm" variant="secondary" onClick={() => setSub(s)}>Change plan</Button></Td></tr>))}</tbody>
          </TableWrap>)}
      </Card>
      <PlanModal plan={plan} open={planOpen} onClose={() => setPlanOpen(false)} />
      <AssignModal sub={sub} plans={plans.data ?? []} onClose={() => setSub(null)} />
    </>
  )
}
