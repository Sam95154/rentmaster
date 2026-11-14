import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Card, CardHeader, ErrorState, Field, Input, PageHeader, SkeletonRows } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { settingsSchema, type SettingsForm } from '@/lib/schemas'

type Settings = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export default function PlatformSettings() {
  const toast = useToast(); const qc = useQueryClient()
  const q = useQuery({ queryKey: ['platform-settings'], queryFn: async () => {
    const { data, error } = await supabase.from('platform_settings').select('key, value'); if (error) throw error
    return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])) as Settings } })
  const set = async (key: string, value: unknown) => { const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: value }); if (error) throw error }
  const signups = useMutation({ mutationFn: (v: boolean) => set('signups_enabled', v), onSuccess: () => { void qc.invalidateQueries(); toast.success('Registration setting saved.') }, onError: (e) => toast.error(errMsg(e)) })
  const { register, handleSubmit, formState: { errors } } = useForm<SettingsForm>({ resolver: zodResolver(settingsSchema), values: { platform_notice: str(q.data?.platform_notice), support_email: str(q.data?.support_email), support_phone: str(q.data?.support_phone) } })
  const save = useMutation({
    mutationFn: async (v: SettingsForm) => { await set('platform_notice', v.platform_notice); await set('support_email', v.support_email); await set('support_phone', v.support_phone) },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Settings saved.') }, onError: (e) => toast.error(errMsg(e)),
  })
  const open = q.data?.signups_enabled !== false
  return (
    <>
      <PageHeader title="Platform settings" description="Controls that affect every user. All changes are written to the audit log." />
      {q.isLoading ? <Card><SkeletonRows rows={3} /></Card> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => void q.refetch()} /> : (
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Card>
            <CardHeader title="Registrations" subtitle="When closed, new owners cannot sign up. Tenants invited by an owner can still join." />
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5">
              <p className="text-sm text-ink">New registrations are <strong>{open ? 'open' : 'closed'}</strong>.</p>
              <Button variant={open ? 'secondary' : 'primary'} loading={signups.isPending} onClick={() => signups.mutate(!open)}>{open ? 'Close registrations' : 'Open registrations'}</Button>
            </div>
          </Card>
          <Card>
            <CardHeader title="Notice and support contact" subtitle="The notice is shown as a banner to every signed-in user. Leave it empty to hide it." />
            <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 px-5 pb-5">
              <Field label="Banner notice" error={errors.platform_notice?.message}><Input maxLength={300} {...register('platform_notice')} /></Field>
              <Field label="Support email" error={errors.support_email?.message}><Input type="email" {...register('support_email')} /></Field>
              <Field label="Support phone" error={errors.support_phone?.message}><Input type="tel" {...register('support_phone')} /></Field>
              <div><Button type="submit" loading={save.isPending}>Save settings</Button></div>
            </form>
          </Card>
        </div>
      )}
    </>
  )
}
