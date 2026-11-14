import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, SkeletonRows, Textarea } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { platformAnnouncementSchema, type PlatformAnnouncementForm } from '@/lib/schemas'
import { formatDate, humanize } from '@/lib/utils'
import type { AnnouncementRow } from '@/lib/types'

export default function AdminAnnouncements() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const [open, setOpen] = useState(false); const [del, setDel] = useState<AnnouncementRow | null>(null)
  const list = useQuery({ queryKey: ['admin-announcements'], queryFn: async () => {
    const { data, error } = await supabase.from('announcements').select('*').is('owner_id', null).is('deleted_at', null).order('created_at', { ascending: false }).limit(50)
    if (error) throw error; return (data ?? []) as AnnouncementRow[] } })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PlatformAnnouncementForm>({ resolver: zodResolver(platformAnnouncementSchema), defaultValues: { title: '', body: '', audience: 'all' } })
  const post = useMutation({
    mutationFn: async (v: PlatformAnnouncementForm) => { const { error } = await supabase.from('announcements').insert({ author_id: user!.id, owner_id: null, title: v.title, body: v.body, audience: v.audience }); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-announcements'] }); toast.success('Announcement sent.'); reset(); setOpen(false) }, onError: (e) => toast.error(errMsg(e)),
  })
  const remove = useMutation({
    mutationFn: async (a: AnnouncementRow) => { const { error } = await supabase.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', a.id); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-announcements'] }); toast.success('Announcement removed.'); setDel(null) }, onError: (e) => { toast.error(errMsg(e)); setDel(null) },
  })
  return (
    <>
      <PageHeader title="Announcements" description="Platform-wide notices to owners, tenants or everyone." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New announcement</Button>} />
      {list.isLoading ? <Card><SkeletonRows /></Card> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : !list.data?.length ? (
        <Card><EmptyState icon={Megaphone} title="No platform announcements" description="Use this for maintenance windows, new features or policy changes." /></Card>
      ) : (
        <div className="space-y-3">{list.data.map((a) => (
          <Card key={a.id}><article className="p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-ink">{a.title}</h2><p className="text-xs text-ink-mute">{formatDate(a.created_at)}</p></div>
              <div className="flex items-center gap-2"><Badge tone="info">{humanize(a.audience)}</Badge><Button size="sm" variant="ghost" aria-label={`Remove ${a.title}`} onClick={() => setDel(a)}><Trash2 className="h-4 w-4" /></Button></div></div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{a.body}</p>
          </article></Card>))}</div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} size="lg" title="New platform announcement">
        <form onSubmit={handleSubmit((v) => post.mutate(v))} noValidate>
          <div className="grid gap-4">
            <Field label="Send to"><Select {...register('audience')}><option value="all">Owners and tenants</option><option value="owners">Owners only</option><option value="tenants">Tenants only</option></Select></Field>
            <Field label="Title" error={errors.title?.message}><Input invalid={!!errors.title} {...register('title')} /></Field>
            <Field label="Message" error={errors.body?.message}><Textarea rows={5} invalid={!!errors.body} {...register('body')} /></Field>
          </div>
          <FormActions onCancel={() => setOpen(false)} submitLabel="Send" loading={post.isPending} />
        </form>
      </Modal>
      <ConfirmDialog open={!!del} danger confirmLabel="Remove" title="Remove announcement?" loading={remove.isPending} message={<>“{del?.title}” will no longer be shown. Notifications already sent stay in inboxes.</>} onConfirm={() => del && remove.mutate(del)} onCancel={() => setDel(null)} />
    </>
  )
}
