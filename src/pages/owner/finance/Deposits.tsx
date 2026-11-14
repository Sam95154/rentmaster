import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Printer, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, StatCard, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { errMsg } from '@/lib/errors'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatINR, humanize, todayISO } from '@/lib/utils'
import type { DepositRow } from '@/lib/types'
import { DepositTxnModal } from './modals'

interface Txn { id: string; txn_type: string; amount: number; txn_date: string; note: string | null; receipt_number: string | null }

export function DepositLedger({ deposit, onClose, base }: { deposit: DepositRow | null; onClose: () => void; base: string }) {
  const q = useQuery({ enabled: !!deposit, queryKey: ['deposit-txns', deposit?.deposit_id], queryFn: async () => {
    const { data, error } = await supabase.from('deposit_transactions').select('*').eq('deposit_id', deposit!.deposit_id).order('txn_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error; return (data ?? []) as Txn[]
  } })
  return (
    <Modal open={!!deposit} onClose={onClose} size="lg" title="Deposit ledger" description={deposit ? `${deposit.tenant_name} · ${deposit.property_name} ${deposit.unit_number}` : undefined}>
      {q.isLoading ? <SkeletonRows rows={3} /> : q.isError ? <ErrorState message={errMsg(q.error)} /> : q.data?.length === 0 ? <p className="text-sm text-ink-mute">No entries yet.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {q.data?.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div><p className="font-medium">{humanize(x.txn_type)} <span className="font-normal text-ink-soft">· {formatDate(x.txn_date)}</span></p><p className="text-xs text-ink-mute">{x.receipt_number}{x.note ? ` · ${x.note}` : ''}</p></div>
              <div className="flex items-center gap-2"><span className={`tabular-nums ${x.txn_type === 'received' ? 'text-success' : 'text-ink'}`}>{x.txn_type === 'received' ? '+' : '−'}{formatINR(x.amount)}</span>
                <Link to={`${base}/receipt/${x.id}?deposit=1`} aria-label="Open receipt" className="rounded-lg p-1.5 text-ink-soft hover:bg-surface"><Printer className="h-4 w-4" /></Link></div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export function useDeposits() {
  return useQuery({ queryKey: ['deposit-overview'], queryFn: async () => {
    const { data, error } = await supabase.rpc('deposit_overview'); if (error) throw error; return (data ?? []) as DepositRow[]
  } })
}

export default function Deposits() {
  const q = useDeposits()
  const [entry, setEntry] = useState<DepositRow | null>(null)
  const [ledger, setLedger] = useState<DepositRow | null>(null)
  const rows = q.data ?? []
  const held = rows.reduce((a, r) => a + Number(r.held), 0)
  const pending = rows.reduce((a, r) => a + Math.max(0, Number(r.expected) - Number(r.received)), 0)
  return (
    <>
      <PageHeader title="Security Deposits" description="Held separately from rental income. Deductions and refunds can never exceed the amount held."
        actions={<Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`deposits-${todayISO()}.csv`, ['Tenant', 'Property', 'Unit', 'Expected', 'Received', 'Deducted', 'Refunded', 'Held', 'Status'],
          rows.map((r) => [r.tenant_name, r.property_name, r.unit_number, Number(r.expected), Number(r.received), Number(r.deducted), Number(r.refunded), Number(r.held), r.status]))}><Download className="h-4 w-4" />Export CSV</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <StatCard label="Currently held" value={formatINR(held)} icon={ShieldCheck} tone="success" />
        <StatCard label="Still to collect" value={formatINR(pending)} icon={ShieldCheck} tone="warning" />
      </div>
      <Card>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No deposits yet" description="A deposit record is created automatically when you assign a tenant to a unit." />
        ) : (
          <TableWrap>
            <thead><tr><Th>Tenant / unit</Th><Th className="text-right">Expected</Th><Th className="text-right">Received</Th><Th className="text-right">Deducted</Th><Th className="text-right">Refunded</Th><Th className="text-right">Held</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.deposit_id}>
                <Td><button className="font-medium text-brand hover:underline" onClick={() => setLedger(r)}>{r.tenant_name}</button><p className="text-xs text-ink-mute">{r.property_name} · {r.unit_number}{r.tenancy_status !== 'active' ? ` · tenancy ${r.tenancy_status}` : ''}</p></Td>
                <Td className="text-right tabular-nums">{formatINR(r.expected)}</Td><Td className="text-right tabular-nums">{formatINR(r.received)}</Td>
                <Td className="text-right tabular-nums">{formatINR(r.deducted)}</Td><Td className="text-right tabular-nums">{formatINR(r.refunded)}</Td><Td className="text-right font-medium tabular-nums">{formatINR(r.held)}</Td>
                <Td><Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge></Td>
                <Td><div className="flex justify-end"><Button size="sm" variant="secondary" onClick={() => setEntry(r)}>Add entry</Button></div></Td>
              </tr>))}</tbody>
          </TableWrap>
        )}
      </Card>
      <DepositTxnModal deposit={entry} onClose={() => setEntry(null)} />
      <DepositLedger deposit={ledger} onClose={() => setLedger(null)} base="/owner" />
    </>
  )
}
