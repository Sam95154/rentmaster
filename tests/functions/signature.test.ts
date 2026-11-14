import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyRazorpaySignature } from '../../supabase/functions/_shared/signature'

const secret = 'whsec_test'
const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 500000 } } } })
const sig = (b: string, s = secret) => createHmac('sha256', s).update(b).digest('hex')

describe('razorpay signature verification', () => {
  it('accepts a correct signature', async () => { expect(await verifyRazorpaySignature(body, sig(body), secret)).toBe(true) })
  it('accepts uppercase hex', async () => { expect(await verifyRazorpaySignature(body, sig(body).toUpperCase(), secret)).toBe(true) })
  it('rejects a tampered body', async () => { expect(await verifyRazorpaySignature(body.replace('500000', '1'), sig(body), secret)).toBe(false) })
  it('rejects a re-serialised body (whitespace changes break the signature)', async () => { expect(await verifyRazorpaySignature(JSON.stringify(JSON.parse(body), null, 2), sig(body), secret)).toBe(false) })
  it('rejects a signature made with another secret', async () => { expect(await verifyRazorpaySignature(body, sig(body, 'other'), secret)).toBe(false) })
  it('rejects missing, empty, non-hex, odd-length and wrong-length signatures', async () => {
    for (const bad of [null, undefined, '', 'zz', 'abc', 'ab'.repeat(10), sig(body) + '00']) expect(await verifyRazorpaySignature(body, bad as string, secret)).toBe(false)
  })
  it('rejects everything when the secret is not configured', async () => {
    expect(await verifyRazorpaySignature(body, sig(body, ''), '')).toBe(false)
    expect(await verifyRazorpaySignature(body, sig(body), undefined)).toBe(false)
  })
})
