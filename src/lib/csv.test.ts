import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csv', () => {
  it('neutralises formula injection', () => {
    for (const bad of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) expect(csvCell(bad).replace(/^"/, '')).toMatch(/^'/)
  })
  it('keeps real numbers numeric, including negatives', () => { expect(csvCell(-50)).toBe('-50'); expect(csvCell(12.5)).toBe('12.5') })
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""'); expect(csvCell('a\nb')).toBe('"a\nb"')
  })
  it('handles null/undefined/NaN', () => { expect(csvCell(null)).toBe(''); expect(csvCell(undefined)).toBe(''); expect(csvCell(NaN)).toBe('') })
  it('builds rows with CRLF', () => { expect(toCsv(['a', 'b'], [[1, '=x']])).toBe("a,b\r\n1,'=x") })
})
