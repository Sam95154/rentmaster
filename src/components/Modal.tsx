import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './ui'
import { cn } from '@/lib/utils'

export function Modal({ open, onClose, title, description, children, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; size?: 'md' | 'lg'
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-5 shadow-pop focus:outline-none sm:p-6',
            size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'mt-1 text-sm text-ink-soft' : 'sr-only'}>{description ?? title}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="rounded-md p-1 text-ink-mute hover:bg-surface hover:text-ink"><X className="h-5 w-5" /></button>
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-ink-soft">{message}</div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function FormActions({ onCancel, submitLabel, loading }: { onCancel: () => void; submitLabel: string; loading?: boolean }) {
  return (
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
      <Button type="submit" loading={loading}>{submitLabel}</Button>
    </div>
  )
}
