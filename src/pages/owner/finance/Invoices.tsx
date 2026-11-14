import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Bell, Download, FilePlus2, PiggyBank, Receipt, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pager, Select, SkeletonRows, StatCard, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatINR, humanize, todayISO } from '@/lib/utils'
import type { Invoice, MonthSummary } from '@/lib/types'
import { AdvanceModal, InvoiceDetailModal, invoiceOpen, ManualInvoiceModal, RecordPaymentModal } from './modals'

const PAGE = 15
const SELECT = '*, tenant_profiles(full_name), property_units(unit_number, properties(name))'
const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return `${ym.slice(0, 7)}-${String(last).padStart(2, '0')}` }

interface Filters { status: string; from: string; to: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(q: any, f: Filters) {
  if (f.status) q = q.eq('status', f.status)
  if (f.from) q = q.gte('due_date', f.from)
  if (f.to) q = q.lte('due_date', f.to)
  return q
}

function InvoiceTable({ filters, extra }: { filters: Filters; extra?: React.ReactNode }) {
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [pay, setPay] = useState<Invoice | null>(null)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()
  const key = JSON.stringify(filters)
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) { setLastKey(key); setPage(1) }

  const list = useQuery({
    queryKey: ['invoices', filters, page], placeholderData: keepPreviousData,
    queryFn: async () => {
      const q = (applyFilters(supabase.from('rent_invoices').select(SELECT, { count: 'exact' }), filters) as ReturnType<ReturnType<typeof supabase.from>['select']>).order('due_date', { ascending: false }).order('invoice_number', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
      const { data, error, count } = await q
      if (error) throw error
      return { rows: (data ?? []) as unknown as Invoice[], total: count ?? 0 }
    },
  })

  const exportCsv = async () => {
    setExporting(true)
    try {
      const { data, error } = await applyFilters(supabase.from('rent_invoices').select(SELECT), filters).order('due_date', { ascending: false }).limit(5000)
      if (error) throw error
      const rows = (data ?? []) as unknown as Invoice[]
      downloadCsv(`invoices-${todayISO()}.csv`, ['Invoice', 'Tenant', 'Property', 'Unit', 'Period start', 'Period end', 'Due date', 'Rent', 'Late fee', 'Discount', 'Total', 'Paid', 'Balance', 'Status'],
        rows.map((i) => [i.invoice_number, i.tenant_profiles?.full_name, i.property_units?.properties?.name, i.property_units?.unit_number, i.period_start, i.period_end, i.due_date, Number(i.amount), Number(i.late_fee), Number(i.discount), Number(i.total_amount), Number(i.paid_amount), Number(i.total_amount) - Number(i.paid_amount), i.status]))
      if (rows.length === 5000) toast.success('Export limited to the latest 5,000 invoices. Narrow the date range for the rest.')
    } catch (e) { toast.error(errMsg(e)) } finally { setExporting(false) }
  }

  return (
    <>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices found" description="Invoices are generated from active tenancies. Use “Generate invoices” or change the filters." />
        ) : (
          <>
            <TableWrap>
              <thead><tr><Th>Invoice</Th><Th>Tenant / unit</Th><Th>Due</Th><Th className="text-right">Total</Th><Th className="text-right">Balance</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
              <tbody>
                {list.data?.rows.map((i) => (
                  <tr key={i.id}>
                    <Td><button className="font-medium text-brand hover:underline" onClick={() => setDetail(i)}>{i.invoice_number}</button><p className="text-xs text-ink-mute">{formatDate(i.period_start)} – {formatDate(i.period_end)}</p></Td>
                    <Td><p>{i.tenant_profiles?.full_name}</p><p className="text-xs text-ink-mute">{i.property_units?.properties?.name} · {i.property_units?.unit_number}</p></Td>
                    <Td>{formatDate(i.due_date)}</Td>
                    <Td className="text-right tabular-nums">{formatINR(i.total_amount)}</Td>
                    <Td className="text-right tabular-nums">{formatINR(Math.max(0, Number(i.total_amount) - Number(i.paid_amount)))}</Td>
                    <Td><Badge tone={statusTone(i.status)}>{humanize(i.status)}</Badge></Td>
                    <Td><div className="flex justify-end">{invoiceOpen(i) && <Button size="sm" variant="secondary" onClick={() => setPay(i)}>Record payment</Button>}</div></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>{extra}</div>
        <Button variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting}><Download className="h-4 w-4" />Export CSV</Button>
      </div>
      <InvoiceDetailModal invoice={detail} onClose={() => setDetail(null)} />
      <RecordPaymentModal invoice={pay} onClose={() => setPay(null)} />
    </>
  )
}

function useGenerate() {
  const toast = useToast(); const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('generate_my_invoices'); if (error) throw error; return data as { created?: number; late_fees_added?: number; marked_overdue?: number } },
    onSuccess: (d) => { void qc.invalidateQueries(); toast.success(`Billing run complete: ${d?.created ?? 0} new invoice(s), ${d?.late_fees_added ?? 0} late fee(s) applied.`) },
    onError: (e) => toast.error(errMsg(e)),
  })
}

