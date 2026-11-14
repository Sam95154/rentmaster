import { AppShell } from '@/components/AppShell'
import { TENANT_NAV } from '@/lib/nav'

export default function TenantLayout() {
  return <AppShell nav={TENANT_NAV} base="/tenant" kind="tenant" />
}
