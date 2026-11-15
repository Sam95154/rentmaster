import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, statusTone } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize } from '@/lib/utils'
import type { Invoice } from '@/lib/types'

declare global { interface Window { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void } } }

function loadCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.async = true
    s.onload = () => resolve(true); s.onerror = () => resolve(false); document.body.appendChild(s)
  })
}

// The Supabase client wraps non-2xx responses; pull our own {error} message out of them.
async function fnError(e: unknown): Promise<string> {
  const ctx = (e as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') { try { const b = await ctx.json(); if (b?.error) return String(b.error) } catch { /* fall through */ } }
  return errMsg(e)
}

export default function PayRent() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)   // invoice id waiting for the webhook
  const timer = useRef<number>()
  const list = useQuery({ queryKey: ['pay-invoices'], queryFn: async () => {
    const { data, error } = await supabase.from('rent_invoices').select('*').in('status', ['pending', 'partially_paid', 'overdue']).order('due_date'); if (error) throw error; return (data ?? []) as Invoice[] } })

  // After checkout we never mark anything paid ourselves. We only re-read the invoice until the server (webhook) has recorded it.
  useEffect(() => {
    if (!confirming) return
    const start = Date.now(); const before = list.data?.find((i) => i.id === confirming)?.paid_amount
    timer.current = window.setInterval(async () => {
      await qc.invalidateQueries({ queryKey: ['pay-invoices'] }); await qc.invalidateQueries({ queryKey: ['my-rent-summary'] })
      const { data } = await supabase.from('rent_invoices').select('paid_amount, status').eq('id', confirming).single()
      if (data && (data.status === 'paid' || Number(data.paid_amount) !== Number(before))) { setConfirming(null); void qc.invalidateQueries(); toast.success('Payment confirmed. Thank you!') }
      else if (Date.now() - start > 90000) { setConfirming(null); toast.success('Your payment is still being confirmed. It will appear in Payment History shortly; if money left your account and nothing shows within an hour, contact your owner.') }
    }, 3000)
    return () => window.clearInterval(timer.current)
  }, [confirming]) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = async (inv: Invoice) => {
    setBusy(inv.id)
    try {
      const ok = await loadCheckout(); if (!ok) throw new Error('Could not load the payment window. Check your connection and try again.')
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', { body: { invoiceId: inv.id } })
      if (error) throw new Error(await fnError(error))
      const rz = new window.Razorpay!({
        key: data.keyId, order_id: data.orderId, amount: data.amount, currency: data.currency, name: 'RentMaster', description: `Rent ${data.invoiceNumber}`,
        prefill: { name: user?.full_name ?? undefined, email: user?.email ?? undefined, contact: user?.phone ?? undefined }, theme: { color: '#2563EB' },
        handler: () => setConfirming(inv.id),     // the browser callback is NOT proof of payment
        modal: { ondismiss: () => setBusy(null) },
      })
      rz.on('payment.failed', (r) => toast.error(r.error?.description ?? 'The payment failed. You have not been charged.'))
      rz.open()
    } catch (e) { toast.error(await fnError(e)) } finally { setTimeout(() => setBusy(null), 500) }
  }

  return (
    <>
      <PageHeader title="Pay Rent" description="Pay an open invoice securely online." />
      {confirming && <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-ink"><Loader2 className="h-4 w-4 animate-spin" />Confirming your payment with the bank. Please keep this page open…</div>}
      {list.isLoading ? <Card><SkeletonRows /></Card> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.length === 0 ? (
        <Card><EmptyState icon={CreditCard} title="Nothing to pay" description="You have no open invoices." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{list.data?.map((i) => {
          const bal = Math.max(0, Number(i.total_amount) - Number(i.paid_amount))
          return (
            <Card key={i.id}><div className="p-5">
              <div className="flex items-start justify-between"><div><p className="font-semibold text-ink">{i.invoice_number}</p><p className="text-sm text-ink-soft">Due {formatDate(i.due_date)}</p></div><Badge tone={statusTone(i.status)}>{humanize(i.status)}</Badge></div>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{formatINR(bal)}</p><p className="text-xs text-ink-mute">{Number(i.paid_amount) > 0 ? `${formatINR(i.paid_amount)} already paid of ${formatINR(i.total_amount)}` : 'Amount due'}</p>
              <Button className="mt-4 w-full" onClick={() => void pay(i)} loading={busy === i.id} disabled={!!confirming}><CreditCard className="h-4 w-4" />Pay {formatINR(bal)}</Button>
            </div></Card>
          )
        })}</div>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs text-ink-mute"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Payments are processed by Razorpay. Your card or UPI details never reach RentMaster. Your invoice is marked paid only after the bank confirms the payment.</p>
    </>
  )
}
