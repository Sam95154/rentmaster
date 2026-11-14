import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { LifeBuoy, Plus, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth, homePath } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, Textarea } from '@/components/ui'
import { FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { commentSchema, TICKET_CATEGORIES, ticketSchema, type TicketForm } from '@/lib/schemas'
import { formatDate, humanize } from '@/lib/utils'
import type { TicketReply, TicketRow } from '@/lib/types'

const PAGE = 10
export const ticketTone = (s: string) => (s === 'resolved' || s === 'closed' ? 'success' : s === 'in_progress' ? 'info' : 'warning') as 'success' | 'info' | 'warning'

/** Target of notification links such as /support: send the person to their own panel's support page. */
export function SupportRedirect() {
  const { role, loading } = useAuth()
  if (loading) return null
  return <Navigate to={role === 'owner' || role === 'tenant' ? `${homePath(role)}/support` : role === 'super_admin' ? '/admin/complaints' : '/login'} replace />
}

export function TicketModal({ ticket, admin, onClose, children }: { ticket: TicketRow | null; admin?: boolean; onClose: () => void; children?: React.ReactNode }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const id = ticket?.id
  const replies = useQuery({ enabled: !!id, queryKey: ['ticket-replies', id], refetchInterval: 20000, queryFn: async () => {
    const { data, error } = await supabase.from('support_replies').select('*').eq('ticket_id', id!).order('created_at'); if (error) throw error; return (data ?? []) as TicketReply[] } })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ body: string }>({ resolver: zodResolver(commentSchema) })
  const send = useMutation({
    mutationFn: async (v: { body: string }) => { const { error } = await supabase.rpc('reply_ticket', { p_ticket: id!, p_body: v.body }); if (error) throw error },
    onSuccess: () => { reset({ body: '' }); void qc.invalidateQueries() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={!!ticket} onClose={onClose} size="lg" title={ticket?.subject ?? 'Ticket'} description={ticket ? `${humanize(ticket.category)} · opened ${formatDate(ticket.created_at)}${ticket.requester_name ? ` by ${ticket.requester_name}` : ''}` : undefined}>
      {ticket && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><Badge tone={ticketTone(ticket.status)}>{humanize(ticket.status)}</Badge></div>
          <p className="whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-ink">{ticket.body}</p>
          {children}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Replies</h3>
            {replies.isLoading ? <SkeletonRows rows={2} /> : replies.data?.length === 0 ? <p className="text-sm text-ink-mute">No replies yet.</p> : (
              <ul className="space-y-2">{replies.data?.map((r) => { const mine = r.author_id === user?.id
                return <li key={r.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mine ? 'ml-auto bg-brand/10' : 'bg-surface'}`}><p className="mb-0.5 text-xs text-ink-mute">{mine ? 'You' : admin ? (ticket.requester_name ?? 'User') : 'Support'} · {formatDate(r.created_at)}</p><p className="whitespace-pre-wrap">{r.body}</p></li> })}</ul>
            )}
            {ticket.status === 'closed' ? <p className="mt-3 text-sm text-ink-mute">This ticket is closed.</p> : (
              <form onSubmit={handleSubmit((v) => send.mutate(v))} className="mt-3 flex gap-2" noValidate>
                <Input aria-label="Reply" placeholder="Write a reply…" invalid={!!errors.body} {...register('body')} />
                <Button type="submit" loading={send.isPending} aria-label="Send reply"><Send className="h-4 w-4" /></Button>
              </form>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function NewTicketModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast(); const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TicketForm>({ resolver: zodResolver(ticketSchema), defaultValues: { subject: '', category: 'other', body: '' } })
  const m = useMutation({
    mutationFn: async (v: TicketForm) => { const { error } = await supabase.rpc('create_ticket', { p_subject: v.subject, p_body: v.body, p_category: v.category }); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-tickets'] }); toast.success('Ticket sent. We will reply here.'); reset(); onClose() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Contact support" description="Tell us what went wrong. Please do not include passwords or card numbers.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4">
          <Field label="Subject" error={errors.subject?.message}><Input invalid={!!errors.subject} {...register('subject')} /></Field>
          <Field label="Category"><Select {...register('category')}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
          <Field label="Details" error={errors.body?.message}><Textarea rows={5} invalid={!!errors.body} {...register('body')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel="Send ticket" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export default function SupportPage() {
  const [page, setPage] = useState(1); const [open, setOpen] = useState(false); const [sel, setSel] = useState<TicketRow | null>(null)
  const info = useQuery({ queryKey: ['platform-info'], queryFn: async () => { const { data, error } = await supabase.rpc('public_platform_info'); if (error) throw error; return data as { support_email: string; support_phone: string } } })
  const list = useQuery({ queryKey: ['my-tickets', page], placeholderData: keepPreviousData, queryFn: async () => {
    const { data, error, count } = await supabase.from('support_tickets').select('*', { count: 'exact' }).order('updated_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as TicketRow[], total: count ?? 0 } } })
  return (
    <>
      <PageHeader title="Support" description="Report a problem or ask for help." actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New ticket</Button>} />
      {(info.data?.support_email || info.data?.support_phone) && <p className="mb-4 text-sm text-ink-soft">You can also reach us at {[info.data.support_email, info.data.support_phone].filter(Boolean).join(' · ')}.</p>}
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="No tickets" description="If something is not working, send us a ticket." />
        ) : (<>
          <ul className="divide-y divide-line">{list.data?.rows.map((t) => (
            <li key={t.id}><button className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface" onClick={() => setSel(t)}>
              <div className="min-w-0"><p className="truncate font-medium text-ink">{t.subject}</p><p className="text-xs text-ink-mute">{humanize(t.category)} · updated {formatDate(t.updated_at)}</p></div><Badge tone={ticketTone(t.status)}>{humanize(t.status)}</Badge></button></li>))}</ul>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
      <NewTicketModal open={open} onClose={() => setOpen(false)} />
      <TicketModal ticket={sel} onClose={() => setSel(null)} />
    </>
  )
}
