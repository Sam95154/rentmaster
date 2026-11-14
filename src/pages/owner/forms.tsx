import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, FormActions } from '@/components/Modal'
import { Field, Input, Select, Textarea } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { errMsg } from '@/lib/errors'
import { EDITABLE_UNIT_STATUSES, PROPERTY_TYPES, propertySchema, unitSchema, type PropertyForm, type UnitForm } from '@/lib/schemas'
import { emptyToNull, humanize, parseAmenities } from '@/lib/utils'
import type { Property, Unit } from '@/lib/types'

const propertyDefaults: PropertyForm = {
  name: '', building_name: '', property_type: 'apartment', description: '', address_line: '', city: '', state: '', pincode: '', floors: 1, total_units: 1, amenities: '',
}

export function PropertyFormModal({ open, onClose, property }: { open: boolean; onClose: () => void; property?: Property | null }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PropertyForm>({ resolver: zodResolver(propertySchema), defaultValues: propertyDefaults })

  useEffect(() => {
    if (!open) return
    reset(property ? {
      name: property.name, building_name: property.building_name ?? '', property_type: property.property_type as PropertyForm['property_type'],
      description: property.description ?? '', address_line: property.address_line, city: property.city, state: property.state, pincode: property.pincode,
      floors: property.floors ?? 0, total_units: property.total_units ?? 0, amenities: property.amenities.join(', '),
    } : propertyDefaults)
  }, [open, property, reset])

  const m = useMutation({
    mutationFn: async (v: PropertyForm) => {
      const row = {
        name: v.name, building_name: emptyToNull(v.building_name), property_type: v.property_type, description: emptyToNull(v.description),
        address_line: v.address_line, city: v.city, state: v.state, pincode: v.pincode, floors: v.floors, total_units: v.total_units,
        amenities: parseAmenities(v.amenities),
      }
      if (property) {
        const { error } = await supabase.from('properties').update(row).eq('id', property.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('properties').insert({ ...row, owner_id: user!.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries()
      toast.success(property ? 'Property updated.' : 'Property added.')
      onClose()
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title={property ? 'Edit property' : 'Add property'} size="lg">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property name" error={errors.name?.message}><Input invalid={!!errors.name} {...register('name')} /></Field>
          <Field label="Building name (optional)" error={errors.building_name?.message}><Input {...register('building_name')} /></Field>
          <Field label="Property type" error={errors.property_type?.message}>
            <Select {...register('property_type')}>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select>
          </Field>
          <Field label="Number of floors" error={errors.floors?.message}><Input type="number" min={0} inputMode="numeric" invalid={!!errors.floors} {...register('floors')} /></Field>
          <Field label="Street address" className="sm:col-span-2" error={errors.address_line?.message}><Input invalid={!!errors.address_line} {...register('address_line')} /></Field>
          <Field label="City" error={errors.city?.message}><Input invalid={!!errors.city} {...register('city')} /></Field>
          <Field label="State" error={errors.state?.message}><Input invalid={!!errors.state} {...register('state')} /></Field>
          <Field label="PIN code" error={errors.pincode?.message}><Input inputMode="numeric" maxLength={6} invalid={!!errors.pincode} {...register('pincode')} /></Field>
          <Field label="Total rental units" error={errors.total_units?.message}><Input type="number" min={0} inputMode="numeric" invalid={!!errors.total_units} {...register('total_units')} /></Field>
          <Field label="Amenities" hint="Comma separated, for example: Lift, Parking, Power backup" className="sm:col-span-2" error={errors.amenities?.message}><Input {...register('amenities')} /></Field>
          <Field label="Description (optional)" className="sm:col-span-2" error={errors.description?.message}><Textarea {...register('description')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel={property ? 'Save changes' : 'Add property'} loading={m.isPending} />
      </form>
    </Modal>
  )
}

const unitDefaults: UnitForm = { unit_number: '', floor_number: 0, bedrooms: 1, bathrooms: 1, area_sqft: '', monthly_rent: 0, security_deposit: 0, status: 'available', notes: '' }

export function UnitFormModal({ open, onClose, propertyId, unit }: { open: boolean; onClose: () => void; propertyId: string; unit?: Unit | null }) {
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<UnitForm>({ resolver: zodResolver(unitSchema), defaultValues: unitDefaults })
  const occupied = unit?.status === 'occupied'

  useEffect(() => {
    if (!open) return
    reset(unit ? {
      unit_number: unit.unit_number, floor_number: unit.floor_number, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms,
      area_sqft: unit.area_sqft ? String(unit.area_sqft) : '', monthly_rent: Number(unit.monthly_rent), security_deposit: Number(unit.security_deposit),
      status: unit.status, notes: unit.notes ?? '',
    } : unitDefaults)
  }, [open, unit, reset])

  const m = useMutation({
    mutationFn: async (v: UnitForm) => {
      const row = {
        unit_number: v.unit_number, floor_number: v.floor_number, bedrooms: v.bedrooms, bathrooms: v.bathrooms,
        area_sqft: v.area_sqft ? Number(v.area_sqft) : null, monthly_rent: v.monthly_rent, security_deposit: v.security_deposit, notes: emptyToNull(v.notes),
      }
      if (unit) {
        // Status is only sent when it actually changes; the database refuses status changes that contradict occupancy.
        const patch = v.status !== unit.status && !occupied ? { ...row, status: v.status } : row
        const { error } = await supabase.from('property_units').update(patch).eq('id', unit.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('property_units').insert({ ...row, status: v.status, property_id: propertyId, owner_id: user!.id })
        if (error) throw error
      }
    },
    onSuccess: () => { void qc.invalidateQueries(); toast.success(unit ? 'Unit updated.' : 'Unit added.'); onClose() },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <Modal open={open} onClose={onClose} title={unit ? `Edit unit ${unit.unit_number}` : 'Add rental unit'} size="lg">
      <form onSubmit={handleSubmit((v) => m.mutate(v))} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Unit number" error={errors.unit_number?.message}><Input invalid={!!errors.unit_number} {...register('unit_number')} /></Field>
          <Field label="Floor" hint="0 = ground floor" error={errors.floor_number?.message}><Input type="number" inputMode="numeric" invalid={!!errors.floor_number} {...register('floor_number')} /></Field>
          <Field label="Bedrooms" error={errors.bedrooms?.message}><Input type="number" min={0} inputMode="numeric" {...register('bedrooms')} /></Field>
          <Field label="Bathrooms" error={errors.bathrooms?.message}><Input type="number" min={0} inputMode="numeric" {...register('bathrooms')} /></Field>
          <Field label="Built-up area (sq ft, optional)" error={errors.area_sqft?.message}><Input inputMode="decimal" invalid={!!errors.area_sqft} {...register('area_sqft')} /></Field>
          <Field label="Status" hint={occupied ? 'Occupied units change status when the tenancy ends.' : undefined} error={errors.status?.message}>
            {occupied ? <Input value="Occupied" disabled readOnly /> : (
              <Select {...register('status')}>{EDITABLE_UNIT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
            )}
          </Field>
          <Field label="Monthly rent (₹)" error={errors.monthly_rent?.message}><Input type="number" min={0} step="0.01" inputMode="decimal" invalid={!!errors.monthly_rent} {...register('monthly_rent')} /></Field>
          <Field label="Security deposit (₹)" error={errors.security_deposit?.message}><Input type="number" min={0} step="0.01" inputMode="decimal" invalid={!!errors.security_deposit} {...register('security_deposit')} /></Field>
          <Field label="Private notes (only you can see these)" className="sm:col-span-2" error={errors.notes?.message}><Textarea {...register('notes')} /></Field>
        </div>
        <FormActions onCancel={onClose} submitLabel={unit ? 'Save changes' : 'Add unit'} loading={m.isPending} />
      </form>
    </Modal>
  )
}
