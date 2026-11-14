import { AppShell } from '@/components/AppShell'
import { ADMIN_NAV } from '@/lib/nav'

export default function AdminLayout() {
  return <AppShell nav={ADMIN_NAV} base="/admin" kind="admin" />
}
