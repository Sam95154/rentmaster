import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, statusTone } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatINR, humanize } from '@/lib/utils'
import type { DepositRow } from '@/lib/types'
import { DepositLedger, useDeposits } from '../owner/finance/Deposits'

export default function TenantDeposit() {
  const q = useDeposits()
  const [ledger, setLedger] = useState<DepositRow | null>(null)
  return (
    <>
      <PageHeader title="Security Deposit" description="What you paid, what was deducted and what has been refunded." />
      {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <Card><EmptyState icon={ShieldCheck} title="No deposit on record" description="If your tenancy has a deposit it will show here." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data?.map((d) => (
            <Card key={d.deposit_id}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink">{d.property_name} · {d.unit_number}</p><p className="text-sm text-ink-soft">{d.tenancy_status === 'active' ? 'Current tenancy' : `Tenancy ${d.tenancy_status}`}</p></div><Badge tone={statusTone(d.status)}>{humanize(d.status)}</Badge></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {([['Agreed deposit', d.expected], ['Paid', d.received], ['Deducted', d.deducted], ['Refunded', d.refunded]] as const).map(([k, v]) => <div key={k}><dt className="text-ink-mute">{k}</dt><dd className="font-medium tabular-nums">{formatINR(v)}</dd></div>)}
                </dl>
                <div className="mt-4 flex items-center justify-between rounded-lg bg-surface px-3 py-2"><span className="text-sm text-ink-soft">Currently held by owner</span><span className="font-semibold tabular-nums">{formatINR(d.held)}</span></div>
                <Button className="mt-4" variant="secondary" size="sm" onClick={() => setLedger(d)}>View entries and receipts</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <DepositLedger deposit={ledger} onClose={() => setLedger(null)} base="/tenant" />
    </>
  )
}
