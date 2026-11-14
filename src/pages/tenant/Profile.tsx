import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toast'
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, Skeleton, statusTone } from '@/components/ui'
import { errMsg } from '@/lib/errors'
import { tenantSelfSchema, type TenantSelfForm } from '@/lib/schemas'
import { humanize } from '@/lib/utils'
import type { Tenant } from '@/lib/types'

export default function TenantProfile() {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()

  const q = useQuery({
    queryKey: ['my-tenant-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenant_profiles').select('*').limit(1).maybeSingle()
      if (error) throw error
      return data as Tenant | null
    },
  })
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TenantSelfForm>({ resolver: zodResolver(tenantSelfSchema) })
  useEffect(() => {
    if (q.data) reset({ emergency_contact_name: q.data.emergency_contact_name ?? '', emergency_contact_phone: q.data.emergency_contact_phone ?? '', permanent_address: q.data.permanent_address ?? '' })
  }, [q.data, reset])

  const m = useMutation({
    mutationFn: async (v: TenantSelfForm) => {
      const { error } = await supabase.rpc('update_my_tenant_profile', { p_emergency_name: v.emergency_contact_name ?? '', p_emergency_phone: v.emergency_contact_phone ?? '', p_permanent_address: v.permanent_address ?? '' })
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['my-tenant-profile'] }); toast.success('Profile updated.') },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (q.isLoading) return <><PageHeader title="My profile" /><Skeleton className="h-64" /></>
  if (q.isError) return <Card><ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /></Card>
  const t = q.data

  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" subtitle="Managed by your owner. Contact them to change these." />
          <dl className="divide-y divide-line px-5 text-sm">
            <div className="flex justify-between py-2"><dt className="text-ink-mute">Name</dt><dd className="font-medium">{t?.full_name ?? user?.full_name}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-mute">Email</dt><dd className="font-medium">{user?.email}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-mute">Mobile</dt><dd className="font-medium">{t?.phone ?? user?.phone ?? '—'}</dd></div>
            {t && <div className="flex justify-between py-2"><dt className="text-ink-mute">Identity verification</dt><dd><Badge tone={statusTone(t.identity_status)}>{humanize(t.identity_status)}</Badge></dd></div>}
          </dl>
          <p className="px-5 pb-4 pt-2 text-xs text-ink-mute">Changing your mobile number with verification, and uploading a profile photo, arrive in Phase 4.</p>
        </Card>
        <Card>
          <CardHeader title="Your details" subtitle="You can update these yourself." />
          {!t ? <p className="p-5 text-sm text-ink-mute">Your owner has not linked a tenant record to this account yet.</p> : (
            <form onSubmit={handleSubmit((v) => m.mutate(v))} className="space-y-4 p-5" noValidate>
              <Field label="Permanent address" error={errors.permanent_address?.message}><Input {...register('permanent_address')} /></Field>
              <Field label="Emergency contact name" error={errors.emergency_contact_name?.message}><Input {...register('emergency_contact_name')} /></Field>
              <Field label="Emergency contact phone" error={errors.emergency_contact_phone?.message}><Input type="tel" inputMode="tel" invalid={!!errors.emergency_contact_phone} {...register('emergency_contact_phone')} /></Field>
              <Button type="submit" loading={m.isPending} className="w-full sm:w-auto">Save</Button>
            </form>
          )}
        </Card>
      </div>
    </>
  )
}
