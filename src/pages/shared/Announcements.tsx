import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, Textarea } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { announcementSchema, type AnnouncementForm } from '@/lib/schemas'
import { formatDate } from '@/lib/utils'
import type { AnnouncementRow } from '@/lib/types'

const PAGE = 10

function Compose({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const props = useQuery({ enabled: open, queryKey: ['prop-options'], queryFn: async () => {
    const { data, error } = await supabase.from('properties').select('id, name').is('deleted_at', null).order('name'); if (error) throw error; return data ?? [] } })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<AnnouncementForm>({ resolver: zodResolver(announcementSchema) })
  useEffect(() => { if (open) reset({ title: '', body: '', property_id: '' }) }, [open, reset])
  const m = useMutation({
    mutationFn: async (v: AnnouncementForm) => {
      const { error } = await supabase.from('announcements').insert({ author_id: user!.id, owner_id: user!.id, title: v.title, body: v.body, property_id: v.property_id || null, audience: 'tenants' })
      if (error) throw error
    }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Announcement sent. Tenants have been notified.'); onClose() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={open} onClose={onClose} size="lg" title="New announcement" description="Sent to your tenants as a notification and shown on their Announcements page. It cannot be edited into a different audience afterwards.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4">
          <Field label="Send to"><Select {...register('property_id')}><option value="">All my tenants</option>{props.data?.map((p) => <option key={p.id} value={p.id}>Tenants of {p.name}</option>)}</Select></Field>
          <Field label="Title" error={errors.title?.message}><Input invalid={!!errors.title} {...register('title')} /></Field>
          <Field label="Announcement" error={errors.body?.message}><Textarea rows={5} invalid={!!errors.body} {...register('body')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Send announcement" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export default function AnnouncementsPage({ role }: { role: 'owner' | 'tenant' }) {
  const toast = useToast(); const qc = useQueryClient()
  const [page, setPage] = useState(1); const [open, setOpen] = useState(false); const [del, setDel] = useState<AnnouncementRow | null>(null)
  const list = useQuery({ queryKey: ['announcements', role, page], placeholderData: keepPreviousData, queryFn: async () => {
    const { data, error, count } = await supabase.from('announcements').select('*', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as AnnouncementRow[], total: count ?? 0 } } })
  const remove = useMutation({
    mutationFn: async (a: AnnouncementRow) => { const { error } = await supabase.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', a.id); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['announcements'] }); toast.success('Announcement removed.'); setDel(null) }, onError: (e) => { toast.error(errMsg(e)); setDel(null) },
  })
  return (
    <>
      <PageHeader title="Announcements" description={role === 'owner' ? 'Notices for all your tenants, or the tenants of one property.' : 'Notices from your owner.'}
        actions={role === 'owner' ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New announcement</Button> : undefined} />
      {list.isLoading ? <Card><SkeletonRows /></Card> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
        <Card><EmptyState icon={Megaphone} title="No announcements" description={role === 'owner' ? 'Post a notice about maintenance, water cuts or rule changes.' : 'Nothing has been announced yet.'} /></Card>
      ) : (<>
        <div className="space-y-3">{list.data?.rows.map((a) => (
          <Card key={a.id}><article className="p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-ink">{a.title}</h2><p className="text-xs text-ink-mute">{a.owner_id === null ? 'From RentMaster · ' : ''}{formatDate(a.created_at)}</p></div>
              {role === 'owner' && a.owner_id !== null && <Button size="sm" variant="ghost" aria-label={`Remove ${a.title}`} onClick={() => setDel(a)}><Trash2 className="h-4 w-4" /></Button>}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{a.body}</p>
          </article></Card>))}</div>
        <Card className="mt-3"><Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} /></Card>
      </>)}
      {role === 'owner' && <Compose open={open} onClose={() => setOpen(false)} />}
      <ConfirmDialog open={!!del} danger confirmLabel="Remove" title="Remove announcement?" loading={remove.isPending} message={<>“{del?.title}” will disappear for your tenants. Notifications already sent stay in their inbox.</>} onConfirm={() => del && remove.mutate(del)} onCancel={() => setDel(null)} />
    </>
  )
}
