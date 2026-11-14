import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { loginSchema, registerSchema, resetSchema } from '@/lib/schemas'
import type { z } from 'zod'
import { Button, Card, Field, Input, Logo } from '@/components/ui'
import { safeRedirect } from '@/lib/utils'
import { homePath, useAuth } from '@/auth/AuthProvider'

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy p-10 text-white lg:flex">
        <Link to="/"><Logo light /></Link>
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Every property, tenant and rupee in one place.</h2>
          <p className="mt-3 max-w-md text-white/70">Manage units, tenancies and rent with a secure, role-based platform built for owners and their tenants.</p>
        </div>
        <p className="text-sm text-white/50">© {new Date().getFullYear()} RENTMASTER</p>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 inline-block lg:hidden"><Logo /></Link>
          <Card className="p-5 sm:p-7">
            <h1 className="text-xl font-semibold text-ink">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
            <div className="mt-5">{children}</div>
          </Card>
          {footer && <div className="mt-4 text-center text-sm text-ink-soft">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

function FormError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">{message}</p> : null
}

function VerifyCode({ email, onVerified }: { email: string; onVerified: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError(null); setNote(null)
    const token = code.replace(/\s/g, '')
    if (!/^\d{6,10}$/.test(token)) { setError('Enter the numeric code from your email.'); return }
    setBusy(true)
    const { error: e } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })
    setBusy(false)
    if (e) { setError('That code is wrong or has expired. Check it, or request a new one.'); return }
    onVerified()
  }
  const resend = async () => {
    setError(null); setNote(null)
    const { error: e } = await supabase.auth.resend({ type: 'signup', email })
    if (e) setError(e.status === 429 ? 'Please wait a minute before asking for another code.' : errMsg(e))
    else setNote('A new code has been sent.')
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex flex-col items-center text-center">
        <MailCheck className="h-10 w-10 text-success" aria-hidden />
        <p className="mt-3 text-sm text-ink-soft">We sent a verification code to <strong>{email}</strong>. Enter it below to confirm your email.</p>
      </div>
      <FormError message={error} />
      {note && <p role="status" className="rounded-lg bg-success-50 px-3 py-2 text-sm text-ink">{note}</p>}
      <Field label="Verification code">
        <Input value={code} onChange={(ev) => setCode(ev.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={10}
          className="text-center text-xl tracking-[0.4em]" placeholder="------" aria-label="Verification code" />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>Verify and continue</Button>
      <button type="button" onClick={resend} className="w-full text-center text-sm font-medium text-brand hover:underline">Send a new code</button>
    </form>
  )
}

export function LoginPage() {
  const { session, role, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) })

  if (!loading && session && role) return <Navigate to={homePath(role)} replace />

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
    if (e) {
      // Same message for unknown email and wrong password so accounts cannot be enumerated.
      if (e.message.toLowerCase().includes('email not confirmed')) {
        await supabase.auth.resend({ type: 'signup', email: v.email })
        setVerifyEmail(v.email)
        return
      }
      setError('Incorrect email or password.')
      return
    }
    const from = (location.state as { from?: string } | null)?.from
    navigate(safeRedirect(from), { replace: true })
  })

  if (verifyEmail) {
    return (
      <AuthLayout title="Confirm your email" footer={<button type="button" onClick={() => setVerifyEmail(null)} className="font-medium text-brand hover:underline">Back to sign in</button>}>
        <VerifyCode email={verifyEmail} onVerified={() => navigate('/app', { replace: true })} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to RENTMASTER." footer={<>New here? <Link to="/register" className="font-medium text-brand hover:underline">Create an account</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} /></Field>
        <div className="text-right"><Link to="/forgot-password" className="text-sm font-medium text-brand hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
      </form>
    </AuthLayout>
  )
}

export function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const navigate = useNavigate()
  const info = useQuery({ queryKey: ['public-info'], retry: false, queryFn: async () => { const { data, error: e } = await supabase.rpc('public_platform_info'); if (e) throw e; return data as { signups_enabled: boolean; support_email: string } } })
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { data, error: e } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.full_name, phone: v.phone || null } },
    })
    if (e) { setError(errMsg(e)); return }
    if (data.session) { navigate('/app', { replace: true }); return }
    setDone(v.email)
  })

  if (done) {
    return (
      <AuthLayout title="Confirm your email" footer={<Link to="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>}>
        <VerifyCode email={done} onVerified={() => navigate('/app', { replace: true })} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Property owners register here. Tenants: register with the email address your owner added." footer={<>Already have an account? <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {info.data?.signups_enabled === false && <p role="status" className="rounded-lg bg-warning-50 p-3 text-sm text-ink">New owner registrations are currently closed. If your owner has invited you as a tenant, register with that email address and continue.{info.data.support_email ? ` Questions: ${info.data.support_email}.` : ''}</p>}
        <FormError message={error} />
        <Field label="Full name" error={errors.full_name?.message}><Input autoComplete="name" invalid={!!errors.full_name} {...register('full_name')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} /></Field>
        <Field label="Mobile number (optional)" error={errors.phone?.message}><Input type="tel" autoComplete="tel" inputMode="tel" invalid={!!errors.phone} {...register('phone')} /></Field>
        <Field label="Password" hint="At least 8 characters with a letter and a number." error={errors.password?.message}><Input type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
        <Field label="Confirm password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} /></Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
        <p className="text-center text-xs text-ink-mute">By continuing you agree to the <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.</p>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>({ resolver: zodResolver(loginSchema.pick({ email: true })) })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.resetPasswordForEmail(v.email, { redirectTo: `${window.location.origin}/reset-password` })
    if (e && e.status !== 400) { setError(errMsg(e)); return }
    setSent(true) // always show the same result so accounts cannot be enumerated
  })

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we will send you a reset link." footer={<Link to="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>}>
      {sent ? (
        <p className="text-sm text-ink-soft">If an account exists for that email, a reset link is on its way. The link expires, so use it soon.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} /></Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) })

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    const { error: e } = await supabase.auth.updateUser({ password: v.password })
    if (e) { setError(errMsg(e)); return }
    setOk(true)
  })

  return (
    <AuthLayout title="Choose a new password" footer={<Link to="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>}>
      {ok ? (
        <p className="text-sm text-success">Your password was updated. You can now <Link to="/app" className="font-medium underline">continue</Link>.</p>
      ) : !loading && !session ? (
        <p className="text-sm text-ink-soft">This reset link is invalid or has expired. <Link to="/forgot-password" className="font-medium text-brand underline">Request a new one</Link>.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormError message={error} />
          <Field label="New password" hint="At least 8 characters with a letter and a number." error={errors.password?.message}><Input type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
          <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} /></Field>
          <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  )
}
