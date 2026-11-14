import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CreditCard, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pager, SkeletonRows, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize } from '@/lib/utils'
import type { Payment } from '@/lib/types'

const PAGE = 12
export default function TenantPayments() {
  const [page, setPage] = useState(1)
  const list = useQuery({ queryKey: ['my-payments', page], placeholderData: keepPreviousData, queryFn: async () => {
    const { data, error, count } = await supabase.from('payments').select('*, rent_invoices(invoice_number)', { count: 'exact' }).order('paid_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as Payment[], total: count ?? 0 } } })
  return (
    <>
      <PageHeader title="Payment History" description="Payments your owner has recorded, with receipts." />
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="No payments yet" description="Payments will appear here once your owner records them." />
        ) : (<>
          <TableWrap>
            <thead><tr><Th>Receipt</Th><Th>Date</Th><Th>For</Th><Th className="text-right">Amount</Th><Th>Method</Th><Th>Status</Th><Th><span className="sr-only">Receipt</span></Th></tr></thead>
            <tbody>{list.data?.rows.map((p) => (
              <tr key={p.id}><Td className="font-medium">{p.receipt_number ?? '—'}</Td><Td>{formatDate(p.paid_at)}</Td><Td>{p.rent_invoices?.invoice_number ?? 'Advance'}</Td><Td className="text-right tabular-nums">{formatINR(p.amount)}</Td><Td>{humanize(p.method)}</Td>
                <Td><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></Td>
                <Td><div className="flex justify-end"><Link to={`/tenant/receipt/${p.id}`} aria-label={`Receipt ${p.receipt_number}`} className="inline-flex h-8 items-center rounded-lg px-2 text-ink-soft hover:bg-surface"><Printer className="h-4 w-4" /></Link></div></Td></tr>))}</tbody>
          </TableWrap>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
    </>
  )
}
