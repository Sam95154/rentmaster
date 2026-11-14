export type AppRole = 'super_admin' | 'owner' | 'tenant'

export interface UserRow {
  id: string
  email: string
  full_name: string
  phone: string | null
  status: 'active' | 'suspended' | 'pending'
}

export interface Property {
  id: string
  owner_id: string
  name: string
  building_name: string | null
  property_type: string
  description: string | null
  address_line: string
  city: string
  state: string
  pincode: string
  floors: number | null
  total_units: number | null
  amenities: string[]
  photo_paths: string[]
  status: 'active' | 'archived'
  created_at: string
}

export interface Unit {
  id: string
  property_id: string
  owner_id: string
  unit_number: string
  floor_number: number
  bedrooms: number
  bathrooms: number
  area_sqft: number | null
  monthly_rent: number
  security_deposit: number
  status: 'available' | 'occupied' | 'reserved' | 'under_maintenance' | 'inactive'
  notes: string | null
}

export interface Tenant {
  id: string
  owner_id: string
  user_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  date_of_birth: string | null
  permanent_address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  identity_status: 'unverified' | 'pending' | 'verified' | 'rejected'
  status: 'invited' | 'active' | 'archived'
  created_at: string
}

export interface Assignment {
  id: string
  tenant_id: string
  unit_id: string
  start_date: string
  end_date: string | null
  monthly_rent: number
  security_deposit: number
  rent_due_day: number
  billing_cycle: 'monthly' | 'quarterly' | 'custom'
  status: 'active' | 'ended' | 'transferred'
  end_reason: string | null
}

export interface AssignmentWithUnit extends Assignment {
  unit: { unit_number: string; property: { id: string; name: string } | null } | null
}

export interface OwnerStats {
  total_properties: number
  total_units: number
  occupied_units: number
  vacant_units: number
  total_tenants: number
  expected_rent: number
  collected_this_month: number
  pending_rent: number
  overdue_rent: number
  deposits_held: number
  expenses_this_month: number
  net_income_month: number
  open_maintenance: number
  upcoming_due: { id: string; invoice_number: string; due_date: string; balance: number; tenant_name: string; unit_number: string }[]
  recent_tenants: { id: string; full_name: string; created_at: string }[]
  recent_transactions: { id: string; amount: number; method: string; paid_at: string; tenant_name: string }[]
}

export interface MonthPoint { month: string; income: number; expenses: number; billed: number }
export interface PropertySummary { property_id: string; name: string; total_units: number; occupied_units: number; income_12m: number }

export interface TenancyView {
  assignment_id: string
  tenant_id: string
  start_date: string
  end_date: string | null
  monthly_rent: number
  security_deposit: number
  rent_due_day: number
  billing_cycle: string
  unit: { id: string; unit_number: string; floor_number: number; bedrooms: number; bathrooms: number; area_sqft: number | null }
  property: { id: string; name: string; building_name: string | null; property_type: string; address_line: string; city: string; state: string; pincode: string; amenities: string[] }
  owner: { full_name: string; email: string; phone: string | null }
}

export interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export type InvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'waived' | 'refunded'
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'netbanking' | 'bank_transfer' | 'cheque' | 'other'

export interface Invoice {
  id: string; owner_id: string; assignment_id: string; tenant_id: string; unit_id: string
  invoice_number: string; period_start: string; period_end: string; due_date: string
  amount: number; late_fee: number; discount: number; total_amount: number; paid_amount: number
  status: InvoiceStatus; created_at: string
  tenant_profiles?: { full_name: string } | null
  property_units?: { unit_number: string; properties: { name: string } | null } | null
}
export interface InvoiceItem { id: string; item_type: string; description: string; amount: number; created_at: string }
export interface Payment {
  id: string; invoice_id: string | null; tenant_id: string; amount: number; method: PaymentMethod
  status: 'pending' | 'success' | 'failed' | 'refunded'; paid_at: string; receipt_number: string | null
  notes: string | null; refunded_at: string | null; refund_reason: string | null
  tenant_profiles?: { full_name: string } | null
  rent_invoices?: { invoice_number: string } | null
}
export interface DepositRow {
  deposit_id: string; assignment_id: string; tenant_id: string; tenant_name: string; property_name: string; unit_number: string
  expected: number; received: number; deducted: number; refunded: number; held: number; status: string; tenancy_status: string
}
export interface ExpenseRow {
  id: string; property_id: string; unit_id: string | null; category_id: string | null; amount: number; expense_date: string
  description: string | null; payment_method: PaymentMethod | null; attachment_path: string | null
  properties?: { name: string } | null; expense_categories?: { name: string } | null
}
export interface MonthSummary { invoices: number; billed: number; collected: number; outstanding: number; overdue: number; paid: number }
export interface ReceiptData {
  kind: 'rent' | 'deposit'; receipt_number: string | null; amount: number; method?: string; status?: string; txn_type?: string
  paid_at: string; notes: string | null; refunded_at?: string | null; refund_reason?: string | null
  tenant_name: string; owner_name: string; owner_address: string | null; owner_phone: string | null
  invoice_number?: string; period_start?: string; period_end?: string; property_name: string; unit_number: string
}

export type MaintenanceStatus = 'new' | 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected' | 'closed'
export type Urgency = 'low' | 'medium' | 'high' | 'emergency'
export interface MaintenanceReq {
  id: string; owner_id: string; tenant_id: string; unit_id: string; title: string; category: string; description: string | null
  urgency: Urgency; status: MaintenanceStatus; preferred_visit_at: string | null; assigned_to: string | null
  repair_cost: number | null; created_at: string; closed_at: string | null
  tenant_profiles?: { full_name: string } | null
  property_units?: { unit_number: string; properties: { name: string } | null } | null
}
export interface MaintenanceComment { id: string; request_id: string; author_id: string; body: string; created_at: string }
export interface MaintenanceAttachment { id: string; request_id: string; storage_path: string; mime_type: string | null; created_at: string }
export interface DocRow {
  id: string; owner_id: string; tenant_id: string | null; doc_type: string; title: string; storage_path: string; mime_type: string | null
  size_bytes: number | null; shared_with_tenant: boolean; created_at: string; tenant_profiles?: { full_name: string } | null
}

export interface MessageThread { partner_id: string; name: string; last_body: string | null; last_at: string | null; unread: number }
export interface MessageRow { id: string; owner_id: string; sender_id: string; recipient_id: string | null; subject: string | null; body: string; read_at: string | null; created_at: string }
export interface AnnouncementRow { id: string; owner_id: string | null; property_id: string | null; title: string; body: string; audience: string; created_at: string }

export interface TicketRow { id: string; subject: string; body: string; category: string; status: string; created_at: string; updated_at: string; requester_name?: string; requester_email?: string; requester_role?: string; replies?: number }
export interface TicketReply { id: string; ticket_id: string; author_id: string; body: string; created_at: string }
export interface AdminPayment { id: string; receipt_number: string | null; paid_at: string; amount: number; method: string; status: string; gateway: string | null; gateway_payment_id: string | null; owner_name: string; tenant_name: string; invoice_number: string | null }
export interface PlanRow { id: string; name: string; price_monthly: number; max_properties: number | null; max_units: number | null; features: string[]; active: boolean }
export interface AdminSub { owner_id: string; owner_name: string; owner_email: string; plan_id: string | null; plan_name: string; status: string; period_end: string | null; properties: number; units: number; max_properties: number | null; max_units: number | null }
export interface MySubscription { plan_name: string; price_monthly: number; max_properties: number | null; max_units: number | null; features: string[]; status: string; period_end: string | null; properties: number; units: number }
