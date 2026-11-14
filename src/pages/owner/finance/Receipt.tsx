import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, ErrorState, Skeleton } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize, isUuid } from '@/lib/utils'
import type { ReceiptData } from '@/lib/types'

// Used by both panels: /owner/receipt/:id, /tenant/receipt/:id, and ?deposit=1 for deposit entries.
export default function Receipt({ back }: { back: string }) {
  const { id = '' } = useParams()
  const deposit = new URLSearchParams(window.location.search).get('deposit') === '1'
  const q = useQuery({
    enabled: isUuid(id), queryKey: ['receipt', id, deposit],
    queryFn: async () => {
      const { data, error } = deposit ? await supabase.rpc('get_deposit_receipt', { p_txn_id: id }) : await supabase.rpc('get_receipt', { p_payment_id: id })
      if (error) throw error
      return data as ReceiptData
    },
  })
  const r = q.data
  if (!isUuid(id)) return <ErrorState message="Receipt not found." />
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={back} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />Back</Link>
        <Button onClick={() => window.print()} disabled={!r}><Printer className="h-4 w-4" />Print / save as PDF</Button>
      </div>
      {q.isLoading ? <Skeleton className="h-96" /> : q.isError || !r ? <ErrorState message={q.error ? errMsg(q.error) : 'Receipt not found.'} /> : (
        <article className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8 print:border-0 print:shadow-none" aria-label="Receipt">
          <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
            <div><h1 className="text-xl font-semibold text-ink">{r.kind === 'deposit' ? 'Security Deposit Receipt' : 'Rent Receipt'}</h1><p className="mt-1 text-sm text-ink-soft">{r.owner_name}</p>
              {r.owner_address && <p className="text-xs text-ink-mute">{r.owner_address}</p>}{r.owner_phone && <p className="text-xs text-ink-mute">{r.owner_phone}</p>}</div>
            <div className="text-right text-sm"><p className="font-semibold">{r.receipt_number ?? '—'}</p><p className="text-ink-soft">{formatDate(r.paid_at)}</p></div>
          </header>
          {r.refunded_at && <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger">REFUNDED on {formatDate(r.refunded_at)}{r.refund_reason ? `: ${r.refund_reason}` : ''}. This receipt is no longer valid.</p>}
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-ink-mute">Received from</dt><dd className="font-medium">{r.tenant_name}</dd></div>
            <div><dt className="text-ink-mute">Property</dt><dd className="font-medium">{r.property_name ?? '—'}{r.unit_number ? ` · ${r.unit_number}` : ''}</dd></div>
            {r.kind === 'rent' ? <>
              <div><dt className="text-ink-mute">Invoice</dt><dd className="font-medium">{r.invoice_number ?? 'Advance payment'}</dd></div>
              <div><dt className="text-ink-mute">Period</dt><dd className="font-medium">{r.period_start ? `${formatDate(r.period_start)} – ${formatDate(r.period_end)}` : '—'}</dd></div>
              <div><dt className="text-ink-mute">Method</dt><dd className="font-medium">{humanize(r.method ?? '')}</dd></div>
            </> : <div><dt className="text-ink-mute">Entry type</dt><dd className="font-medium">{humanize(r.txn_type ?? '')}</dd></div>}
            {r.notes && <div className="col-span-2"><dt className="text-ink-mute">Note</dt><dd>{r.notes}</dd></div>}
          </dl>
          <div className="mt-6 flex items-center justify-between rounded-xl bg-surface px-4 py-3"><span className="text-sm text-ink-soft">Amount</span><span className="text-2xl font-semibold tabular-nums">{formatINR(r.amount)}</span></div>
          <p className="mt-6 text-xs text-ink-mute">System-generated receipt. No signature required.</p>
        </article>
      )}
    </div>
  )
}
