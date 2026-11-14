import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppRole, UserRow } from '@/lib/types'

interface AuthCtx {
  loading: boolean
  session: Session | null
  user: UserRow | null
  role: AppRole | null
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

const PRIORITY: AppRole[] = ['super_admin', 'owner', 'tenant']
export const homePath = (role: AppRole | null) => (role === 'super_admin' ? '/admin' : role === 'owner' ? '/owner' : role === 'tenant' ? '/tenant' : '/login')

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initialised, setInitialised] = useState(false)
  const [user, setUser] = useState<UserRow | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setInitialised(true) })
    // Only store the session here; fetching happens in an effect to avoid deadlocking the auth client.
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id ?? null

  const load = useCallback(async () => {
    if (!uid) { setUser(null); setRoles([]); setLoadedFor(null); return }
    const [u, r] = await Promise.all([
      supabase.from('users').select('id,email,full_name,phone,status').eq('id', uid).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', uid),
    ])
    setUser((u.data as UserRow | null) ?? null)
    setRoles(((r.data ?? []) as { role: AppRole }[]).map((x) => x.role))
    setLoadedFor(uid)
  }, [uid])

  useEffect(() => { void load() }, [load])

  const role = useMemo<AppRole | null>(() => PRIORITY.find((p) => roles.includes(p)) ?? null, [roles])

  const value = useMemo<AuthCtx>(() => ({
    loading: !initialised || (uid !== null && loadedFor !== uid),
    session,
    user,
    role,
    signOut: async () => { await supabase.auth.signOut() },
    refreshProfile: load,
  }), [initialised, uid, loadedFor, session, user, role, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth must be used inside AuthProvider')
  return c
}
