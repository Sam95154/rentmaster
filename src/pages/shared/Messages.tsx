import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, MessageSquare, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { messageSchema } from '@/lib/schemas'
import { cn, formatDate } from '@/lib/utils'
import type { MessageRow, MessageThread } from '@/lib/types'

const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function Conversation({ partner, role, onBack }: { partner: MessageThread; role: 'owner' | 'tenant'; onBack: () => void }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const endRef = useRef<HTMLDivElement>(null)
  const msgs = useQuery({
    queryKey: ['messages', partner.partner_id], refetchInterval: 10000,
    queryFn: async () => {
      let q = supabase.from('messages').select('*').or(`sender_id.eq.${partner.partner_id},recipient_id.eq.${partner.partner_id}`)
      q = role === 'owner' ? q.eq('owner_id', user!.id) : q.eq('owner_id', partner.partner_id)
      const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return ((data ?? []) as MessageRow[]).reverse()
    },
  })
  // Opening a thread marks what the other person sent as read.
  useEffect(() => {
    if (!msgs.data?.some((m) => m.recipient_id === user?.id && !m.read_at)) return
    void supabase.rpc('mark_thread_read', { p_partner: partner.partner_id }).then(() => { void qc.invalidateQueries({ queryKey: ['threads'] }); void qc.invalidateQueries({ queryKey: ['notifications'] }) })
  }, [msgs.data, partner.partner_id, user?.id, qc])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.data?.length])

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{ body: string }>({ resolver: zodResolver(messageSchema) })
  const send = useMutation({
    mutationFn: async (v: { body: string }) => { const { error } = await supabase.rpc('send_message', { p_partner: partner.partner_id, p_body: v.body }); if (error) throw error },
    onSuccess: () => { reset({ body: '' }); void qc.invalidateQueries({ queryKey: ['messages', partner.partner_id] }); void qc.invalidateQueries({ queryKey: ['threads'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button className="rounded-lg p-1.5 text-ink-soft hover:bg-surface lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button>
        <div><p className="font-semibold text-ink">{partner.name}</p><p className="text-xs text-ink-mute">{role === 'owner' ? 'Tenant' : 'Owner'}</p></div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.isLoading ? <SkeletonRows rows={3} /> : msgs.isError ? <ErrorState message={errMsg(msgs.error)} onRetry={() => void msgs.refetch()} /> : msgs.data?.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-mute">No messages yet. Say hello.</p>
        ) : msgs.data?.map((m) => {
          const mine = m.sender_id === user?.id
          return <div key={m.id} className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'ml-auto bg-brand text-white' : 'bg-surface text-ink')}>
            {m.subject && <p className="mb-0.5 font-semibold">{m.subject}</p>}<p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className={cn('mt-1 text-[11px]', mine ? 'text-white/70' : 'text-ink-mute')}>{time(m.created_at)}</p></div>
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit((v) => send.mutate(v))} className="flex gap-2 border-t border-line p-3" noValidate>
        <Input aria-label="Message" placeholder="Write a message…" autoComplete="off" invalid={!!errors.body} {...register('body')} />
        <Button type="submit" loading={send.isPending} aria-label="Send message"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  )
}

export default function MessagesPage({ role }: { role: 'owner' | 'tenant' }) {
  const [sel, setSel] = useState<string | null>(null)
  const threads = useQuery({ queryKey: ['threads'], refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.rpc('message_threads'); if (error) throw error; return (data ?? []) as MessageThread[] } })
  const list = threads.data ?? []
  // A single partner (the usual tenant case) opens straight away on wide screens.
  useEffect(() => { if (!sel && list.length === 1 && window.matchMedia('(min-width: 1024px)').matches) setSel(list[0].partner_id) }, [list, sel])
  const current = list.find((t) => t.partner_id === sel) ?? null

  return (
    <>
      <PageHeader title="Messages" description={role === 'owner' ? 'Talk to tenants who have an account.' : 'Message your owner.'} />
      {threads.isLoading ? <Card><SkeletonRows /></Card> : threads.isError ? <ErrorState message={errMsg(threads.error)} onRetry={() => void threads.refetch()} /> : list.length === 0 ? (
        <Card><EmptyState icon={MessageSquare} title="No one to message yet" description={role === 'owner' ? 'Tenants appear here once they have signed up with the email you invited.' : 'You will be able to message your owner once a tenancy is set up.'} /></Card>
      ) : (
        <Card className="overflow-hidden"><div className="grid h-[calc(100vh-16rem)] min-h-[420px] lg:grid-cols-[300px_1fr]">
          <ul className={cn('divide-y divide-line overflow-y-auto border-line lg:border-r', current && 'hidden lg:block')}>
            {list.map((t) => (
              <li key={t.partner_id}><button onClick={() => setSel(t.partner_id)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface', t.partner_id === sel && 'bg-brand/5')}>
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">{t.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate font-medium text-ink">{t.name}</span>{t.last_at && <span className="shrink-0 text-[11px] text-ink-mute">{formatDate(t.last_at)}</span>}</span>
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm text-ink-soft">{t.last_body ?? 'No messages yet'}</span>{t.unread > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white" aria-label={`${t.unread} unread`}>{t.unread}</span>}</span></span>
              </button></li>
            ))}
          </ul>
          <div className={cn('min-h-0', !current && 'hidden lg:flex lg:items-center lg:justify-center')}>
            {current ? <Conversation key={current.partner_id} partner={current} role={role} onBack={() => setSel(null)} /> : <p className="text-sm text-ink-mute">Select a conversation</p>}
          </div>
        </div></Card>
      )}
    </>
  )
}
