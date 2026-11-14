import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../../src/lib/utils'

describe('safeRedirect', () => {
  it('keeps same-site paths', () => {
    expect(safeRedirect('/owner/invoices')).toBe('/owner/invoices')
    expect(safeRedirect('/owner/invoices?page=2')).toBe('/owner/invoices?page=2')
  })
  it.each(['//evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/ x', '/a:b', '', undefined, null, 5, '/login'])('rejects %s', (v) => {
    expect(safeRedirect(v)).toBe('/app')
  })
})
