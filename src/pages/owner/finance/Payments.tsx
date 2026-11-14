import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CreditCard, Download, PiggyBank, Printer, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pager, Select, SkeletonRows, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { downloadCsv } from '@/lib/csv'
import { PAYMENT_METHODS } from '@/lib/schemas'
import { formatDate, formatINR, humanize, todayISO } from '@/lib/utils'
import type { Payment } from '@/lib/types'
import { AdvanceModal, ReasonModal } from './modals'

const PAGE = 15
const SELECT = '*, tenant_profiles(full_name), rent_invoices(invoice_number)'

export default function Payments() {
  const [page, setPage] = useState(1)
  const [method, setMethod] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [adv, setAdv] = useState(false)
  const [refund, setRefund] = useState<{ id: string; label: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filt = (q: any) => { if (method) q = q.eq('method', method); if (from) q = q.gte('paid_at', `${from}T00:00:00`); if (to) q = q.lte('paid_at', `${to}T23:59:59`); return q }
  const list = useQuery({
    queryKey: ['payments', { method, from, to, page }], placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await filt(supabase.from('payments').select(SELECT, { count: 'exact' })).order('paid_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
      if (error) throw error
      return { rows: (data ?? []) as Payment[], total: (count ?? 0) as number }
    },
  })
  const exportCsv = async () => {
    setExporting(true)
    try {
      const { data, error } = await filt(supabase.from('payments').select(SELECT)).order('paid_at', { ascending: false }).limit(5000)
      if (error) throw error
      downloadCsv(`payments-${todayISO()}.csv`, ['Receipt', 'Date', 'Tenant', 'Invoice', 'Amount', 'Method', 'Status', 'Note'],
        ((data ?? []) as Payment[]).map((p) => [p.receipt_number, p.paid_at.slice(0, 10), p.tenant_profiles?.full_name, p.rent_invoices?.invoice_number ?? 'Advance', Number(p.amount), p.method, p.status, p.notes]))
    } catch (e) { toast.error(errMsg(e)) } finally { setExporting(false) }
  }
  const reset = (f: () => void) => { f(); setPage(1) }

  return (
    <>
      <PageHeader title="Payment History" description="Every payment received, with receipts." actions={<Button onClick={() => setAdv(true)}><PiggyBank className="h-4 w-4" />Advance payment</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select aria-label="Method" value={method} onChange={(e) => reset(() => setMethod(e.target.value))}><option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}</Select>
        <Input type="date" aria-label="From" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />
        <Input type="date" aria-label="To" value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
      </div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments found" description="Payments you record against invoices, and advances, appear here." />
        ) : (
          <>
            <TableWrap>
              <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>Tenant</Th><Th>For</Th><Th className="text-right">Amount</Th><Th>Method</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {list.data?.rows.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-medium">{p.receipt_number ?? '—'}</Td><Td>{formatDate(p.paid_at)}</Td><Td>{p.tenant_profiles?.full_name}</Td>
                    <Td>{p.rent_invoices?.invoice_number ?? 'Advance'}</Td><Td className="text-right tabular-nums">{formatINR(p.amount)}</Td><Td>{humanize(p.method)}</Td>
                    <Td><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></Td>
                    <Td><div className="flex justify-end gap-1">
                      <Link to={`/owner/receipt/${p.id}`} aria-label={`Receipt ${p.receipt_number}`} className="inline-flex h-8 items-center rounded-lg px-2 text-ink-soft hover:bg-surface"><Printer className="h-4 w-4" /></Link>
                      {p.status === 'success' && <Button size="sm" variant="ghost" aria-label="Refund payment" onClick={() => setRefund({ id: p.id, label: `${p.receipt_number} (${formatINR(p.amount)})` })}><RotateCcw className="h-4 w-4" /></Button>}
                    </div></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
      <div className="mt-3 flex justify-end print:hidden"><Button variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting}><Download className="h-4 w-4" />Export CSV</Button></div>
      <AdvanceModal open={adv} onClose={() => setAdv(false)} />
      <ReasonModal mode="refund" target={refund} onClose={() => setRefund(null)} />
    </>
  )
}
