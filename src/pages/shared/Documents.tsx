import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, FolderOpen, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Select, SkeletonRows, TableWrap, Td, Th } from '@/components/ui'
import { ConfirmDialog, FormActions, Modal } from '@/components/Modal'
import { useToast } from '@/components/Toast'
import { errMsg } from '@/lib/errors'
import { DOC_TYPES, documentSchema, type DocumentForm } from '@/lib/schemas'
import { formatDate, humanize } from '@/lib/utils'
import type { DocRow } from '@/lib/types'

const PAGE = 12
const MAX_BYTES = 10 * 1024 * 1024
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const size = (n: number | null) => (n === null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null); const ref = useRef<HTMLInputElement>(null)
  const tenants = useQuery({ enabled: open, queryKey: ['tenant-options'], queryFn: async () => {
    const { data, error } = await supabase.from('tenant_profiles').select('id, full_name').is('deleted_at', null).neq('status', 'archived').order('full_name'); if (error) throw error; return data ?? [] } })
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<DocumentForm>({ resolver: zodResolver(documentSchema) })
  useEffect(() => { if (open) { reset({ title: '', doc_type: 'agreement', tenant_id: '', shared_with_tenant: false }); setFile(null) } }, [open, reset])
  const pick = (f?: File) => {
    if (!f) return setFile(null)
    if (!EXT[f.type]) { toast.error('Upload a PDF, JPG, PNG or WebP file.'); if (ref.current) ref.current.value = ''; return }
    if (f.size > MAX_BYTES) { toast.error('The file is larger than 10 MB.'); if (ref.current) ref.current.value = ''; return }
    setFile(f)
  }
  const m = useMutation({
    mutationFn: async (v: DocumentForm) => {
      if (!file) throw new Error('Choose a file to upload.')
      const path = `${user!.id}/${crypto.randomUUID()}.${EXT[file.type]}`
      const up = await supabase.storage.from('documents').upload(path, file, { contentType: file.type }); if (up.error) throw up.error
      const { error } = await supabase.from('documents').insert({ owner_id: user!.id, title: v.title, doc_type: v.doc_type, tenant_id: v.tenant_id || null, shared_with_tenant: v.shared_with_tenant, storage_path: path, mime_type: file.type, size_bytes: file.size })
      if (error) { await supabase.storage.from('documents').remove([path]); throw error }
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Document uploaded.'); onClose() }, onError: (e) => toast.error(errMsg(e)),
  })
  return (
    <Modal open={open} onClose={onClose} title="Upload document" description="Stored privately. A tenant can see it only if you share it with them.">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2" error={errors.title?.message}><Input invalid={!!errors.title} {...register('title')} /></Field>
          <Field label="Type"><Select {...register('doc_type')}>{DOC_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
          <Field label="Tenant (optional)" error={errors.tenant_id?.message}><Select {...register('tenant_id')}><option value="">None</option>{tenants.data?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</Select></Field>
          <Field label="File" className="sm:col-span-2" hint="PDF, JPG, PNG or WebP, up to 10 MB."><input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium" /></Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2"><input type="checkbox" {...register('shared_with_tenant')} />Share with the selected tenant{watch('shared_with_tenant') ? '' : ' (off: only you can see it)'}</label>
        </div>
        <FormActions onCancel={onClose} submitLabel="Upload" loading={m.isPending} />
      </form>
    </Modal>
  )
}

export default function DocumentsPage({ role }: { role: 'owner' | 'tenant' }) {
  const toast = useToast(); const qc = useQueryClient()
  const [page, setPage] = useState(1); const [type, setType] = useState('')
  const [open, setOpen] = useState(false); const [del, setDel] = useState<DocRow | null>(null)
  const list = useQuery({ queryKey: ['documents', role, type, page], placeholderData: keepPreviousData, queryFn: async () => {
    let q = supabase.from('documents').select(role === 'owner' ? '*, tenant_profiles(full_name)' : '*', { count: 'exact' }).is('deleted_at', null)
    if (type) q = q.eq('doc_type', type)
    const { data, error, count } = await q.order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1)
    if (error) throw error; return { rows: (data ?? []) as unknown as DocRow[], total: count ?? 0 } } })
  const view = async (d: DocRow) => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 120)
    if (error || !data) return toast.error('Could not open this document.')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  const share = useMutation({
    mutationFn: async (d: DocRow) => { const { error } = await supabase.from('documents').update({ shared_with_tenant: !d.shared_with_tenant }).eq('id', d.id); if (error) throw error },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents'] }), onError: (e) => toast.error(errMsg(e)),
  })
  const remove = useMutation({
    mutationFn: async (d: DocRow) => {
      const { error } = await supabase.from('documents').update({ deleted_at: new Date().toISOString(), shared_with_tenant: false }).eq('id', d.id); if (error) throw error
      await supabase.storage.from('documents').remove([d.storage_path])
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Document deleted.'); setDel(null) }, onError: (e) => { toast.error(errMsg(e)); setDel(null) },
  })
  return (
    <>
      <PageHeader title="Documents" description={role === 'owner' ? 'Private storage. Share a document with a tenant when they need it.' : 'Documents your owner has shared with you.'}
        actions={role === 'owner' ? <Button onClick={() => setOpen(true)}><Upload className="h-4 w-4" />Upload</Button> : undefined} />
      <div className="mb-4 sm:w-56"><Select aria-label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}><option value="">All types</option>{DOC_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></div>
      <Card>
        {list.isLoading ? <SkeletonRows /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => void list.refetch()} /> : list.data?.rows.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No documents" description={role === 'owner' ? 'Upload agreements, ID proofs and notices.' : 'Nothing has been shared with you yet.'} />
        ) : (<>
          <TableWrap>
            <thead><tr><Th>Title</Th><Th>Type</Th>{role === 'owner' && <Th>Tenant</Th>}<Th>Added</Th>{role === 'owner' && <Th>Visibility</Th>}<Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>{list.data?.rows.map((d) => (
              <tr key={d.id}><Td><p className="font-medium">{d.title}</p><p className="text-xs text-ink-mute">{size(d.size_bytes)}</p></Td><Td>{humanize(d.doc_type)}</Td>
                {role === 'owner' && <Td>{d.tenant_profiles?.full_name ?? '—'}</Td>}<Td>{formatDate(d.created_at)}</Td>
                {role === 'owner' && <Td>{d.tenant_id ? <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-brand" onClick={() => share.mutate(d)} aria-label={d.shared_with_tenant ? 'Stop sharing' : 'Share with tenant'}><Badge tone={d.shared_with_tenant ? 'success' : 'neutral'}>{d.shared_with_tenant ? 'Shared' : 'Private'}</Badge></button> : <Badge tone="neutral">Private</Badge>}</Td>}
                <Td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" aria-label={`View ${d.title}`} onClick={() => void view(d)}><Eye className="h-4 w-4" /></Button>
                  {role === 'owner' && <Button size="sm" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setDel(d)}><Trash2 className="h-4 w-4" /></Button>}</div></Td></tr>))}</tbody>
          </TableWrap>
          <Pager page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage} />
        </>)}
      </Card>
      {role === 'owner' && <UploadModal open={open} onClose={() => setOpen(false)} />}
      <ConfirmDialog open={!!del} danger confirmLabel="Delete" title="Delete document?" loading={remove.isPending} message={<>“{del?.title}” will be removed and the tenant will lose access.</>} onConfirm={() => del && remove.mutate(del)} onCancel={() => setDel(null)} />
    </>
  )
}