function useReminders() {
  const toast = useToast(); const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => { const { data, error } = await supabase.rpc('run_my_reminders'); if (error) throw error; return data as { upcoming: number; due_today: number; overdue: number; lease_expiry: number } },
    onSuccess: (d) => { void qc.invalidateQueries(); const n = (d?.upcoming ?? 0) + (d?.due_today ?? 0) + (d?.overdue ?? 0); toast.success(n ? `Sent ${n} reminder(s) to tenants.` : 'No new reminders were due. Tenants are only reminded once per stage.') },
    onError: (e) => toast.error(errMsg(e)),
  })
}

export function RentCollection() {
  const rem = useReminders()
  const [month, setMonth] = useState(monthStart().slice(0, 7))
  const [status, setStatus] = useState('')
  const [advance, setAdvance] = useState(false)
  const gen = useGenerate()
  const sum = useQuery({ queryKey: ['rent-month', month], queryFn: async () => {
    const { data, error } = await supabase.rpc('rent_month_summary', { p_month: `${month}-01` }); if (error) throw error; return data as MonthSummary
  } })
  const s = sum.data
  return (
    <>
      <PageHeader title="Rent Collection" description="Track what is due, collected and overdue for each month."
        actions={<><Button variant="secondary" onClick={() => rem.mutate()} loading={rem.isPending}><Bell className="h-4 w-4" />Send reminders</Button><Button variant="secondary" onClick={() => setAdvance(true)}><PiggyBank className="h-4 w-4" />Advance payment</Button><Button onClick={() => gen.mutate()} loading={gen.isPending}><RefreshCw className="h-4 w-4" />Generate invoices</Button></>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input type="month" aria-label="Month" className="sm:w-48" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <Select aria-label="Status" className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{['pending', 'partially_paid', 'paid', 'overdue', 'waived', 'refunded'].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
        </Select>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Billed" value={s ? formatINR(s.billed) : '…'} hint={s ? `${s.invoices} invoice(s)` : undefined} icon={Receipt} />
        <StatCard label="Collected" value={s ? formatINR(s.collected) : '…'} hint={s ? `${s.paid} fully paid` : undefined} icon={Banknote} tone="success" />
        <StatCard label="Outstanding" value={s ? formatINR(s.outstanding) : '…'} icon={Receipt} tone="warning" />
        <StatCard label="Overdue invoices" value={s ? s.overdue : '…'} icon={Receipt} tone="danger" />
      </div>
      <InvoiceTable filters={{ status, from: `${month}-01`, to: monthEnd(month) }} />
      <AdvanceModal open={advance} onClose={() => setAdvance(false)} />
    </>
  )
}

export function Invoices() {
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [custom, setCustom] = useState(false)
  const gen = useGenerate()
  return (
    <>
      <PageHeader title="Invoices" description="Every invoice, with its status and balance."
        actions={<><Button variant="secondary" onClick={() => setCustom(true)}><FilePlus2 className="h-4 w-4" />Custom invoice</Button><Button onClick={() => gen.mutate()} loading={gen.isPending}><RefreshCw className="h-4 w-4" />Generate invoices</Button></>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>{['pending', 'partially_paid', 'paid', 'overdue', 'waived', 'refunded'].map((x) => <option key={x} value={x}>{humanize(x)}</option>)}
        </Select>
        <Input type="date" aria-label="Due from" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="Due to" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <InvoiceTable filters={{ status, from, to }} />
      <ManualInvoiceModal open={custom} onClose={() => setCustom(false)} />
    </>
  )
}
