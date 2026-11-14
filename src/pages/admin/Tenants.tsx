import { useQuery } from '@tanstack/react-query'
import { UserCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, humanize } from '@/lib/utils'

interface T { id: string; full_name: string; email: string | null; status: string; owner_name: string; created_at: string }

export default function AdminTenants() {
  const q = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => { const { data, error } = await supabase.rpc('admin_list_tenants'); if (error) throw error; return (data ?? []) as T[] },
  })
  return (
    <>
      <PageHeader title="Tenants" description="Name, email and status only. Addresses, documents and identity details are private to each owner." />
      <Card>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState icon={UserCircle} title="No tenants yet" /> : (
          <TableWrap>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Owner</Th><Th>Status</Th><Th>Added</Th></tr></thead>
            <tbody>{q.data.map((t) => <tr key={t.id}><Td className="font-medium">{t.full_name}</Td><Td>{t.email ?? '—'}</Td><Td>{t.owner_name}</Td><Td><Badge tone={statusTone(t.status)}>{humanize(t.status)}</Badge></Td><Td>{formatDate(t.created_at)}</Td></tr>)}</tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
