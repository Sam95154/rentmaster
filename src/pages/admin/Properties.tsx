import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pager, SkeletonRows, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, humanize } from '@/lib/utils'

const PAGE = 20
interface Row { id: string; name: string; city: string; state: string; status: string; created_at: string; owner: { full_name: string } | null }

export default function AdminProperties() {
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['admin-properties', page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await supabase.from('properties').select('id,name,city,state,status,created_at,owner:users(full_name)', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
      if (error) throw error
      return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 }
    },
  })
  return (
    <>
      <PageHeader title="Properties" description="All registered properties, active and archived." />
      <Card>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.rows.length ? <EmptyState icon={Building2} title="No properties yet" /> : (
          <>
            <TableWrap>
              <thead><tr><Th>Property</Th><Th>Owner</Th><Th>Location</Th><Th>Status</Th><Th>Added</Th></tr></thead>
              <tbody>{q.data.rows.map((p) => <tr key={p.id}><Td className="font-medium">{p.name}</Td><Td>{p.owner?.full_name || '—'}</Td><Td>{p.city}, {p.state}</Td><Td><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge></Td><Td>{formatDate(p.created_at)}</Td></tr>)}</tbody>
            </TableWrap>
            <Pager page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
