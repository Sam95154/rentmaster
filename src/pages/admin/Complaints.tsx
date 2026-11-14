import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Select, SkeletonRows } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { formatDate, humanize } from '@/lib/utils'
import type { TicketRow } from '@/lib/types'
import { TicketModal, ticketTone } from '../shared/Support'

const STATUSES = ['open', 'in_progress', 'resolved', 'closed']

export default function Complaints() {
  const toast = useToast(); const qc = useQueryClient()
  const [status, setStatus] = useState('open'); const [sel, setSel] = useState<TicketRow | null>(null)
  const list = useQuery({ queryKey: ['admin-tickets', status], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_list_tickets', { p_status: status || null }); if (error) throw error; return (data ?? []) as TicketRow[] } })
  const setS = useMutation({
    mutationFn: async (v: { id: string; status: string }) => { const { error } = await supabase.rpc('admin_set_ticket_status', { p_ticket: v.id, p_status: v.status }); if (error) throw error },
    onSuccess: (_d, v) => { void qc.invalidateQueries(); setSel((s) => (s ? { ...s, status: v.status } : s)); toast.success('Status updated.') }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <>
      <PageHeader title="Complaints" description="Support tickets raised by owners and tenants." />
      <div className="mb-4 sm:w-56"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="No tickets" description="Nothing here for this filter." />
        ) : (
          <ul className="divide-y divide-line">{list.data?.map((t) => (
            <li key={t.id}><button className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface" onClick={() => setSel(t)}>
              <div className="min-w-0"><p className="truncate font-medium text-ink">{t.subject}</p><p className="text-xs text-ink-mute">{t.requester_name} ({humanize(t.requester_role ?? '')}) · {humanize(t.category)} · {formatDate(t.updated_at)} · {t.replies} repl{t.replies === 1 ? 'y' : 'ies'}</p></div>
              <Badge tone={ticketTone(t.status)}>{humanize(t.status)}</Badge></button></li>))}</ul>
        )}
      </Card>
      <TicketModal ticket={sel} admin onClose={() => setSel(null)}>
        {sel && <div className="flex items-center gap-2 text-sm"><label htmlFor="tk-status" className="text-ink-soft">Set status</label>
          <Select id="tk-status" className="w-44" value={sel.status} onChange={(e) => setS.mutate({ id: sel.id, status: e.target.value })} disabled={setS.isPending}>{STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
          <span className="text-xs text-ink-mute">{sel.requester_email}</span></div>}
      </TicketModal>
    </>
  )
}
