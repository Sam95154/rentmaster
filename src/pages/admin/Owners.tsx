import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCircle2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { formatDate, humanize } from '@/lib/utils'

interface Owner { id: string; full_name: string; email: string; status: string; created_at: string; properties: number; units: number }

export default function AdminOwners() {
  const toast = useToast()
  const qc = useQueryClient()
  const [target, setTarget] = useState<{ o: Owner; status: 'active' | 'suspended' } | null>(null)

  const q = useQuery({
    queryKey: ['admin-owners'],
    queryFn: async () => { const { data, error } = await supabase.rpc('admin_list_owners'); if (error) throw error; return (data ?? []) as Owner[] },
  })
  const m = useMutation({
    mutationFn: async (v: { o: Owner; status: 'active' | 'suspended' }) => { const { error } = await supabase.rpc('admin_set_user_status', { p_user_id: v.o.id, p_status: v.status }); if (error) throw error },
    onSuccess: (_d, v) => { void qc.invalidateQueries(); toast.success(v.status === 'suspended' ? 'Owner suspended.' : 'Owner reactivated.'); setTarget(null) },
    onError: (e) => { toast.error(errMsg(e)); setTarget(null) },
  })

  return (
    <>
      <PageHeader title="Owners" description="Property owner accounts on the platform." />
      <Card>
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState icon={Users} title="No owners yet" /> : (
          <TableWrap>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th>Properties</Th><Th>Units</Th><Th>Status</Th><Th>Joined</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {q.data.map((o) => (
                <tr key={o.id}>
                  <Td className="font-medium">{o.full_name || '—'}</Td><Td>{o.email}</Td><Td>{o.properties}</Td><Td>{o.units}</Td>
                  <Td><Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge></Td><Td>{formatDate(o.created_at)}</Td>
                  <Td className="text-right">
                    {o.status === 'suspended'
                      ? <Button size="sm" variant="secondary" onClick={() => setTarget({ o, status: 'active' })}><CheckCircle2 className="h-4 w-4" />Reactivate</Button>
                      : <Button size="sm" variant="ghost" onClick={() => setTarget({ o, status: 'suspended' })}><Ban className="h-4 w-4" />Suspend</Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <ConfirmDialog open={!!target} danger={target?.status === 'suspended'} loading={m.isPending}
        title={target?.status === 'suspended' ? 'Suspend owner?' : 'Reactivate owner?'}
        message={target?.status === 'suspended' ? <>{target?.o.full_name || target?.o.email} will be blocked from signing in to the app. Their data is kept.</> : <>{target?.o.full_name || target?.o.email} will be able to use the app again.</>}
        confirmLabel={target?.status === 'suspended' ? 'Suspend' : 'Reactivate'}
        onConfirm={() => target && m.mutate(target)} onCancel={() => setTarget(null)} />
    </>
  )
}
