import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Banknote, CalendarClock, PiggyBank, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pager, SkeletonRows, StatCard, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize } from '@/lib/utils'
import type { Invoice, InvoiceItem } from '@/lib/types'
import { useRentSummary } from './hooks'

const PAGE = 12

function InvoiceModal({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const items = useQuery({ enabled: !!invoice, queryKey: ['my-invoice-items', invoice?.id], queryFn: async () => {
    const { data, error } = await supabase.from('rent_invoice_items').select('*').eq('invoice_id', invoice!.id).order('created_at'); if (error) throw error; return (data ?? []) as InvoiceItem[] } })
  return (
    <Modal open={!!invoice} onClose={onClose} title={invoice ? `Invoice ${invoice.invoice_number}` : 'Invoice'} description={invoice ? `Period ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)} · due ${formatDate(invoice.due_date)}` : undefined}>
      {items.isLoading ? <SkeletonRows rows={3} /> : (
        <table className="w-full text-sm"><tbody>
          {items.data?.map((i) => <tr key={i.id} className="border-b border-line"><td className="py-2">{i.description}</td><td className="py-2 text-right tabular-nums">{formatINR(i.amount)}</td></tr>)}
          {invoice && <>
            <tr className="font-medium"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{formatINR(invoice.total_amount)}</td></tr>
            <tr><td className="py-2">Paid</td><td className="py-2 text-right tabular-nums">{formatINR(invoice.paid_amount)}</td></tr>
            <tr className="font-semibold"><td className="py-2">Balance</td><td className="py-2 text-right tabular-nums">{formatINR(Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount)))}</td></tr></>}
        </tbody></table>
      )}
    </Modal>
  )
}

export default function MyRent() {
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Invoice | null>(null)
  const sum = useRentSummary()
  const list = useQuery({ queryKey: ['my-invoices', page], placeholderData: keepPreviousData, queryFn: async () => {
    const { data, error, count } = await supabase.from('rent_invoices').select('*', { count: 'exact' }).order('due_date', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as Invoice[], total: count ?? 0 } } })
  const s = sum.data as (typeof sum.data & { credit?: number }) | undefined
  return (
    <>
      <PageHeader title="My Rent" description="Your invoices and what is currently due. Your owner records payments they receive." />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding" value={s ? formatINR(s.outstanding) : '…'} hint={s ? `${s.open_invoices} open invoice(s)` : undefined} icon={Banknote} tone={s && s.outstanding > 0 ? 'warning' : 'success'} />
        <StatCard label="Next due date" value={s?.next_due_date ? formatDate(s.next_due_date) : '—'} icon={CalendarClock} />
        <StatCard label="Advance credit" value={s ? formatINR(s.credit ?? 0) : '…'} hint="Applied automatically to new invoices" icon={PiggyBank} tone="success" />
      </div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" description="Your invoices will appear here once your owner generates them." />
        ) : (<>
          <TableWrap>
            <thead><tr><Th>Invoice</Th><Th>Period</Th><Th>Due</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th><Th>Status</Th></tr></thead>
            <tbody>{list.data?.rows.map((i) => (
              <tr key={i.id}><Td><button className="font-medium text-brand hover:underline" onClick={() => setSel(i)}>{i.invoice_number}</button></Td><Td>{formatDate(i.period_start)} – {formatDate(i.period_end)}</Td><Td>{formatDate(i.due_date)}</Td>
                <Td className="text-right tabular-nums">{formatINR(i.total_amount)}</Td><Td className="text-right tabular-nums">{formatINR(Math.max(0, Number(i.total_amount) - Number(i.paid_amount)))}</Td><Td><Badge tone={statusTone(i.status)}>{humanize(i.status)}</Badge></Td></tr>))}</tbody>
          </TableWrap>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
      <p className="mt-3 text-xs text-ink-mute">Pay online from <Link to="/tenant/pay" className="text-brand hover:underline">Pay Rent</Link>, or pay your owner directly and they will record it here.</p>
      <InvoiceModal invoice={sel} onClose={() => setSel(null)} />
    </>
  )
}
