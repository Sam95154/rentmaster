import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows, TableWrap, Td, Th } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatINR, humanize, todayISO } from '@/lib/utils'

type Row = Record<string, unknown>
interface Col { key: string; label: string; kind?: 'money' | 'date' | 'text' | 'month' | 'num' }
interface Def { id: string; label: string; fn: string; range: 'year' | 'dates' | 'asof' | 'none'; cols: Col[]; chart?: boolean }

const REPORTS: Def[] = [
  { id: 'income', label: 'Income vs expenses', fn: 'report_income_expense', range: 'year', chart: true, cols: [{ key: 'month', label: 'Month', kind: 'month' }, { key: 'income', label: 'Income', kind: 'money' }, { key: 'expenses', label: 'Expenses', kind: 'money' }, { key: 'net', label: 'Net', kind: 'money' }] },
  { id: 'outstanding', label: 'Outstanding rent', fn: 'report_outstanding', range: 'asof', cols: [{ key: 'invoice_number', label: 'Invoice' }, { key: 'tenant_name', label: 'Tenant' }, { key: 'property_name', label: 'Property' }, { key: 'unit_number', label: 'Unit' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'total', label: 'Total', kind: 'money' }, { key: 'paid', label: 'Paid', kind: 'money' }, { key: 'balance', label: 'Balance', kind: 'money' }, { key: 'days_overdue', label: 'Days overdue', kind: 'num' }, { key: 'status', label: 'Status' }] },
  { id: 'late', label: 'Late payments', fn: 'report_late_payments', range: 'dates', cols: [{ key: 'invoice_number', label: 'Invoice' }, { key: 'tenant_name', label: 'Tenant' }, { key: 'unit_number', label: 'Unit' }, { key: 'due_date', label: 'Due', kind: 'date' }, { key: 'total', label: 'Total', kind: 'money' }, { key: 'last_paid', label: 'Last paid', kind: 'date' }, { key: 'days_late', label: 'Days late', kind: 'num' }, { key: 'status', label: 'Status' }] },
  { id: 'property', label: 'Revenue by property', fn: 'report_property_revenue', range: 'dates', cols: [{ key: 'property_name', label: 'Property' }, { key: 'total_units', label: 'Units', kind: 'num' }, { key: 'occupied_units', label: 'Occupied', kind: 'num' }, { key: 'income', label: 'Income', kind: 'money' }, { key: 'expenses', label: 'Expenses', kind: 'money' }, { key: 'net', label: 'Net', kind: 'money' }] },
  { id: 'cats', label: 'Expenses by category', fn: 'report_expenses_by_category', range: 'dates', cols: [{ key: 'category', label: 'Category' }, { key: 'entries', label: 'Entries', kind: 'num' }, { key: 'total', label: 'Total', kind: 'money' }] },
  { id: 'vacant', label: 'Vacant units', fn: 'report_vacant_units', range: 'none', cols: [{ key: 'property_name', label: 'Property' }, { key: 'unit_number', label: 'Unit' }, { key: 'floor_number', label: 'Floor', kind: 'num' }, { key: 'bedrooms', label: 'Bedrooms', kind: 'num' }, { key: 'monthly_rent', label: 'Rent', kind: 'money' }, { key: 'status', label: 'Status', kind: 'text' }] },
]

