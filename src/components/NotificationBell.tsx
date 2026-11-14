import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { NotificationRow } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

/** Mount ONCE (the shell's bell does). A second subscription to the same channel name throws in supabase-js. */
function useNotificationsRealtime() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const uid = user?.id
  // Realtime: any change to my notifications refreshes the lists.
  useEffect(() => {
    if (!uid) return
    const ch = supabase
      .channel(`notifications-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [uid, qc])
}

export function useNotifications(limit = 8) {
  const { user } = useAuth()
  const uid = user?.id

  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    enabled: !!uid,
    queryFn: async () => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
  const recent = useQuery({
    queryKey: ['notifications', 'recent', limit],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('id,type,title,body,link,read_at,created_at').order('created_at', { ascending: false }).limit(limit)
      if (error) throw error
      return (data ?? []) as NotificationRow[]
    },
  })
  return { unread: unread.data ?? 0, recent: recent.data ?? [] }
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
      if (ids) q = q.in('id', ids)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

export function NotificationBell({ base }: { base: string }) {
  const [open, setOpen] = useState(false)
  useNotificationsRealtime()
  const { unread, recent } = useNotifications()
  const mark = useMarkRead()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-soft hover:bg-surface">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close notifications" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-16 z-40 rounded-xl border border-line bg-white shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <button type="button" className="text-xs font-medium text-brand hover:underline disabled:opacity-50" disabled={unread === 0 || mark.isPending} onClick={() => mark.mutate(undefined)}>Mark all read</button>
            </div>
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {recent.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-mute">You are all caught up.</li>}
              {recent.map((n) => (
                <li key={n.id}>
                  <button type="button" className={cn('w-full px-4 py-3 text-left hover:bg-surface', !n.read_at && 'bg-brand-50/50')}
                    onClick={() => { if (!n.read_at) mark.mutate([n.id]); setOpen(false); if (n.link) navigate(n.link) }}>
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-ink-mute">{formatDate(n.created_at)}</p>
                  </button>
                </li>
              ))}
            </ul>
            <Link to={`${base}/notifications`} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-sm font-medium text-brand hover:bg-surface">View all</Link>
          </div>
        </>
      )}
    </div>
  )
}
