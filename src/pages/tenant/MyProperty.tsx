import { Home } from 'lucide-react'
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { formatDate, formatINR, humanize } from '@/lib/utils'
import { useTenancies } from './hooks'

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-ink-mute">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
}

export default function MyProperty() {
  const t = useTenancies()
  if (t.isLoading) return <><PageHeader title="My property" /><Skeleton className="h-64" /></>
  if (t.isError) return <Card><ErrorState message={errMsg(t.error)} onRetry={() => void t.refetch()} /></Card>
  if (!t.data?.length) return <><PageHeader title="My property" /><Card><EmptyState icon={Home} title="No active tenancy" description="Your property details will appear here once your owner assigns you to a unit." /></Card></>

  return (
    <>
      <PageHeader title="My property" />
      <div className="space-y-4">
        {t.data.map((x) => (
          <div key={x.assignment_id} className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={x.property.name} subtitle={humanize(x.property.property_type)} />
              <div className="p-5">
                <p className="text-sm text-ink-soft">{x.property.address_line}, {x.property.city}, {x.property.state} {x.property.pincode}</p>
                {x.property.amenities.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{x.property.amenities.map((a) => <Badge key={a} tone="info">{a}</Badge>)}</div>}
              </div>
            </Card>
            <Card>
              <CardHeader title={`Unit ${x.unit.unit_number}`} />
              <dl className="divide-y divide-line px-5">
                <Row label="Floor" value={x.unit.floor_number === 0 ? 'Ground' : String(x.unit.floor_number)} />
                <Row label="Bedrooms / bathrooms" value={`${x.unit.bedrooms} / ${x.unit.bathrooms}`} />
                {x.unit.area_sqft && <Row label="Built-up area" value={`${x.unit.area_sqft} sq ft`} />}
                <Row label="Move-in date" value={formatDate(x.start_date)} />
                <Row label="Monthly rent" value={formatINR(x.monthly_rent)} />
                <Row label="Rent due" value={`Day ${x.rent_due_day} of each month`} />
                <Row label="Billing cycle" value={humanize(x.billing_cycle)} />
                <Row label="Security deposit" value={formatINR(x.security_deposit)} />
              </dl>
            </Card>
          </div>
        ))}
      </div>
    </>
  )
}
