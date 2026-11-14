import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Banknote, Calendar, Home, Landmark, Mail, Phone, User, Wrench } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui'
import { useNotifications } from '@/components/NotificationBell'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR } from '@/lib/utils'
import { useRentSummary, useTenancies } from './hooks'

export default function TenantDashboard() {
  const { user } = useAuth()
  const t = useTenancies()
  const rent = useRentSummary()
  const { recent } = useNotifications(4)
  const openMaint = useQuery({ queryKey: ['tenant-open-maintenance'], queryFn: async () => {
    const { count, error } = await supabase.from('maintenance_requests').select('id', { count: 'exact', head: true }).not('status', 'in', '(resolved,rejected,closed)'); if (error) throw error; return count ?? 0 } })

  if (t.isLoading) return <><PageHeader title="Dashboard" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div></>
  if (t.isError) return <Card><ErrorState message={errMsg(t.error)} onRetry={() => void t.refetch()} /></Card>

  const tenancies = t.data ?? []
  if (tenancies.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`} />
        <Card><EmptyState icon={Home} title="No active tenancy yet" description="Your owner has not assigned you to a unit yet. Once they do, your property, rent and deposit details will appear here." /></Card>
      </>
    )
  }

  const main = tenancies[0]
  const outstanding = Number(rent.data?.outstanding ?? 0)
  const nextDue = rent.data?.next_due_date

  return (
    <>
      <PageHeader title={`Welcome${user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}`} description={`${main.property.name} · Unit ${main.unit.unit_number}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Monthly rent" value={formatINR(main.monthly_rent)} hint={`Due on day ${main.rent_due_day}`} icon={Banknote} />
        <StatCard label="Outstanding" value={formatINR(outstanding)} hint={nextDue ? `Next due ${formatDate(nextDue)}` : 'No open invoices'} icon={Calendar} tone={outstanding > 0 ? 'warning' : 'success'} />
        <StatCard label="Security deposit" value={formatINR(main.security_deposit)} icon={Landmark} />
        <StatCard label="Open maintenance" value={openMaint.data ?? '—'} hint={openMaint.data ? 'Requests in progress' : 'No open requests'} icon={Wrench} tone={openMaint.data ? 'warning' : 'success'} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Your home" action={<Link to="/tenant/property" className="text-sm font-medium text-brand hover:underline">Details</Link>} />
          <div className="space-y-4 p-5">
            {tenancies.map((x) => (
              <div key={x.assignment_id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-medium">{x.property.name} · Unit {x.unit.unit_number}</p><p className="text-sm text-ink-soft">{x.property.address_line}, {x.property.city}</p></div>
                <Badge tone="success">Since {formatDate(x.start_date)}</Badge>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-sm font-medium">
              <Link to="/tenant/rent" className="text-brand hover:underline">View rent and invoices</Link>
              <Link to="/tenant/maintenance" className="text-brand hover:underline">Report a problem</Link>
              <Link to="/tenant/documents" className="text-brand hover:underline">Documents</Link>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Your owner" />
          <dl className="space-y-3 p-5 text-sm">
            <div className="flex items-center gap-2"><User className="h-4 w-4 text-ink-mute" aria-hidden /><dd>{main.owner.full_name || '—'}</dd></div>
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-mute" aria-hidden /><dd className="truncate">{main.owner.email}</dd></div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-mute" aria-hidden /><dd>{main.owner.phone || '—'}</dd></div>
          </dl>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Latest notifications" action={<Link to="/tenant/notifications" className="text-sm font-medium text-brand hover:underline">View all</Link>} />
        {recent.length === 0 ? <p className="px-5 py-6 text-sm text-ink-mute">No notifications yet.</p> : (
          <ul className="divide-y divide-line">{recent.map((n) => <li key={n.id} className="px-5 py-3 text-sm"><p className="font-medium">{n.title}</p>{n.body && <p className="text-ink-soft">{n.body}</p>}</li>)}</ul>
        )}
      </Card>
    </>
  )
}
