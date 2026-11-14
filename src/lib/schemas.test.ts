import { describe, expect, it } from 'vitest'
import { assignSchema, propertySchema, registerSchema, tenantSchema, unitSchema } from './schemas'

const validProperty = {
  name: 'Green Residency', property_type: 'apartment', address_line: '12 MG Road', city: 'Rayachoty', state: 'Andhra Pradesh',
  pincode: '516270', floors: '3', total_units: '5',
}

describe('propertySchema', () => {
  it('accepts a valid property and coerces numbers', () => {
    const r = propertySchema.safeParse(validProperty)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.floors).toBe(3)
  })
  it('rejects PIN codes that are not 6 digits or start with 0', () => {
    expect(propertySchema.safeParse({ ...validProperty, pincode: '51627' }).success).toBe(false)
    expect(propertySchema.safeParse({ ...validProperty, pincode: '016270' }).success).toBe(false)
  })
  it('rejects fractional or negative floors', () => {
    expect(propertySchema.safeParse({ ...validProperty, floors: '1.5' }).success).toBe(false)
    expect(propertySchema.safeParse({ ...validProperty, floors: '-1' }).success).toBe(false)
  })
})

describe('unitSchema', () => {
  const base = { unit_number: '101', floor_number: '0', bedrooms: '2', bathrooms: '1', area_sqft: '', monthly_rent: '8000', security_deposit: '16000', status: 'available' }
  it('accepts blank area', () => expect(unitSchema.safeParse(base).success).toBe(true))
  it('rejects negative rent', () => expect(unitSchema.safeParse({ ...base, monthly_rent: '-1' }).success).toBe(false))
  it('rejects a zero or non-numeric area', () => {
    expect(unitSchema.safeParse({ ...base, area_sqft: '0' }).success).toBe(false)
    expect(unitSchema.safeParse({ ...base, area_sqft: 'abc' }).success).toBe(false)
  })
})

describe('tenantSchema', () => {
  const base = { full_name: 'Asha Rao', email: '', phone: '', date_of_birth: '', identity_status: 'unverified' }
  it('allows email and phone to be blank', () => expect(tenantSchema.safeParse(base).success).toBe(true))
  it('validates Indian mobile numbers', () => {
    expect(tenantSchema.safeParse({ ...base, phone: '9515475247' }).success).toBe(true)
    expect(tenantSchema.safeParse({ ...base, phone: '+91 9515475247' }).success).toBe(true)
    expect(tenantSchema.safeParse({ ...base, phone: '1234567890' }).success).toBe(false)
  })
  it('rejects a future date of birth', () => {
    expect(tenantSchema.safeParse({ ...base, date_of_birth: '2999-01-01' }).success).toBe(false)
  })
})

describe('assignSchema', () => {
  const base = {
    tenant_id: '9f5218b2-c28c-5970-a3ea-63e5d099f1c0', unit_id: '9f5218b2-c28c-5970-a3ea-63e5d099f1c1',
    start_date: '2026-11-01', monthly_rent: '9000', security_deposit: '18000', rent_due_day: '5', billing_cycle: 'monthly',
  }
  it('accepts valid data', () => expect(assignSchema.safeParse(base).success).toBe(true))
  it('limits due day to 1-28', () => {
    expect(assignSchema.safeParse({ ...base, rent_due_day: '29' }).success).toBe(false)
    expect(assignSchema.safeParse({ ...base, rent_due_day: '0' }).success).toBe(false)
  })
})

describe('registerSchema', () => {
  const base = { full_name: 'Sam', email: 'a@b.co', phone: '', password: 'abcdefg1', confirm: 'abcdefg1' }
  it('accepts a strong password', () => expect(registerSchema.safeParse(base).success).toBe(true))
  it('rejects weak or mismatched passwords', () => {
    expect(registerSchema.safeParse({ ...base, password: 'abcdefgh', confirm: 'abcdefgh' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, confirm: 'different1' }).success).toBe(false)
  })
})
