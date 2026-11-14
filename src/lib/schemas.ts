import { z } from 'zod'

export const PROPERTY_TYPES = [
  'independent_house', 'apartment', 'residential_building', 'villa', 'commercial', 'shop', 'office', 'other',
] as const
export const UNIT_STATUSES = ['available', 'occupied', 'reserved', 'under_maintenance', 'inactive'] as const
export const EDITABLE_UNIT_STATUSES = ['available', 'reserved', 'under_maintenance', 'inactive'] as const
export const BILLING_CYCLES = ['monthly', 'quarterly', 'custom'] as const

const phone = z
  .string()
  .trim()
  .regex(/^(\+91[\s-]?)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
  .or(z.literal(''))
  .optional()

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name').max(100),
    email: z.string().trim().email('Enter a valid email address'),
    phone,
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export const resetSchema = z
  .object({
    password: registerSchemaPassword(),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

function registerSchemaPassword() {
  return z
    .string()
    .min(8, 'Use at least 8 characters')
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number')
}

export const propertySchema = z.object({
  name: z.string().trim().min(2, 'Enter the property name').max(120),
  building_name: z.string().trim().max(120).optional(),
  property_type: z.enum(PROPERTY_TYPES),
  description: z.string().trim().max(2000).optional(),
  address_line: z.string().trim().min(5, 'Enter the street address').max(300),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.string().trim().min(2, 'Enter the state').max(80),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
  floors: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole number only').min(0).max(200),
  total_units: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole number only').min(0).max(2000),
  amenities: z.string().max(500).optional(),
})
export type PropertyForm = z.infer<typeof propertySchema>

export const unitSchema = z.object({
  unit_number: z.string().trim().min(1, 'Enter the unit number').max(30),
  floor_number: z.coerce.number().int('Whole number only').min(-5).max(200),
  bedrooms: z.coerce.number().int('Whole number only').min(0).max(30),
  bathrooms: z.coerce.number().int('Whole number only').min(0).max(30),
  area_sqft: z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) > 0), 'Enter a positive area or leave blank')
    .optional(),
  monthly_rent: z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100000000),
  security_deposit: z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100000000),
  status: z.enum(UNIT_STATUSES),
  notes: z.string().trim().max(1000).optional(),
})
export type UnitForm = z.infer<typeof unitSchema>

export const tenantSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the tenant name').max(100),
  email: z.string().trim().email('Enter a valid email address').or(z.literal('')).optional(),
  phone,
  date_of_birth: z
    .string()
    .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v) < new Date()), 'Enter a valid past date')
    .optional(),
  permanent_address: z.string().trim().max(500).optional(),
  emergency_contact_name: z.string().trim().max(100).optional(),
  emergency_contact_phone: phone,
  identity_status: z.enum(['unverified', 'pending', 'verified', 'rejected']),
})
export type TenantForm = z.infer<typeof tenantSchema>

export const assignSchema = z.object({
  tenant_id: z.string().uuid('Choose a tenant'),
  unit_id: z.string().uuid('Choose a unit'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the move-in date'),
  monthly_rent: z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100000000),
  security_deposit: z.coerce.number({ invalid_type_error: 'Enter an amount' }).min(0, 'Cannot be negative').max(100000000),
  rent_due_day: z.coerce.number().int().min(1, 'Choose 1 to 28').max(28, 'Choose 1 to 28'),
  billing_cycle: z.enum(BILLING_CYCLES),
})
export type AssignForm = z.infer<typeof assignSchema>

export const ownerSettingsSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(100),
  phone,
  business_name: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  rent_due_day: z.coerce.number().int().min(1, 'Choose 1 to 28').max(28, 'Choose 1 to 28'),
  late_fee_percent: z.coerce.number().min(0, 'Cannot be negative').max(100),
  reminder_days_before: z.coerce.number().int().min(0).max(30),
})
export type OwnerSettingsForm = z.infer<typeof ownerSettingsSchema>

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your name').max(100),
  phone,
})
export type ProfileForm = z.infer<typeof profileSchema>

export const passwordSchema = z
  .object({ password: registerSchemaPassword(), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export type PasswordForm = z.infer<typeof passwordSchema>

export const tenantSelfSchema = z.object({
  emergency_contact_name: z.string().trim().max(100).optional(),
  emergency_contact_phone: phone,
  permanent_address: z.string().trim().max(500).optional(),
})
export type TenantSelfForm = z.infer<typeof tenantSelfSchema>

// ---------- Phase 3: finance ----------
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'netbanking', 'bank_transfer', 'cheque', 'other'] as const
const money = (label: string) => z.coerce.number({ invalid_type_error: `Enter ${label}` }).positive(`${label} must be more than zero`).max(100000000, 'Amount is too large')
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Use at most 2 decimal places')

export const paymentSchema = z.object({
  amount: money('an amount'),
  method: z.enum(PAYMENT_METHODS),
  paid_on: z.string().min(1, 'Choose a date'),
  notes: z.string().trim().max(300).optional(),
})
export const adjustmentSchema = z.object({
  kind: z.enum(['discount', 'late_fee', 'charge']),
  amount: money('an amount'),
  description: z.string().trim().min(2, 'Add a short description').max(200),
})
export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) })
export const depositTxnSchema = z.object({
  type: z.enum(['received', 'deduction', 'damage', 'refund']),
  amount: money('an amount'),
  date: z.string().min(1, 'Choose a date'),
  note: z.string().trim().max(300).optional(),
})
export const manualInvoiceSchema = z.object({
  assignment_id: z.string().uuid('Choose a tenancy'),
  period_start: z.string().min(1, 'Required'),
  period_end: z.string().min(1, 'Required'),
  due_date: z.string().min(1, 'Required'),
  amount: money('an amount'),
  description: z.string().trim().max(200).optional(),
}).refine((v) => v.period_end >= v.period_start, { path: ['period_end'], message: 'End must be on or after start' })
export const expenseSchema = z.object({
  property_id: z.string().uuid('Choose a property'),
  category_id: z.string().optional(),
  amount: money('an amount'),
  expense_date: z.string().min(1, 'Choose a date'),
  description: z.string().trim().max(300).optional(),
  payment_method: z.enum(['', ...PAYMENT_METHODS]).optional(),
})
export type PaymentForm = z.infer<typeof paymentSchema>
export type AdjustmentForm = z.infer<typeof adjustmentSchema>
export type DepositTxnForm = z.infer<typeof depositTxnSchema>
export type ManualInvoiceForm = z.infer<typeof manualInvoiceSchema>
export type ExpenseForm = z.infer<typeof expenseSchema>

