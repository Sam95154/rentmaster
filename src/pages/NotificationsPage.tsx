import { Bell } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui'
import { useMarkRead, useNotifications } from '@/components/NotificationBell'
import { cn, formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

export default function NotificationsPage() {
  const { unread, recent } = useNotifications(50)
  const mark = useMarkRead()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        actions={<Button variant="secondary" disabled={unread === 0} loading={mark.isPending} onClick={() => mark.mutate(undefined)}>Mark all as read</Button>}
      />
      <Card>
        {recent.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" description="Updates about your tenancy, rent and requests will show up here in real time." />
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => { if (!n.read_at) mark.mutate([n.id]); if (n.link) navigate(n.link) }}
                  className={cn('flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-surface sm:px-5', !n.read_at && 'bg-brand-50/40')}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-ink">{n.title}</span>{!n.read_at && <Badge tone="info">New</Badge>}</span>
                    {n.body && <span className="mt-0.5 block text-sm text-ink-soft">{n.body}</span>}
                    <span className="mt-1 block text-xs text-ink-mute">{formatDate(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
