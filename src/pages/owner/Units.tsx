import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DoorOpen, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, ErrorState, Input, PageHeader, Pager, Select, SkeletonRows, SortButton, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { useDebounced } from '@/components/GlobalSearch'
import { errMsg } from '@/lib/errors'
import { formatINR, humanize, likeTerm } from '@/lib/utils'
import { UNIT_STATUSES } from '@/lib/schemas'

const PAGE = 15
type SortKey = 'unit_number' | 'monthly_rent' | 'status'
interface Row { id: string; unit_number: string; floor_number: number; bedrooms: number; monthly_rent: number; status: string; property: { id: string; name: string } | null }

export default function Units() {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'unit_number', dir: 'asc' })
  const q = likeTerm(useDebounced(text, 300))

  const list = useQuery({
    queryKey: ['all-units', { q, status, page, sort }],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('property_units').select('id,unit_number,floor_number,bedrooms,monthly_rent,status,property:properties!inner(id,name)', { count: 'exact' })
        .is('deleted_at', null).order(sort.key, { ascending: sort.dir === 'asc' }).range((page - 1) * PAGE, page * PAGE - 1)
      if (status) query = query.eq('status', status)
      if (q) query = query.ilike('unit_number', `%${q}%`)
      const { data, error, count } = await query
      if (error) throw error
      return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 }
    },
  })

  const toggle = (key: SortKey) => { setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' })); setPage(1) }

  return (
    <>
      <PageHeader title="Rental units" description="Every unit across all your properties. Add and edit units from a property page." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" aria-hidden />
          <Input className="pl-9" placeholder="Search by unit number" aria-label="Search units" value={text} onChange={(e) => { setText(e.target.value); setPage(1) }} />
        </div>
        <Select aria-label="Filter by status" className="sm:w-52" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>{UNIT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>
      </div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={DoorOpen} title="No units found" description={q || status ? 'Try a different search or filter.' : 'Open a property and add its rental units.'} action={!q && !status ? <Link to="/owner/properties" className="text-sm font-medium text-brand hover:underline">Go to properties</Link> : undefined} />
        ) : (
          <>
            <TableWrap>
              <thead><tr>
                <Th><SortButton label="Unit" active={sort.key === 'unit_number'} dir={sort.dir} onClick={() => toggle('unit_number')} /></Th>
                <Th>Property</Th><Th>Floor</Th><Th>Beds</Th>
                <Th><SortButton label="Rent" active={sort.key === 'monthly_rent'} dir={sort.dir} onClick={() => toggle('monthly_rent')} /></Th>
                <Th><SortButton label="Status" active={sort.key === 'status'} dir={sort.dir} onClick={() => toggle('status')} /></Th>
              </tr></thead>
              <tbody>
                {list.data?.rows.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-medium">{u.unit_number}</Td>
                    <Td>{u.property ? <Link to={`/owner/properties/${u.property.id}`} className="text-brand hover:underline">{u.property.name}</Link> : '—'}</Td>
                    <Td>{u.floor_number === 0 ? 'Ground' : u.floor_number}</Td>
                    <Td>{u.bedrooms}</Td>
                    <Td>{formatINR(u.monthly_rent)}</Td>
                    <Td><Badge tone={statusTone(u.status)}>{humanize(u.status)}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  )
}