const monthLabel = (v: unknown) => new Date(String(v)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
function fmt(c: Col, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  switch (c.kind) {
    case 'money': return formatINR(Number(v))
    case 'date': return formatDate(String(v))
    case 'month': return monthLabel(v)
    case 'num': return String(v)
    default: return c.key === 'status' ? humanize(String(v)) : String(v)
  }
}
const raw = (c: Col, v: unknown) => c.kind === 'money' || c.kind === 'num' ? (v === null || v === undefined ? null : Number(v)) : c.kind === 'month' ? String(v).slice(0, 7) : v

export default function Reports() {
  const [id, setId] = useState('income')
  const def = REPORTS.find((r) => r.id === id)!
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [to, setTo] = useState(todayISO())
  const [asOf, setAsOf] = useState(todayISO())

  const args = useMemo(() => def.range === 'year' ? { p_year: year } : def.range === 'dates' ? { p_from: from, p_to: to } : def.range === 'asof' ? { p_as_of: asOf } : {}, [def.range, year, from, to, asOf])
  const q = useQuery({ queryKey: ['report', id, args], queryFn: async () => {
    const { data, error } = await supabase.rpc(def.fn, args); if (error) throw error; return (data ?? []) as Row[]
  } })
  const rows = q.data ?? []
  const sums = def.cols.filter((c) => c.kind === 'money' && !['balance'].includes(c.key) || c.key === 'balance').map((c) => [c, rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0)] as const)
  const chart = def.chart ? rows.map((r) => ({ month: monthLabel(r.month), Income: Number(r.income), Expenses: Number(r.expenses) })) : []
  const title = `${def.label}${def.range === 'year' ? ` ${year}` : def.range === 'dates' ? ` ${from} to ${to}` : def.range === 'asof' ? ` as of ${asOf}` : ''}`

  return (
    <>
      <PageHeader title="Reports" description="Figures are calculated in the database from your invoices, payments and expenses."
        actions={<><Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(`${def.id}-${todayISO()}.csv`, def.cols.map((c) => c.label), rows.map((r) => def.cols.map((c) => raw(c, r[c.key]))))}><Download className="h-4 w-4" />CSV</Button><Button variant="secondary" disabled={!rows.length} onClick={() => window.print()}><Printer className="h-4 w-4" />Print / PDF</Button></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 print:hidden">
        <Select aria-label="Report" value={id} onChange={(e) => setId(e.target.value)}>{REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
        {def.range === 'year' && <Input type="number" aria-label="Year" min={2000} max={now.getFullYear() + 1} value={year} onChange={(e) => { const y = Number(e.target.value); if (y >= 2000 && y <= now.getFullYear() + 1) setYear(y) }} />}
        {def.range === 'dates' && <><Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} /></>}
        {def.range === 'asof' && <Input type="date" aria-label="As of" value={asOf} onChange={(e) => setAsOf(e.target.value)} />}
      </div>
      <h2 className="mb-3 hidden text-lg font-semibold print:block">{title}</h2>
      {def.chart && rows.length > 0 && (
        <Card><div className="h-72 p-4" role="img" aria-label="Monthly income and expenses bar chart"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${Number(v) >= 1000 ? `${Number(v) / 1000}k` : v}`} /><Tooltip formatter={(v) => formatINR(Number(v))} /><Legend />
            <Bar dataKey="Income" fill="#2563EB" radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="Expenses" fill="#F59E0B" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart>
        </ResponsiveContainer></div></Card>
      )}
      <div className={def.chart ? 'mt-4' : ''}>
        <Card>
          {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : rows.length === 0 ? (
            <EmptyState icon={BarChart3} title="Nothing to report" description="There is no data for this report and period." />
          ) : (
            <TableWrap>
              <thead><tr>{def.cols.map((c) => <Th key={c.key} className={c.kind === 'money' || c.kind === 'num' ? 'text-right' : ''}>{c.label}</Th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{def.cols.map((c) => <Td key={c.key} className={c.kind === 'money' || c.kind === 'num' ? 'text-right tabular-nums' : ''}>{fmt(c, r[c.key])}</Td>)}</tr>)}</tbody>
              {sums.length > 0 && <tfoot><tr className="bg-surface font-semibold">{def.cols.map((c, i) => { const s = sums.find(([sc]) => sc.key === c.key); return <Td key={c.key} className={s ? 'text-right tabular-nums' : ''}>{s ? formatINR(s[1]) : i === 0 ? 'Total' : ''}</Td> })}</tr></tfoot>}
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
