export function errMsg(e: unknown): string {
  if (!e) return 'Something went wrong. Please try again.'
  if (typeof e === 'string') return e
  const err = e as { message?: string; code?: string; details?: string }
  if (err.code === '23505') {
    if (err.message?.includes('property_units_unique_number')) return 'A unit with this number already exists in this property.'
    if (err.message?.includes('tenant_profiles_owner_email_key')) return 'You already have a tenant with this email address.'
    if (err.message?.includes('tenant_assignments_one_active_per_unit')) return 'This unit already has an active tenant.'
    return 'That record already exists.'
  }
  if (err.code === '42501') return 'You do not have permission to do that.'
  if (err.code === '23503') return 'This record is linked to other data and cannot be changed this way.'
  if (err.code === '23514') return 'One of the values is not allowed. Please check the form.'
  if (err.message === 'Failed to fetch') return 'Cannot reach the server. Check your connection and try again.'
  return err.message || 'Something went wrong. Please try again.'
}
