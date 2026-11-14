import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, StatCard, TableWrap, Td, Th } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { downloadCsv } from '@/lib/csv'
import { expenseSchema, PAYMENT_METHODS, type ExpenseForm } from '@/lib/schemas'
import { emptyToNull, formatDate, formatINR, humanize, todayISO } from '@/lib/utils'
import type { ExpenseRow } from '@/lib/types'

const PAGE = 15
const MAX_BYTES = 5 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }
const SELECT = '*, properties(name), expense_categories(name)'

function useOptions() {
  const props = useQuery({ queryKey: ['prop-options'], queryFn: async () => {
    const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name'); if (error) throw error; return data ?? [] } })
  const cats = useQuery({ queryKey: ['expense-categories'], queryFn: async () => {
    const { data, error } = await supabase.from('expense_categories').select('id, name').order('name'); if (error) throw error; return data ?? [] } })
  return { props: props.data ?? [], cats: cats.data ?? [] }
}

function ExpenseModal({ open, onClose, expense }: { open: boolean; onClose: () => void; expense: ExpenseRow | null }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const { props, cats } = useOptions()
  const [file, setFile] = useState<File | null>(null)
  const [removeBill, setRemoveBill] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ExpenseForm>({ resolver: zodResolver(expenseSchema) })
  useEffect(() => {
    if (!open) return
    setFile(null); setRemoveBill(false)
    reset(expense ? { property_id: expense.property_id, category_id: expense.category_id ?? '', amount: expense.amount, expense_date: expense.expense_date, description: expense.description ?? '', payment_method: expense.payment_method ?? '' }
      : { property_id: '', category_id: '', amount: undefined as unknown as number, expense_date: todayISO(), description: '', payment_method: '' })
  }, [open, expense, reset])

  const pick = (f: File | undefined) => {
    if (!f) return setFile(null)
    if (!TYPES[f.type]) { toast.error('Upload a JPG, PNG, WebP or PDF file.'); if (fileRef.current) fileRef.current.value = ''; return }
    if (f.size > MAX_BYTES) { toast.error('The file is larger than 5 MB.'); if (fileRef.current) fileRef.current.value = ''; return }
    setFile(f)
  }

  const m = useMutation({
    mutationFn: async (v: ExpenseForm) => {
      if (v.expense_date > todayISO()) throw new Error('Expense date cannot be in the future.')
      let attachment_path: string | null | undefined = undefined
      if (file) {
        attachment_path = `${user!.id}/${crypto.randomUUID()}.${TYPES[file.type]}`
        const up = await supabase.storage.from('expense-bills').upload(attachment_path, file, { contentType: file.type, upsert: false })
        if (up.error) throw up.error
      } else if (removeBill) attachment_path = null
      const row = { property_id: v.property_id, category_id: emptyToNull(v.category_id), amount: v.amount, expense_date: v.expense_date, description: emptyToNull(v.description), payment_method: emptyToNull(v.payment_method) as ExpenseRow['payment_method'], ...(attachment_path !== undefined ? { attachment_path } : {}) }
      const res = expense ? await supabase.from('expenses').update(row).eq('id', expense.id) : await supabase.from('expenses').insert({ ...row, owner_id: user!.id })
      if (res.error) {
        if (file && attachment_path) await supabase.storage.from('expense-bills').remove([attachment_path]) // don't leave an orphan upload
        throw res.error
      }
      if (expense?.attachment_path && attachment_path !== undefined) await supabase.storage.from('expense-bills').remove([expense.attachment_path])
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success(expense ? 'Expense updated.' : 'Expense added.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} size="lg" title={expense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property" error={errors.property_id?.message}><Select invalid={!!errors.property_id} {...register('property_id')}><option value="">Select…</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Category"><Select {...register('category_id')}><option value="">Uncategorised</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Amount (₹)" error={errors.amount?.message}><Input type="number" step="0.01" inputMode="decimal" invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field label="Date" error={errors.expense_date?.message}><Input type="date" max={todayISO()} {...register('expense_date')} /></Field>
          <Field label="Paid by"><Select {...register('payment_method')}><option value="">—</option>{PAYMENT_METHODS.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select></Field>
          <Field label="Description" error={errors.description?.message}><Input {...register('description')} /></Field>
          <Field label="Bill or receipt (optional)" className="sm:col-span-2" hint="JPG, PNG, WebP or PDF, up to 5 MB.">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium" />
            {expense?.attachment_path && !file && <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" checked={removeBill} onChange={(e) => setRemoveBill(e.target.checked)} />Remove the current bill</label>}
          </Field>
        </div>
        <FormActions onCancel={onClose} submitLabel={expense ? 'Save changes' : 'Add expense'} loading={m.isPending} />
      </form>
    </Modal>
  )
}

export default function Expenses() {
  const { props, cats } = useOptions()
  const [page, setPage] = useState(1)
  const [f, setF] = useState({ property: '', category: '', from: '', to: '' })
  const [edit, setEdit] = useState<ExpenseRow | null>(null)
  const [open, setOpen] = useState(false)
  const [del, setDel] = useState<ExpenseRow | null>(null)
  const toast = useToast(); const qc = useQueryClient()
  const set = (k: keyof typeof f, v: string) => { setF((o) => ({ ...o, [k]: v })); setPage(1) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filt = (q: any) => { q = q.is('deleted_at', null); if (f.property) q = q.eq('property_id', f.property); if (f.category) q = q.eq('category_id', f.category); if (f.from) q = q.gte('expense_date', f.from); if (f.to) q = q.lte('expense_date', f.to); return q }

  const list = useQuery({ queryKey: ['expenses', f, page], placeholderData: keepPreviousData, queryFn: async () => {
    const { data, error, count } = await filt(supabase.from('expenses').select(SELECT, { count: 'exact' })).order('expense_date', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as ExpenseRow[], total: (count ?? 0) as number } } })
  const total = useQuery({ queryKey: ['expenses-total', f], queryFn: async () => {
    const { data, error } = await filt(supabase.from('expenses').select('amount')).limit(10000); if (error) throw error
    return ((data ?? []) as { amount: number }[]).reduce((a, r) => a + Number(r.amount), 0) } })

  const remove = useMutation({
    mutationFn: async (e: ExpenseRow) => { const { error } = await supabase.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', e.id); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Expense deleted.'); setDel(null) }, onError: (e) => { toast.error(errMsg(e)); setDel(null) },
  })
  const viewBill = async (path: string) => {
    const { data, error } = await supabase.storage.from('expense-bills').createSignedUrl(path, 120)
    if (error || !data) return toast.error('Could not open the bill.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  const exportCsv = async () => {
    const { data, error } = await filt(supabase.from('expenses').select(SELECT)).order('expense_date', { ascending: false }).limit(5000)
    if (error) return toast.error(errMsg(error))
    downloadCsv(`expenses-${todayISO()}.csv`, ['Date', 'Property', 'Category', 'Description', 'Amount', 'Paid by'], ((data ?? []) as ExpenseRow[]).map((x) => [x.expense_date, x.properties?.name, x.expense_categories?.name ?? 'Uncategorised', x.description, Number(x.amount), x.payment_method]))
  }

  return (
    <>
      <PageHeader title="Expenses" description="Repairs, taxes, utilities and other costs for your properties." actions={<Button onClick={() => { setEdit(null); setOpen(true) }}><Plus className="h-4 w-4" />Add expense</Button>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select aria-label="Property" value={f.property} onChange={(e) => set('property', e.target.value)}><option value="">All properties</option>{props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        <Select aria-label="Category" value={f.category} onChange={(e) => set('category', e.target.value)}><option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Input type="date" aria-label="From" value={f.from} onChange={(e) => set('from', e.target.value)} />
        <Input type="date" aria-label="To" value={f.to} onChange={(e) => set('to', e.target.value)} />
      </div>
      <div className="mb-4 max-w-xs"><StatCard label="Total for current filters" value={total.data === undefined ? '…' : formatINR(total.data)} icon={Wallet} tone="warning" /></div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No expenses found" description="Add an expense, or change the filters." />
        ) : (<>
          <TableWrap>
            <thead><tr><Th>Date</Th><Th>Property</Th><Th>Category</Th><Th>Description</Th><Th className="text-right">Amount</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>{list.data?.rows.map((x) => (
              <tr key={x.id}><Td>{formatDate(x.expense_date)}</Td><Td>{x.properties?.name}</Td><Td>{x.expense_categories?.name ?? 'Uncategorised'}</Td><Td className="max-w-xs truncate">{x.description ?? '—'}</Td><Td className="text-right tabular-nums">{formatINR(x.amount)}</Td>
                <Td><div className="flex justify-end gap-1">
                  {x.attachment_path && <Button size="sm" variant="ghost" aria-label="View bill" onClick={() => void viewBill(x.attachment_path!)}><ExternalLink className="h-4 w-4" /></Button>}
                  <Button size="sm" variant="ghost" aria-label="Edit expense" onClick={() => { setEdit(x); setOpen(true) }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Delete expense" onClick={() => setDel(x)}><Trash2 className="h-4 w-4" /></Button></div></Td></tr>))}</tbody>
          </TableWrap>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
      <div className="mt-3 flex justify-end"><Button variant="secondary" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" />Export CSV</Button></div>
      <ExpenseModal open={open} onClose={() => setOpen(false)} expense={edit} />
      <ConfirmDialog open={!!del} danger confirmLabel="Delete" title="Delete expense?" loading={remove.isPending} message={<>This removes the {del ? formatINR(del.amount) : ''} expense from your reports. It stays in the audit log.</>} onConfirm={() => del && remove.mutate(del)} onCancel={() => setDel(null)} />
    </>
  )
}
