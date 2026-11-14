import { useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { ALL_NAV } from '@/lib/nav'

const PHASES: Record<number, string> = {
  3: 'Phase 3 — Financial management',
  4: 'Phase 4 — Tenant experience',
  5: 'Phase 5 — Communication and automation',
  6: 'Phase 6 — Super Admin',
}

/** Honest placeholder: these modules are not built yet, so no fake data or fake actions are shown. */
export default function ComingSoon() {
  const { pathname } = useLocation()
  const item = ALL_NAV.find((n) => n.to === pathname)
  const title = item?.label ?? 'This page'
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <EmptyState
          icon={Hammer}
          title="Not built yet"
          description={`${item?.soon?.blurb ?? ''} ${item?.soon ? `Planned for ${PHASES[item.soon.phase] ?? 'a later phase'}.` : 'This page does not exist.'}`.trim()}
        />
      </Card>
    </>
  )
}
