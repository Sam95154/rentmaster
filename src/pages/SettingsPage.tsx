import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toast'
import { Button, Card, CardHeader, Field, Input, PageHeader, Skeleton } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { emptyToNull, formatDate } from '@/lib/utils'
import type { MySubscription } from '@/lib/types'
import { ownerSettingsSchema, passwordSchema, profileSchema, type OwnerSettingsForm, type PasswordForm, type ProfileForm } from '@/lib/schemas'

function PasswordCard() {
  const toast = useToast()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })
  const m = useMutation({
    mutationFn: async (v: PasswordForm) => { const { error } = await supabase.auth.updateUser({ password: v.password }); if (error) throw error },
    onSuccess: () => { toast.success('Password updated.'); reset() },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Card>
      <CardHeader title="Change password" />
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5" noValidate>
        <Field label="New password" hint="At least 8 characters with a letter and a number." error={errors.password?.message}><Input type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} /></Field>
        <Field label="Confirm new password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" invalid={!!errors.confirm} {...register('confirm')} /></Field>
        <div className="sm:col-span-2 sm:text-right"><Button type="submit" loading={m.isPending} className="w-full sm:w-auto">Update password</Button></div>
      </form>
    </Card>
  )
}

function ProfileCard() {
  const { user, refreshProfile } = useAuth()
  const toast = useToast()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) })
  useEffect(() => { if (user) reset({ full_name: user.full_name, phone: user.phone ?? '' }) }, [user, reset])
  const m = useMutation({
    mutationFn: async (v: ProfileForm) => {
      const { error } = await supabase.from('users').update({ full_name: v.full_name, phone: emptyToNull(v.phone) }).eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => { await refreshProfile(); toast.success('Profile saved.') },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Card>
      <CardHeader title="Profile" subtitle={user?.email} />
      <form onSubmit={handleSubmit((v) => m.mutate(v))} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5" noValidate>
        <Field label="Full name" error={errors.full_name?.message}><Input invalid={!!errors.full_name} {...register('full_name')} /></Field>
        <Field label="Mobile number" error={errors.phone?.message}><Input type="tel" inputMode="tel" invalid={!!errors.phone} {...register('phone')} /></Field>
        <div className="sm:col-span-2 sm:text-right"><Button type="submit" loading={m.isPending} className="w-full sm:w-auto">Save profile</Button></div>
      </form>
    </Card>
  )
}

function OwnerDefaultsCard() {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['owner-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('owner_profiles').select('business_name,address,rent_due_day,late_fee_percent,reminder_days_before').eq('user_id', user!.id).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<OwnerSettingsForm>({ resolver: zodResolver(ownerSettingsSchema.omit({ full_name: true, phone: true })) as never })
  useEffect(() => {
    if (q.data) reset({ business_name: q.data.business_name ?? '', address: q.data.address ?? '', rent_due_day: q.data.rent_due_day, late_fee_percent: Number(q.data.late_fee_percent), reminder_days_before: q.data.reminder_days_before } as OwnerSettingsForm)
  }, [q.data, reset])
  const m = useMutation({
    mutationFn: async (v: OwnerSettingsForm) => {
      const { error } = await supabase.from('owner_profiles').update({
        business_name: emptyToNull(v.business_name), address: emptyToNull(v.address),
        rent_due_day: v.rent_due_day, late_fee_percent: v.late_fee_percent, reminder_days_before: v.reminder_days_before,
      }).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['owner-profile'] }); toast.success('Defaults saved.') },
    onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Card>
      <CardHeader title="Business and rent defaults" subtitle="Used when you assign tenants and, from Phase 3, to generate invoices and reminders." />
      {q.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : (
        <form onSubmit={handleSubmit((v) => m.mutate(v))} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5" noValidate>
          <Field label="Business name (optional)" error={errors.business_name?.message}><Input {...register('business_name')} /></Field>
          <Field label="Business address (optional)" error={errors.address?.message}><Input {...register('address')} /></Field>
          <Field label="Default rent due day (1–28)" error={errors.rent_due_day?.message}><Input type="number" min={1} max={28} inputMode="numeric" invalid={!!errors.rent_due_day} {...register('rent_due_day')} /></Field>
          <Field label="Late fee (% of rent)" error={errors.late_fee_percent?.message}><Input type="number" step="0.01" min={0} max={100} inputMode="decimal" invalid={!!errors.late_fee_percent} {...register('late_fee_percent')} /></Field>
          <Field label="Remind tenants this many days before due" error={errors.reminder_days_before?.message}><Input type="number" min={0} max={30} inputMode="numeric" invalid={!!errors.reminder_days_before} {...register('reminder_days_before')} /></Field>
          <div className="sm:col-span-2 sm:text-right"><Button type="submit" loading={m.isPending} className="w-full sm:w-auto">Save defaults</Button></div>
        </form>
      )}
    </Card>
  )
}

function PlanCard() {
  const q = useQuery({ queryKey: ['my-subscription'], queryFn: async () => { const { data, error } = await supabase.rpc('my_subscription'); if (error) throw error; return data as MySubscription } })
  const lim = (n: number | null) => (n === null ? 'unlimited' : n)
  return (
    <Card>
      <CardHeader title="Your plan" subtitle="Limits apply to properties and units you can add." />
      <div className="space-y-1 p-4 text-sm sm:p-5">
        {q.isLoading ? <Skeleton className="h-10 w-full" /> : q.isError || !q.data ? <p className="text-ink-soft">Plan details are unavailable right now.</p> : (<>
          <p className="font-medium text-ink">{q.data.plan_name}{q.data.period_end ? ` · renews or ends ${formatDate(q.data.period_end)}` : ''}</p>
          <p className="text-ink-soft">Properties: {q.data.properties} of {lim(q.data.max_properties)} · Units: {q.data.units} of {lim(q.data.max_units)}</p>
          <p className="text-ink-mute">To change your plan, contact support from the Support page.</p>
        </>)}
      </div>
    </Card>
  )
}

function OnlinePaymentsCard() {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['owner-online-payments'], queryFn: async () => {
    const { data, error } = await supabase.from('owner_profiles').select('online_payments_enabled').eq('user_id', user!.id).maybeSingle(); if (error) throw error; return !!data?.online_payments_enabled } })
  const m = useMutation({
    mutationFn: async (on: boolean) => { const { error } = await supabase.from('owner_profiles').update({ online_payments_enabled: on }).eq('user_id', user!.id); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['owner-online-payments'] }); toast.success('Saved.') }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Card>
      <CardHeader title="Online rent payment" subtitle="Let tenants pay invoices by UPI, card or net banking through Razorpay." />
      <div className="space-y-3 p-4 text-sm sm:p-5">
        <label className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4" checked={!!q.data} disabled={q.isLoading || m.isPending} onChange={(e) => m.mutate(e.target.checked)} /><span className="font-medium text-ink">Allow tenants to pay online</span></label>
        <p className="text-ink-soft">Payments are collected into the platform's Razorpay account and recorded against the invoice automatically. Settlement of that money to you is arranged outside this app.</p>
      </div>
    </Card>
  )
}

export default function SettingsPage({ kind }: { kind: 'owner' | 'tenant' | 'admin' }) {
  return (
    <>
      <PageHeader title={kind === 'admin' ? 'My account' : 'Settings'} description="Manage your profile and security." />
      <div className="space-y-5">
        <ProfileCard />
        {kind === 'owner' && <OwnerDefaultsCard />}
        {kind === 'owner' && <PlanCard />}
        {kind === 'owner' && <OnlinePaymentsCard />}
        <PasswordCard />
      </div>
    </>
  )
}
