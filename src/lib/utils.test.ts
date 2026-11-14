import { describe, expect, it } from 'vitest'
import { formatDate, formatINR, humanize, initials, isUuid, likeTerm, parseAmenities, todayISO } from './utils'

describe('utils', () => {
  it('formats INR with Indian digit grouping', () => {
    expect(formatINR(1234567)).toContain('12,34,567')
    expect(formatINR(null)).toContain('0')
    expect(formatINR('abc')).toContain('0')
  })
  it('formats date-only strings without timezone shift', () => {
    expect(formatDate('2026-11-10')).toBe('10 Nov 2026')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })
  it('builds initials', () => {
    expect(initials('Shaik Sameer Basha')).toBe('SB')
    expect(initials('  ')).toBe('?')
  })
  it('humanizes snake case', () => {
    expect(humanize('under_maintenance')).toBe('Under maintenance')
  })
  it('parses amenities and removes duplicates', () => {
    expect(parseAmenities('Lift, Parking, lift, Parking ,')).toEqual(['Lift', 'Parking', 'lift'])
    expect(parseAmenities(undefined)).toEqual([])
  })
  it('strips ILIKE wildcards from search text', () => {
    expect(likeTerm('50%_off,(x)')).toBe('50offx')
  })
  it('detects uuids', () => {
    expect(isUuid('9f5218b2-c28c-5970-a3ea-63e5d099f1c0')).toBe(true)
    expect(isUuid('properties')).toBe(false)
  })
  it('returns an ISO local date', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
