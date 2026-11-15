import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Logo } from './ui'
import { NotificationBell } from './NotificationBell'
import { GlobalSearch } from './GlobalSearch'
import type { NavItem } from '@/lib/nav'
import { cn, humanize, initials, isUuid } from '@/lib/utils'

const ROLE_LABEL = { owner: 'Property Owner', tenant: 'Tenant', admin: 'Super Admin' } as const

function readCollapsed(): boolean {
  try { return localStorage.getItem('rm-sidebar') === '1' } catch { return false }
}

function NavList({ nav, collapsed, onNavigate }: { nav: NavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) => cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
            isActive ? 'bg-brand text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
            collapsed && 'justify-center px-2',
          )}
        >
          <item.icon className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {!collapsed && item.soon && <span className="ml-auto rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">Soon</span>}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell({ nav, base, kind, search }: { nav: NavItem[]; base: string; kind: keyof typeof ROLE_LABEL; search?: boolean }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => { setDrawer(false); setMenu(false) }, [location.pathname])
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('rm-sidebar', c ? '0' : '1') } catch { /* storage unavailable */ }
      return !c
    })
  }

  const crumbs = useMemo(() => {
    const segs = location.pathname.split('/').filter(Boolean)
    const out: { to: string; label: string }[] = []
    let path = ''
    segs.forEach((s, i) => {
      path += `/${s}`
      if (i === 0) { out.push({ to: base, label: 'Home' }); return }
      const hit = nav.find((n) => n.to === path)
      out.push({ to: path, label: hit?.label ?? (isUuid(s) ? 'Details' : humanize(s)) })
    })
    return out
  }, [location.pathname, nav, base])

  const bottom = nav.filter((n) => !n.soon).slice(0, 4)
  const name = user?.full_name || user?.email || ''

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>

      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col print:!hidden bg-gradient-to-b from-navy to-navy-700 transition-[width] duration-200 lg:flex', collapsed ? 'w-[72px]' : 'w-64')}>
        <div className={cn('flex h-16 items-center border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
          {collapsed ? <Logo light /> : <Link to={base}><Logo light /></Link>}
        </div>
        <NavList nav={nav} collapsed={collapsed} />
        <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="m-3 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white">
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <><PanelLeftClose className="h-5 w-5" /><span>Collapse</span></>}
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-navy/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-gradient-to-b from-navy to-navy-700">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <Logo light />
              <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="rounded-md p-1 text-white/70 hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <NavList nav={nav} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={cn('transition-[padding] duration-200 print:!pl-0', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 print:hidden items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg p-2 text-ink-soft hover:bg-surface lg:hidden"><Menu className="h-5 w-5" /></button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-ink-mute sm:flex">
            {crumbs.map((c, i) => (
              <span key={c.to} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                {i === crumbs.length - 1 ? <span className="truncate font-medium text-ink" aria-current="page">{c.label}</span> : <Link to={c.to} className="truncate hover:text-ink">{c.label}</Link>}
              </span>
            ))}
          </nav>
          <span className="truncate text-sm font-semibold text-ink sm:hidden">{crumbs[crumbs.length - 1]?.label}</span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {search && <GlobalSearch />}
            <NotificationBell base={base} />
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account menu" className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{initials(name)}</span>
              </button>
              {menu && (
                <>
                  <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-pop">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-semibold">{user?.full_name || 'Account'}</p>
                      <p className="truncate text-xs text-ink-mute">{user?.email}</p>
                      <p className="mt-1 text-xs font-medium text-brand">{ROLE_LABEL[kind]}</p>
                    </div>
                    <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-50"><LogOut className="h-4 w-4" />Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <PlatformNotice />
        <main id="main" className="mx-auto max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 print:hidden grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bottom.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-brand' : 'text-ink-mute')}>
            <item.icon className="h-5 w-5" aria-hidden /><span className="max-w-full truncate px-1">{item.label.replace('My ', '')}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setDrawer(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-ink-mute"><Menu className="h-5 w-5" aria-hidden />More</button>
      </nav>
    </div>
  )
}

function PlatformNotice() {
  const q = useQuery({ queryKey: ['platform-notice'], staleTime: 60000, queryFn: async () => {
    const { data } = await supabase.from('platform_settings').select('value').eq('key', 'platform_notice').maybeSingle()
    return typeof data?.value === 'string' ? data.value : ''
  } })
  if (!q.data) return null
  return <div role="status" className="print:hidden flex items-start gap-2 border-b border-info/20 bg-info-50 px-4 py-2 text-sm text-info sm:px-6"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{q.data}</span></div>
}
