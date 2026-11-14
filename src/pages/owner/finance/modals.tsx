import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Ban, MinusCircle, Plus, Printer, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Field, Input, Select, SkeletonRows, statusTone, Textarea } from '@/components/ui'
import { FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { adjustmentSchema, depositTxnSchema, manualInvoiceSchema, paymentSchema, PAYMENT_METHODS, reasonSchema, type AdjustmentForm, type DepositTxnForm, type ManualInvoiceForm, type PaymentForm } from '@/lib/schemas'
import { formatDate, formatINR, humanize, todayISO } from '@/lib/utils'
import type { DepositRow, Invoice, InvoiceItem, Payment } from '@/lib/types'

const balanceOf = (i: Invoice) => Math.max(0, Number(i.total_amount) - Number(i.paid_amount))
const atNoon = (d: string) => new Date(`${d}T12:00:00`).toISOString()
export const invoiceOpen = (i: Invoice) => ['pending', 'partially_paid', 'overdue'].includes(i.status)

function useDone(onClose: () => void, msg: string) {
  const toast = useToast(); const qc = useQueryClient()
  return { toast, ok: () => { void qc.invalidateQueries(); toast.success(msg); onClose() }, fail: (e: unknown) => toast.error(errMsg(e)) }
}

export function RecordPaymentModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { ok, fail } = useDone(onClose, 'Payment recorded.')
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema) })
  useEffect(() => { if (invoice) reset({ amount: balanceOf(invoice), method: 'cash', paid_on: todayISO(), notes: '' }) }, [invoice, reset])
  const m = useMutation({
    mutationFn: async (v: PaymentForm) => {
      if (!invoice) return
      if (v.paid_on > todayISO()) throw new Error('Payment date cannot be in the future.')
      if (v.amount > balanceOf(invoice) + 0.001) throw new Error(`Amount is more than the balance (${formatINR(balanceOf(invoice))}). Record the extra as an advance instead.`)
      const { error } = await supabase.rpc('record_payment', { p_invoice_id: invoice.id, p_amount: v.amount, p_method: v.method, p_paid_at: atNoon(v.paid_on), p_notes: v.notes || null })
      if (error) throw error
    }, onSuccess: ok, onError: fail,
  })
  return (
    <Modal open={!!invoice} onClose={onClose} title="Record payment" description={invoice ? `${invoice.invoice_number} · balance ${formatINR(balanceOf(invoice))}` : undefined}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount received (₹)" hint="Less than the balance records a partial payment." error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field label="Method" error={errors.method?.message}><Select {...register('method')}>{PAYMENT_METHODS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
          <Field label="Date received" error={errors.paid_on?.message}><Input type="date" max={todayISO()} invalid={!!errors.paid_on} {...register('paid_on')} /></Field>
          <Field label="Note (optional)" error={errors.notes?.message}><Input {...register('notes')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Record payment" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function AdvanceModal({ open, onClose, tenantId }: { open: boolean; onClose: () => void; tenantId?: string }) {
  const { ok, fail } = useDone(onClose, 'Advance recorded and applied to open invoices.')
  const [tenant, setTenant] = useState(tenantId ?? '')
  const tenants = useQuery({ enabled: open && !tenantId, queryKey: ['tenant-options'], queryFn: async () => {
    const { data, error } = await supabase.from('tenant_profiles').select('id, full_name').is('deleted_at', null).neq('status', 'archived').order('full_name')
    if (error) throw error; return data ?? []
  } })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema) })
  useEffect(() => { if (open) { reset({ amount: undefined as unknown as number, method: 'cash', paid_on: todayISO(), notes: '' }); setTenant(tenantId ?? '') } }, [open, tenantId, reset])
  const m = useMutation({
    mutationFn: async (v: PaymentForm) => {
      if (!tenant) throw new Error('Choose a tenant.')
      if (v.paid_on > todayISO()) throw new Error('Payment date cannot be in the future.')
      const { error } = await supabase.rpc('record_advance', { p_tenant_id: tenant, p_amount: v.amount, p_method: v.method, p_paid_at: atNoon(v.paid_on), p_notes: v.notes || null })
      if (error) throw error
    }, onSuccess: ok, onError: fail,
  })
  return (
    <Modal open={open} onClose={onClose} title="Record advance payment" description="Money received before an invoice exists. It is applied automatically to this tenant's open and future invoices.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {!tenantId && <Field label="Tenant" className="sm:col-span-2"><Select value={tenant} onChange={(e) => setTenant(e.target.value)}><option value="">Select tenant…</option>{tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>}
          <Field label="Amount (₹)" error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field label="Method"><Select {...register('method')}>{PAYMENT_METHODS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
          <Field label="Date received" error={errors.paid_on?.message}><Input type="date" max={todayISO()} {...register('paid_on')} /></Field>
          <Field label="Note (optional)"><Input {...register('notes')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Record advance" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function AdjustModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { ok, fail } = useDone(onClose, 'Invoice updated.')
  const { register, handleSubmit, reset, formState: { errors } } = useForm<AdjustmentForm>({ resolver: zodResolver(adjustmentSchema) })
  useEffect(() => { if (invoice) reset({ kind: 'discount', amount: undefined as unknown as number, description: '' }) }, [invoice, reset])
  const m = useMutation({
    mutationFn: async (v: AdjustmentForm) => {
      const { error } = await supabase.rpc('add_invoice_adjustment', { p_invoice_id: invoice!.id, p_kind: v.kind, p_amount: v.amount, p_description: v.description })
      if (error) throw error
    }, onSuccess: ok, onError: fail,
  })
  return (
    <Modal open={!!invoice} onClose={onClose} title="Adjust invoice" description={invoice ? `${invoice.invoice_number} · total ${formatINR(invoice.total_amount)}` : undefined}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><Select {...register('kind')}><option value="discount">Discount</option><option value="late_fee">Late fee</option><option value="charge">Other charge</option></Select></Field>
          <Field label="Amount (₹)" error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field label="Description" className="sm:col-span-2" error={errors.description?.message}><Input invalid={!!errors.description} {...register('description')} /></Field>
        </div>
        <p className="mt-3 text-xs text-ink-mute">A discount cannot take the total below what has already been paid.</p>
        <FormActions onCancel={onClose} submitLabel="Apply" loading={m.isPending} />
      </form>
    </Modal>
  )
}

// Waive an invoice, or refund a payment (optionally cancelling the invoice). Both need a reason and are audited.
export function ReasonModal({ mode, target, onClose }: { mode: 'waive' | 'refund'; target: { id: string; label: string } | null; onClose: () => void }) {
  const { ok, fail } = useDone(onClose, mode === 'waive' ? 'Invoice waived.' : 'Payment refunded.')
  const [cancel, setCancel] = useState(false)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ reason: string }>({ resolver: zodResolver(reasonSchema) })
  useEffect(() => { if (target) { reset({ reason: '' }); setCancel(false) } }, [target, reset])
  const m = useMutation({
    mutationFn: async (v: { reason: string }) => {
      const { error } = mode === 'waive'
        ? await supabase.rpc('waive_invoice', { p_invoice_id: target!.id, p_reason: v.reason })
        : await supabase.rpc('refund_payment', { p_payment_id: target!.id, p_reason: v.reason, p_cancel_invoice: cancel })
      if (error) throw error
    }, onSuccess: ok, onError: fail,
  })
  return (
    <Modal open={!!target} onClose={onClose} title={mode === 'waive' ? 'Waive invoice' : 'Refund payment'}
      description={mode === 'waive' ? `${target?.label}: the balance is written off. This is recorded in the audit log.` : `${target?.label}: the payment is reversed and the invoice balance reopens. Money is not moved automatically; return it to the tenant yourself.`}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <Field label="Reason" error={errors.reason?.message}><Textarea rows={3} invalid={!!errors.reason} {...register('reason')} /></Field>
        {mode === 'refund' && <label className="mt-3 flex items-start gap-2 text-sm text-ink-soft"><input type="checkbox" className="mt-0.5" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />Also cancel the invoice (if nothing else was paid on it)</label>}
        <FormActions onCancel={onClose} submitLabel={mode === 'waive' ? 'Waive invoice' : 'Refund payment'} loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function ManualInvoiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ok, fail } = useDone(onClose, 'Invoice created.')
  const tenancies = useQuery({ enabled: open, queryKey: ['active-tenancies'], queryFn: async () => {
    const { data, error } = await supabase.from('tenant_assignments').select('id, monthly_rent, rent_due_day, tenant_profiles(full_name), property_units(unit_number, properties(name))').eq('status', 'active')
    if (error) throw error
    return (data ?? []) as unknown as { id: string; monthly_rent: number; tenant_profiles: { full_name: string } | null; property_units: { unit_number: string; properties: { name: string } | null } | null }[]
  } })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ManualInvoiceForm>({ resolver: zodResolver(manualInvoiceSchema) })
  useEffect(() => { if (open) reset({ assignment_id: '', period_start: '', period_end: '', due_date: '', amount: undefined as unknown as number, description: '' }) }, [open, reset])
  const m = useMutation({
    mutationFn: async (v: ManualInvoiceForm) => {
      const { error } = await supabase.rpc('create_invoice', { p_assignment_id: v.assignment_id, p_period_start: v.period_start, p_period_end: v.period_end, p_due_date: v.due_date, p_amount: v.amount, p_description: v.description || null })
      if (error) throw error
    }, onSuccess: ok, onError: fail,
  })
  return (
    <Modal open={open} onClose={onClose} title="Create custom invoice" description="For a custom billing period. Monthly and quarterly invoices are generated automatically. An invoice for the same tenancy and period start cannot be created twice.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tenancy" className="sm:col-span-2" error={errors.assignment_id?.message}>
            <Select invalid={!!errors.assignment_id} {...register('assignment_id')}><option value="">Select…</option>
              {tenancies.data?.map((t) => <option key={t.id} value={t.id}>{t.tenant_profiles?.full_name} · {t.property_units?.properties?.name} {t.property_units?.unit_number}</option>)}
            </Select>
          </Field>
          <Field label="Period start" error={errors.period_start?.message}><Input type="date" {...register('period_start')} /></Field>
          <Field label="Period end" error={errors.period_end?.message}><Input type="date" {...register('period_end')} /></Field>
          <Field label="Due date" error={errors.due_date?.message}><Input type="date" {...register('due_date')} /></Field>
          <Field label="Amount (₹)" error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" {...register('amount')} /></Field>
          <Field label="Description (optional)" className="sm:col-span-2"><Input {...register('description')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Create invoice" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export function DepositTxnModal({ deposit, onClose }: { deposit: DepositRow | null; onClose: () => void }) {
  const { ok, fail } = useDone(onClose, 'Deposit entry recorded.')
  const { register, handleSubmit, reset, formState: { errors } } = useForm<DepositTxnForm>({ resolver: zodResolver(depositTxnSchema) })
  useEffect(() => { if (deposit) reset({ type: 'received', amount: Math.max(0, deposit.expected - deposit.received) || (undefined as unknown as number), date: todayISO(), note: '' }) }, [deposit, reset])
  const m = useMutation({
    mutationFn: async (v: DepositTxnForm) => {
      const { error } = await supabase.rpc('record_deposit_txn', { p_deposit_id: deposit!.deposit_id, p_type: v.type, p_amount: v.amount, p_date: v.date, p_note: v.note || null })
      if (error) throw error
    }, onSuccess: ok, onError: fail,
  })
  return (
    <Modal open={!!deposit} onClose={onClose} title="Deposit entry" description={deposit ? `${deposit.tenant_name} · ${deposit.property_name} ${deposit.unit_number} · held ${formatINR(deposit.held)}` : undefined}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><Select {...register('type')}><option value="received">Received from tenant</option><option value="deduction">Deduction</option><option value="damage">Damage charge</option><option value="refund">Refund to tenant</option></Select></Field>
          <Field label="Amount (₹)" error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field label="Date" error={errors.date?.message}><Input type="date" max={todayISO()} {...register('date')} /></Field>
          <Field label="Note (optional)"><Input {...register('note')} /></Field>
        </div>
        <p className="mt-3 text-xs text-ink-mute">Deposits are tracked separately from rental income. Deductions and refunds cannot exceed the amount held.</p>
        <FormActions onCancel={onClose} submitLabel="Save entry" loading={m.isPending} />
      </form>
    </Modal>
  )
}

// Invoice detail with line items, payments and the actions allowed for its status.
export function InvoiceDetailModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const [pay, setPay] = useState<Invoice | null>(null)
  const [adj, setAdj] = useState<Invoice | null>(null)
  const [reason, setReason] = useState<{ mode: 'waive' | 'refund'; id: string; label: string } | null>(null)
  const id = invoice?.id
  const detail = useQuery({ enabled: !!id, queryKey: ['invoice-detail', id], queryFn: async () => {
    const [inv, items, pays] = await Promise.all([
      supabase.from('rent_invoices').select('*, tenant_profiles(full_name), property_units(unit_number, properties(name))').eq('id', id!).single(),
      supabase.from('rent_invoice_items').select('*').eq('invoice_id', id!).order('created_at'),
      supabase.from('payments').select('*').eq('invoice_id', id!).order('paid_at'),
    ])
    if (inv.error) throw inv.error; if (items.error) throw items.error; if (pays.error) throw pays.error
    return { inv: inv.data as Invoice, items: (items.data ?? []) as InvoiceItem[], pays: (pays.data ?? []) as Payment[] }
  } })
  const inv = detail.data?.inv ?? invoice
  return (
    <>
      <Modal open={!!invoice} onClose={onClose} size="lg" title={inv ? `Invoice ${inv.invoice_number}` : 'Invoice'} description={inv ? `${inv.tenant_profiles?.full_name ?? ''} · ${inv.property_units?.properties?.name ?? ''} ${inv.property_units?.unit_number ?? ''}` : undefined}>
        {detail.isLoading || !inv ? <SkeletonRows rows={4} /> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone={statusTone(inv.status)}>{humanize(inv.status)}</Badge>
              <span className="text-ink-soft">Period {formatDate(inv.period_start)} – {formatDate(inv.period_end)}</span>
              <span className="text-ink-soft">Due {formatDate(inv.due_date)}</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm"><tbody>
                {detail.data?.items.map((it) => <tr key={it.id} className="border-b border-line last:border-0"><td className="px-3 py-2">{it.description}<span className="ml-2 text-xs text-ink-mute">{humanize(it.item_type)}</span></td><td className="px-3 py-2 text-right tabular-nums">{formatINR(it.amount)}</td></tr>)}
                <tr className="bg-surface font-medium"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{formatINR(inv.total_amount)}</td></tr>
                <tr><td className="px-3 py-2">Paid</td><td className="px-3 py-2 text-right tabular-nums">{formatINR(inv.paid_amount)}</td></tr>
                <tr className="font-semibold"><td className="px-3 py-2">Balance</td><td className="px-3 py-2 text-right tabular-nums">{formatINR(balanceOf(inv))}</td></tr>
              </tbody></table>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-ink">Payments</h3>
              {detail.data?.pays.length === 0 ? <p className="text-sm text-ink-mute">No payments recorded.</p> : (
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {detail.data?.pays.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div><p className="font-medium tabular-nums">{formatINR(p.amount)} <span className="font-normal text-ink-soft">· {humanize(p.method)} · {formatDate(p.paid_at)}</span></p>
                        <p className="text-xs text-ink-mute">{p.receipt_number}{p.status === 'refunded' ? ` · refunded: ${p.refund_reason ?? ''}` : ''}</p></div>
                      <div className="flex items-center gap-1">
                        {p.status === 'refunded' ? <Badge tone="danger">Refunded</Badge> : <>
                          <Link to={`/owner/receipt/${p.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-sm text-ink-soft hover:bg-surface"><Printer className="h-4 w-4" />Receipt</Link>
                          <Button size="sm" variant="ghost" onClick={() => setReason({ mode: 'refund', id: p.id, label: `${formatINR(p.amount)} on ${formatDate(p.paid_at)}` })}><RotateCcw className="h-4 w-4" />Refund</Button></>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {invoiceOpen(inv) && (
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button onClick={() => setPay(inv)}><Plus className="h-4 w-4" />Record payment</Button>
                <Button variant="secondary" onClick={() => setAdj(inv)}><MinusCircle className="h-4 w-4" />Discount / fee</Button>
                <Button variant="secondary" onClick={() => setReason({ mode: 'waive', id: inv.id, label: inv.invoice_number })}><Ban className="h-4 w-4" />Waive</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
      <RecordPaymentModal invoice={pay} onClose={() => setPay(null)} />
      <AdjustModal invoice={adj} onClose={() => setAdj(null)} />
      <ReasonModal mode={reason?.mode ?? 'waive'} target={reason ? { id: reason.id, label: reason.label } : null} onClose={() => setReason(null)} />
    </>
  )
}