// ---------- Phase 4 ----------
export const MAINT_CATEGORIES = ['plumbing', 'electrical', 'appliance', 'painting', 'carpentry', 'cleaning', 'pest_control', 'other'] as const
export const MAINT_STATUSES = ['new', 'pending', 'assigned', 'in_progress', 'resolved', 'rejected', 'closed'] as const
export const URGENCIES = ['low', 'medium', 'high', 'emergency'] as const
export const maintenanceSchema = z.object({
  title: z.string().trim().min(3, 'Give the request a short title').max(120),
  category: z.enum(MAINT_CATEGORIES),
  urgency: z.enum(URGENCIES),
  description: z.string().trim().max(2000, 'Keep it under 2000 characters').optional(),
  preferred_visit_at: z.string().optional(),
})
export const maintenanceOwnerSchema = z.object({
  status: z.enum(MAINT_STATUSES),
  assigned_to: z.string().trim().max(100).optional(),
  repair_cost: z.string().trim().regex(/^(\d{1,9}(\.\d{1,2})?)?$/, 'Enter a valid amount, e.g. 450 or 450.50').optional(),
})
export const commentSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(2000) })
export const DOC_TYPES = ['agreement', 'id_proof', 'police_verification', 'receipt', 'notice', 'other'] as const
export const documentSchema = z.object({
  title: z.string().trim().min(2, 'Give the document a title').max(120),
  doc_type: z.enum(DOC_TYPES),
  tenant_id: z.string().optional(),
  shared_with_tenant: z.boolean(),
}).refine((v) => !v.shared_with_tenant || !!v.tenant_id, { path: ['tenant_id'], message: 'Choose a tenant to share with' })
export type MaintenanceForm = z.infer<typeof maintenanceSchema>
export type MaintenanceOwnerForm = z.infer<typeof maintenanceOwnerSchema>
export type DocumentForm = z.infer<typeof documentSchema>

// ---------- Phase 5 ----------
export const messageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000, 'Messages can be at most 4000 characters') })
export const announcementSchema = z.object({
  title: z.string().trim().min(2, 'Add a title').max(150),
  body: z.string().trim().min(1, 'Write the announcement').max(5000),
  property_id: z.string().optional(),
})
export type AnnouncementForm = z.infer<typeof announcementSchema>

// ---------- Phase 6 ----------
export const TICKET_CATEGORIES = ['billing', 'technical', 'account', 'property', 'other'] as const
export const ticketSchema = z.object({
  subject: z.string().trim().min(3, 'Give the ticket a short subject').max(150),
  category: z.enum(TICKET_CATEGORIES),
  body: z.string().trim().min(1, 'Describe the problem').max(4000),
})
export const planSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(40),
  price_monthly: z.coerce.number({ invalid_type_error: 'Enter a price' }).min(0, 'Cannot be negative').max(10000000),
  max_properties: z.string().trim().regex(/^\d{0,6}$/, 'Whole number, or empty for unlimited'),
  max_units: z.string().trim().regex(/^\d{0,7}$/, 'Whole number, or empty for unlimited'),
  features: z.string().trim().max(1200),
  active: z.boolean(),
})
export const ownerPlanSchema = z.object({
  plan_id: z.string().uuid('Choose a plan'),
  status: z.enum(['trialing', 'active', 'past_due', 'cancelled']),
  period_end: z.string().optional(),
})
export const platformAnnouncementSchema = z.object({
  title: z.string().trim().min(2, 'Add a title').max(150),
  body: z.string().trim().min(1, 'Write the announcement').max(5000),
  audience: z.enum(['owners', 'tenants', 'all']),
})
export const settingsSchema = z.object({
  platform_notice: z.string().trim().max(300),
  support_email: z.string().trim().max(300).refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Enter a valid email'),
  support_phone: z.string().trim().max(20).refine((v) => v === '' || /^[0-9+()\-\s]{6,20}$/.test(v), 'Enter a valid phone number'),
})
export type TicketForm = z.infer<typeof ticketSchema>
export type PlanForm = z.infer<typeof planSchema>
export type OwnerPlanForm = z.infer<typeof ownerPlanSchema>
export type PlatformAnnouncementForm = z.infer<typeof platformAnnouncementSchema>
export type SettingsForm = z.infer<typeof settingsSchema>
