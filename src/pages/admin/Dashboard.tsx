import { useQuery } from '@tanstack/react-query'
import { Building2, CreditCard, DoorOpen, UserCircle, UserX, Users, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatINR } from '@/lib/utils'

interface Stats { owners: number; tenants: number; suspended_users: number; properties: number; units: number; occupied_units: number; total_collected: number; open_maintenance: number }

export default function AdminDashboard() {
  const q = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => { const { data, error } = await supabase.rpc('admin_platform_stats'); if (error) throw error; return data as Stats },
  })
  if (q.isError) return <><PageHeader title="Platform overview" /><Card><ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /></Card></>
  const s = q.data
  return (
    <>
      <PageHeader title="Platform overview" description="Platform-level figures only. Private tenant data and documents are not exposed here." />
      {!s ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Owners" value={s.owners} icon={Users} />
          <StatCard label="Tenant accounts" value={s.tenants} icon={UserCircle} />
          <StatCard label="Suspended users" value={s.suspended_users} icon={UserX} tone={s.suspended_users ? 'warning' : 'success'} />
          <StatCard label="Properties" value={s.properties} icon={Building2} />
          <StatCard label="Rental units" value={s.units} hint={`${s.occupied_units} occupied`} icon={DoorOpen} />
          <StatCard label="Rent collected (all time)" value={formatINR(s.total_collected)} icon={CreditCard} tone="success" />
          <StatCard label="Open maintenance" value={s.open_maintenance} icon={Wrench} tone={s.open_maintenance ? 'warning' : 'success'} />
        </div>
      )}
    </>
  )
}
