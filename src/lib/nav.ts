import {
  Banknote, BarChart3, Bell, Building2, ClipboardList, CreditCard, DoorOpen, FileSignature, FolderOpen, Home, LayoutDashboard,
  LifeBuoy, Megaphone, MessageSquare, Receipt, ScrollText, Settings, Shield, ShieldCheck, UserCircle, Users, Wallet, Wrench, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  soon?: { phase: number; blurb: string }
}

export const OWNER_NAV: NavItem[] = [
  { to: '/owner', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/owner/properties', label: 'My Properties', icon: Building2 },
  { to: '/owner/units', label: 'Rental Units', icon: DoorOpen },
  { to: '/owner/tenants', label: 'Tenants', icon: Users },
  { to: '/owner/rent', label: 'Rent Collection', icon: Banknote },
  { to: '/owner/invoices', label: 'Invoices', icon: Receipt },
  { to: '/owner/payments', label: 'Payment History', icon: CreditCard },
  { to: '/owner/deposits', label: 'Security Deposits', icon: ShieldCheck },
  { to: '/owner/expenses', label: 'Expenses', icon: Wallet },
  { to: '/owner/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/owner/agreements', label: 'Rental Agreements', icon: FileSignature, soon: { phase: 3, blurb: 'Agreement records, expiry tracking and renewal reminders.' } },
  { to: '/owner/documents', label: 'Documents', icon: FolderOpen },
  { to: '/owner/reports', label: 'Reports', icon: BarChart3 },
  { to: '/owner/messages', label: 'Messages', icon: MessageSquare },
  { to: '/owner/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/owner/notifications', label: 'Notifications', icon: Bell },
  { to: '/owner/support', label: 'Support', icon: LifeBuoy },
  { to: '/owner/settings', label: 'Settings', icon: Settings },
]

export const TENANT_NAV: NavItem[] = [
  { to: '/tenant', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/tenant/property', label: 'My Property', icon: Home },
  { to: '/tenant/profile', label: 'My Profile', icon: UserCircle },
  { to: '/tenant/rent', label: 'My Rent', icon: Receipt },
  { to: '/tenant/pay', label: 'Pay Rent', icon: CreditCard },
  { to: '/tenant/payments', label: 'Payment History', icon: ScrollText },
  { to: '/tenant/deposit', label: 'Security Deposit', icon: ShieldCheck },
  { to: '/tenant/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/tenant/documents', label: 'Documents', icon: FolderOpen },
  { to: '/tenant/messages', label: 'Messages', icon: MessageSquare },
  { to: '/tenant/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/tenant/notifications', label: 'Notifications', icon: Bell },
  { to: '/tenant/support', label: 'Support', icon: LifeBuoy },
  { to: '/tenant/settings', label: 'Settings', icon: Settings },
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/owners', label: 'Owners', icon: Users },
  { to: '/admin/tenants', label: 'Tenants', icon: UserCircle },
  { to: '/admin/properties', label: 'Properties', icon: Building2 },
  { to: '/admin/transactions', label: 'Transactions', icon: CreditCard },
  { to: '/admin/complaints', label: 'Complaints', icon: LifeBuoy },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/audit', label: 'Audit Logs', icon: ClipboardList },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: Wallet },
  { to: '/admin/platform', label: 'Platform Settings', icon: Shield },
  { to: '/admin/settings', label: 'My Account', icon: Settings },
]

export const ALL_NAV = [...OWNER_NAV, ...TENANT_NAV, ...ADMIN_NAV]
