import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ImagePlus, MapPin, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, statusTone, TableWrap, Td, Th } from '@/components/ui'
import { ConfirmDialog } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { formatINR, humanize } from '@/lib/utils'
import type { Property, Unit } from '@/lib/types'
import { PropertyFormModal, UnitFormModal } from './forms'
import { AssignModal } from './tenancyModals'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function PhotoManager({ property }: { property: Property }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const paths = property.photo_paths

  const urls = useQuery({
    queryKey: ['photo-urls', property.id, paths],
    enabled: paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('property-media').createSignedUrls(paths, 3600)
      if (error) throw error
      return new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
    },
  })

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const added: string[] = []
      for (const f of files) {
        const ext = ALLOWED[f.type]
        if (!ext) throw new Error(`“${f.name}” is not a JPG, PNG or WebP image.`)
        if (f.size > MAX_BYTES) throw new Error(`“${f.name}” is larger than 5 MB.`)
        const path = `${user!.id}/${property.id}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from('property-media').upload(path, f, { contentType: f.type, upsert: false })
        if (error) throw error
        added.push(path)
      }
      const { error } = await supabase.from('properties').update({ photo_paths: [...paths, ...added] }).eq('id', property.id)
      if (error) throw error
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['property', property.id] }); toast.success('Photos uploaded.') },
    onError: (e) => toast.error(errMsg(e)),
  })

  const remove = useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.from('properties').update({ photo_paths: paths.filter((p) => p !== path) }).eq('id', property.id)
      if (error) throw error
      await supabase.storage.from('property-media').remove([path])
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['property', property.id] }); toast.success('Photo removed.') },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Card>
      <CardHeader title="Photos" subtitle="JPG, PNG or WebP, up to 5 MB each" action={
        <>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) upload.mutate(f) }} />
          <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}><ImagePlus className="h-4 w-4" />Add photos</Button>
        </>
      } />
      {paths.length === 0 ? <p className="px-5 py-8 text-center text-sm text-ink-mute">No photos yet.</p> : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {paths.map((p) => {
            const src = urls.data?.get(p) ?? undefined
            return (
            <div key={p} className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-surface">
              {src ? <img src={src} alt={`${property.name} photo`} className="h-full w-full object-cover" loading="lazy" /> : <Skeleton className="h-full w-full" />}
              <button type="button" aria-label="Remove photo" onClick={() => remove.mutate(p)} className="absolute right-1.5 top-1.5 rounded-full bg-navy/80 p-1 text-white hover:bg-danger"><X className="h-4 w-4" /></button>
            </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

interface UnitRow extends Unit { tenancy: { id: string; status: string; tenant: { id: string; full_name: string } | null }[] }

export default function PropertyDetail() {
  const { id = '' } = useParams()
  const toast = useToast()
  const qc = useQueryClient()
  const [editProp, setEditProp] = useState(false)
  const [unitForm, setUnitForm] = useState<{ open: boolean; unit: Unit | null }>({ open: false, unit: null })
  const [assignUnit, setAssignUnit] = useState<Unit | null>(null)
  const [delUnit, setDelUnit] = useState<Unit | null>(null)

  const prop = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
      if (error) throw error
      return data as Property | null
    },
  })
  const units = useQuery({
    queryKey: ['units', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('property_units')
        .select('*, tenancy:tenant_assignments(id, status, tenant:tenant_profiles(id, full_name))')
        .eq('property_id', id).is('deleted_at', null).order('floor_number').order('unit_number')
      if (error) throw error
      return ((data ?? []) as unknown as UnitRow[]).map((u) => ({ ...u, tenancy: u.tenancy.filter((t) => t.status === 'active') }))
    },
  })

  const del = useMutation({
    mutationFn: async (u: Unit) => { const { error } = await supabase.from('property_units').update({ deleted_at: new Date().toISOString() }).eq('id', u.id); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Unit removed.'); setDelUnit(null) },
    onError: (e) => { toast.error(errMsg(e)); setDelUnit(null) },
  })

  if (prop.isLoading) return <><Skeleton className="mb-4 h-8 w-64" /><Skeleton className="h-48" /></>
  if (prop.isError) return <Card><ErrorState message={errMsg(prop.error)} onRetry={() => void prop.refetch()} /></Card>
  const p = prop.data
  if (!p) return <Card><EmptyState icon={ArrowLeft} title="Property not found" description="It may have been removed, or it belongs to another account." action={<Link to="/owner/properties"><Button>Back to properties</Button></Link>} /></Card>

  const archived = p.status === 'archived'

  return (
    <>
      <Link to="/owner/properties" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft className="h-4 w-4" />All properties</Link>
      <PageHeader
        title={p.name}
        description={`${humanize(p.property_type)}${p.building_name ? ` · ${p.building_name}` : ''}`}
        actions={<Button variant="secondary" onClick={() => setEditProp(true)}><Pencil className="h-4 w-4" />Edit property</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(p.status)}>{humanize(p.status)}</Badge>{p.floors != null && <Badge>{p.floors} floors</Badge>}</div>
          <p className="mt-3 flex items-start gap-1.5 text-sm text-ink-soft"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{p.address_line}, {p.city}, {p.state} {p.pincode}</p>
          {p.description && <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{p.description}</p>}
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Amenities</h2>
          {p.amenities.length === 0 ? <p className="mt-2 text-sm text-ink-mute">None listed.</p> : <div className="mt-2 flex flex-wrap gap-1.5">{p.amenities.map((a) => <Badge key={a} tone="info">{a}</Badge>)}</div>}
        </Card>
      </div>

      <div className="mt-4"><PhotoManager property={p} /></div>

      <Card className="mt-4">
        <CardHeader title="Rental units" subtitle={units.data ? `${units.data.length} total` : undefined} action={!archived && <Button size="sm" onClick={() => setUnitForm({ open: true, unit: null })}><Plus className="h-4 w-4" />Add unit</Button>} />
        {units.isLoading ? <SkeletonRows /> : units.isError ? <ErrorState message={errMsg(units.error)} onRetry={() => void units.refetch()} /> : units.data?.length === 0 ? (
          <EmptyState icon={Plus} title="No units yet" description="Add the houses, flats or shops you rent out in this property." action={!archived ? <Button onClick={() => setUnitForm({ open: true, unit: null })}>Add first unit</Button> : undefined} />
        ) : (
          <TableWrap>
            <thead><tr><Th>Unit</Th><Th>Floor</Th><Th>Beds / baths</Th><Th>Rent</Th><Th>Deposit</Th><Th>Status</Th><Th>Tenant</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {units.data?.map((u) => {
                const t = u.tenancy[0]?.tenant
                return (
                  <tr key={u.id}>
                    <Td className="font-medium">{u.unit_number}</Td>
                    <Td>{u.floor_number === 0 ? 'Ground' : u.floor_number}</Td>
                    <Td>{u.bedrooms} / {u.bathrooms}</Td>
                    <Td>{formatINR(u.monthly_rent)}</Td>
                    <Td>{formatINR(u.security_deposit)}</Td>
                    <Td><Badge tone={statusTone(u.status)}>{humanize(u.status)}</Badge></Td>
                    <Td>{t ? <Link to={`/owner/tenants/${t.id}`} className="text-brand hover:underline">{t.full_name}</Link> : <span className="text-ink-mute">—</span>}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {(u.status === 'available' || u.status === 'reserved') && <Button size="sm" variant="secondary" onClick={() => setAssignUnit(u)}><UserPlus className="h-4 w-4" />Assign</Button>}
                        <Button size="sm" variant="ghost" aria-label={`Edit unit ${u.unit_number}`} onClick={() => setUnitForm({ open: true, unit: u })}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Remove unit ${u.unit_number}`} onClick={() => setDelUnit(u)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <PropertyFormModal open={editProp} onClose={() => setEditProp(false)} property={p} />
      <UnitFormModal open={unitForm.open} onClose={() => setUnitForm({ open: false, unit: null })} propertyId={p.id} unit={unitForm.unit} />
      <AssignModal open={!!assignUnit} onClose={() => setAssignUnit(null)} unit={assignUnit} />
      <ConfirmDialog open={!!delUnit} title="Remove unit?" danger confirmLabel="Remove" loading={del.isPending}
        message={<>Unit {delUnit?.unit_number} will be removed from this property. Units with an active tenant cannot be removed.</>}
        onConfirm={() => delUnit && del.mutate(delUnit)} onCancel={() => setDelUnit(null)} />
    </>
  )
}
