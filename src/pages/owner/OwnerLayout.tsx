import { AppShell } from '@/components/AppShell'
import { OWNER_NAV } from '@/lib/nav'

export default function OwnerLayout() {
  return <AppShell nav={OWNER_NAV} base="/owner" kind="owner" search />
}
