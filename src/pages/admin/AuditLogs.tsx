import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pager, SkeletonRows, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'

const PAGE = 25
interface Row { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string }

export default function AdminAudit() {
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['audit', page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,created_at', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
      if (error) throw error
      return { rows: (data ?? []) as Row[], total: count ?? 0 }
    },
  })
  return (
    <>
      <PageHeader title="Audit logs" description="Every create, update and delete on core records, with who did it." />
      <Card>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.rows.length ? <EmptyState icon={ClipboardList} title="No activity recorded yet" /> : (
          <>
            <TableWrap>
              <thead><tr><Th>When</Th><Th>Action</Th><Th>Record</Th><Th>Actor</Th></tr></thead>
              <tbody>{q.data.rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString('en-IN')}</Td>
                  <Td><Badge tone={r.action === 'DELETE' ? 'danger' : r.action === 'INSERT' ? 'success' : 'info'}>{r.action}</Badge></Td>
                  <Td>{r.entity_type}<span className="ml-2 text-xs text-ink-mute">{r.entity_id?.slice(0, 8)}</span></Td>
                  <Td className="text-xs text-ink-mute">{r.actor_id ? r.actor_id.slice(0, 8) : 'system'}</Td>
                </tr>
              ))}</tbody>
            </TableWrap>
            <Pager page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
