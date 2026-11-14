import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { homePath, useAuth } from './AuthProvider'
import { Button, EmptyState, Spinner } from '@/components/ui'
import type { AppRole } from '@/lib/types'

export function FullPageSpinner() {
  return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-8 w-8" /></div>
}

export function ProtectedRoute({ role, children }: { role: AppRole; children: ReactNode }) {
  const { loading, session, user, role: myRole, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <EmptyState icon={ShieldOff} title="Account not ready" description="We could not load your profile. Please sign out and sign in again." action={<Button onClick={() => void signOut()}>Sign out</Button>} />
      </div>
    )
  }
  if (user.status === 'suspended') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <EmptyState icon={ShieldOff} title="Account suspended" description="Your account has been suspended. Please contact support if you think this is a mistake." action={<Button onClick={() => void signOut()}>Sign out</Button>} />
      </div>
    )
  }
  if (myRole !== role) return <Navigate to={homePath(myRole)} replace />
  return <>{children}</>
}

export function RoleRedirect() {
  const { loading, session, role } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={homePath(role)} replace />
}
