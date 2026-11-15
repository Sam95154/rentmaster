import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, Building2, Clock, DoorOpen, Landmark, TrendingUp, UserPlus, Users, Wallet, Wrench, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR } from '@/lib/utils'
import type { MonthPoint, OwnerStats, PropertySummary } from '@/lib/types'

const NAVY = '#0E1621', BLUE = '#1F5A8A', GREEN = '#3F7D6B', AMBER = '#C8963E', GREY = '#D4D0C6'

const monthLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
const compactINR = (n: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

function ChartCard({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="h-64 p-3 sm:p-4">
        {empty ? <div className="flex h-full items-center justify-center text-sm text-ink-mute">No data yet</div> : children}
      </div>
    </Card>
  )
}

export default function OwnerDashboard() {
  const stats = useQuery({
    queryKey: ['owner-stats'],
    queryFn: async () => { const { data, error } = await supabase.rpc('owner_dashboard_stats'); if (error) throw error; return data as OwnerStats },
  })
  const series = useQuery({
    queryKey: ['owner-series'],
    queryFn: async () => { const { data, error } = await supabase.rpc('owner_monthly_series', { p_months: 12 }); if (error) throw error; return (data ?? []) as MonthPoint[] },
  })
  const props = useQuery({
    queryKey: ['owner-prop-summary'],
    queryFn: async () => { const { data, error } = await supabase.rpc('owner_property_summary'); if (error) throw error; return (data ?? []) as PropertySummary[] },
  })

  if (stats.isError) return <><PageHeader title="Dashboard" /><Card><ErrorState message={errMsg(stats.error)} onRetry={() => void stats.refetch()} /></Card></>
  const s = stats.data

  if (stats.isLoading || !s || !Array.isArray(s.upcoming_due) || !Array.isArray(s.recent_tenants) || !Array.isArray(s.recent_transactions)) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </>
    )
  }

  const empty = s.total_properties === 0
  const chart = (series.data ?? []).map((p) => ({ ...p, label: monthLabel(p.month), income: Number(p.income), expenses: Number(p.expenses), billed: Number(p.billed) }))
  const annual = chart.reduce((a, p) => a + p.income, 0)
  const other = Math.max(0, s.total_units - s.occupied_units - s.vacant_units)
  const occupancy = [
    { name: 'Occupied', value: s.occupied_units, color: BLUE },
    { name: 'Vacant', value: s.vacant_units, color: GREEN },
    { name: 'Other', value: other, color: GREY },
  ].filter((d) => d.value > 0)
  const byProp = (props.data ?? []).map((p) => ({ name: p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name, income: Number(p.income_12m) }))

  return (
    <>
      <PageHeader title="Dashboard" description="Live figures from your records." actions={<Link to="/owner/properties"><Button>Manage properties</Button></Link>} />

      {empty && (
        <Card className="mb-5">
          <EmptyState icon={Building2} title="Add your first property" description="Create a property, add its rental units, then add tenants and assign them. Your dashboard fills in as you go." action={<Link to="/owner/properties"><Button>Add a property</Button></Link>} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Properties" value={s.total_properties} icon={Building2} />
        <StatCard label="Rental units" value={s.total_units} hint={`${s.occupied_units} occupied · ${s.vacant_units} vacant`} icon={DoorOpen} />
        <StatCard label="Tenants" value={s.total_tenants} icon={Users} />
        <StatCard label="Open maintenance" value={s.open_maintenance} icon={Wrench} tone={s.open_maintenance ? 'warning' : 'success'} />
        <StatCard label="Expected rent / month" value={formatINR(s.expected_rent)} hint="From active tenancies" icon={Banknote} />
        <StatCard label="Collected this month" value={formatINR(s.collected_this_month)} icon={TrendingUp} tone="success" />
        <StatCard label="Pending rent" value={formatINR(s.pending_rent)} icon={Clock} tone="warning" />
        <StatCard label="Overdue rent" value={formatINR(s.overdue_rent)} icon={AlertTriangle} tone={s.overdue_rent > 0 ? 'danger' : 'success'} />
        <StatCard label="Deposits held" value={formatINR(s.deposits_held)} hint="Not counted as income" icon={Landmark} />
        <StatCard label="Expenses this month" value={formatINR(s.expenses_this_month)} icon={Wallet} tone="warning" />
        <StatCard label="Net income this month" value={formatINR(s.net_income_month)} icon={Receipt} tone={s.net_income_month >= 0 ? 'success' : 'danger'} />
        <StatCard label="Revenue, last 12 months" value={formatINR(annual)} icon={TrendingUp} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly income vs expenses" subtitle="Last 12 months" empty={chart.every((p) => p.income === 0 && p.expenses === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -10, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#E3E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={compactINR} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Income" fill={BLUE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill={AMBER} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rent billed vs collected" subtitle="Last 12 months" empty={chart.every((p) => p.billed === 0 && p.income === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ left: -10, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="#E3E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={compactINR} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="billed" name="Billed" stroke={NAVY} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="income" name="Collected" stroke={GREEN} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Occupancy" subtitle="All rental units" empty={occupancy.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={occupancy} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {occupancy.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Property-wise income" subtitle="Last 12 months" empty={byProp.every((p) => p.income === 0)}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byProp} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid horizontal={false} stroke="#E3E8F0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={compactINR} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Bar dataKey="income" name="Income" fill={BLUE} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Upcoming rent dates" subtitle="Next 14 days" />
          {s.upcoming_due.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink-mute">Nothing due soon.</p> : (
            <ul className="divide-y divide-line">
              {s.upcoming_due.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0"><p className="truncate font-medium">{d.tenant_name}</p><p className="text-xs text-ink-mute">Unit {d.unit_number} · due {formatDate(d.due_date)}</p></div>
                  <span className="font-medium">{formatINR(d.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recently added tenants" />
          {s.recent_tenants.length === 0 ? <EmptyState icon={UserPlus} title="No tenants yet" /> : (
            <ul className="divide-y divide-line">
              {s.recent_tenants.map((t) => (
                <li key={t.id}><Link to={`/owner/tenants/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface sm:px-5"><span className="truncate font-medium">{t.full_name}</span><span className="text-xs text-ink-mute">{formatDate(t.created_at)}</span></Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent transactions" />
          {s.recent_transactions.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink-mute">No payments recorded yet.</p> : (
            <ul className="divide-y divide-line">
              {s.recent_transactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                  <div className="min-w-0"><p className="truncate font-medium">{t.tenant_name}</p><p className="text-xs text-ink-mute">{formatDate(t.paid_at)} · {t.method}</p></div>
                  <span className="font-medium text-success">{formatINR(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
