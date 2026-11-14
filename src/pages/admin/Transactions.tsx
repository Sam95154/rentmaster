import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, ReceiptText, TriangleAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Pager, Select, SkeletonRows, StatCard, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize } from '@/lib/utils'
import type { AdminPayment } from '@/lib/types'

const PAGE = 25
interface Summary { collected_total: number; collected_30d: number; online_total: number; manual_total: number; refunded_total: number; failed_events: number; open_orders: number }
interface WebhookEv { event_id: string; event_type: string; status: string; error: string | null; received_at: string }

export default function Transactions() {
  const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [page, setPage] = useState(1)
  const sum = useQuery({ queryKey: ['admin-pay-summary'], queryFn: async () => { const { data, error } = await supabase.rpc('admin_payment_summary'); if (error) throw error; return data as Summary } })
  const list = useQuery({ queryKey: ['admin-payments', status, from, to, page], placeholderData: keepPreviousData, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_list_payments', { p_status: status || null, p_from: from || null, p_to: to || null, p_limit: PAGE, p_offset: (page - 1) * PAGE })
    if (error) throw error; const d = data as { rows?: AdminPayment[]; total?: number } | null; return { rows: d?.rows ?? [], total: d?.total ?? 0 } } })
  const hooks = useQuery({ queryKey: ['admin-webhooks'], queryFn: async () => { const { data, error } = await supabase.rpc('admin_list_webhook_events', { p_status: null, p_limit: 20 }); if (error) throw error; return (data ?? []) as WebhookEv[] } })
  const reset = () => setPage(1)
  return (
    <>
      <PageHeader title="Transactions" description="Rent payments across the platform. Tenant and owner names only; no personal details." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected (all time)" value={sum.data ? formatINR(sum.data.collected_total) : '—'} icon={Banknote} tone="success" />
        <StatCard label="Collected (30 days)" value={sum.data ? formatINR(sum.data.collected_30d) : '—'} icon={ReceiptText} />
        <StatCard label="Online / manual" value={sum.data ? `${formatINR(sum.data.online_total)} / ${formatINR(sum.data.manual_total)}` : '—'} icon={CreditCard} />
        <StatCard label="Failed events · open orders" value={sum.data ? `${sum.data.failed_events} · ${sum.data.open_orders}` : '—'} icon={TriangleAlert} tone={sum.data && sum.data.failed_events > 0 ? 'warning' : 'info'} />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); reset() }}><option value="">All statuses</option>{['success', 'refunded', 'failed', 'pending'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
        <Input type="date" aria-label="From date" value={from} onChange={(e) => { setFrom(e.target.value); reset() }} />
        <Input type="date" aria-label="To date" value={to} onChange={(e) => { setTo(e.target.value); reset() }} />
      </div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.rows?.length ? <EmptyState icon={Banknote} title="No transactions" description="Nothing matches these filters." /> : (<>
          <TableWrap>
            <thead><tr><Th>Date</Th><Th>Receipt</Th><Th>Owner</Th><Th>Tenant</Th><Th>Method</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
            <tbody>{list.data.rows.map((p) => (
              <tr key={p.id}><Td>{formatDate(p.paid_at)}</Td><Td>{p.receipt_number ?? '—'}</Td><Td>{p.owner_name}</Td><Td>{p.tenant_name}</Td><Td>{humanize(p.method)}</Td><Td className="font-medium">{formatINR(p.amount)}</Td><Td><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></Td></tr>))}</tbody>
          </TableWrap>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>)}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Recent gateway events" subtitle="Razorpay webhook deliveries (no payloads shown)." />
        {hooks.isLoading ? <SkeletonRows rows={3} /> : hooks.isError ? <ErrorState message={errMsg(hooks.error)} onRetry={() => void hooks.refetch()} /> : !hooks.data?.length ? <p className="px-5 pb-5 text-sm text-ink-mute">No events received yet.</p> : (
          <TableWrap>
            <thead><tr><Th>Received</Th><Th>Event</Th><Th>Status</Th><Th>Note</Th></tr></thead>
            <tbody>{hooks.data.map((e) => (
              <tr key={e.event_id}><Td>{formatDate(e.received_at)}</Td><Td>{e.event_type}</Td><Td><Badge tone={statusTone(e.status)}>{humanize(e.status)}</Badge></Td><Td className="max-w-xs truncate text-ink-mute">{e.error ?? '—'}</Td></tr>))}</tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
