import { describe, it, expect } from 'vitest'
import { stripHtml } from '@/lib/utils'

describe('stripHtml', () => {
  it('strips simple HTML tags', () => {
    expect(stripHtml('<p>Hello world</p>')).toBe('Hello world')
  })

  it('strips nested tags', () => {
    expect(stripHtml('<p><strong>Bold</strong> and <em>italic</em></p>')).toBe('Bold and italic')
  })

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })

  it('handles plain text without tags', () => {
    expect(stripHtml('No tags here')).toBe('No tags here')
  })

  it('collapses multiple whitespace', () => {
    expect(stripHtml('<p>  Multiple   spaces  </p>')).toBe('Multiple spaces')
  })

  it('handles TipTap-style rich content', () => {
    const html = '<p>Discussed <strong>Q3</strong> roadmap with the team</p>'
    expect(stripHtml(html)).toBe('Discussed Q3 roadmap with the team')
  })

  it('strips self-closing tags', () => {
    expect(stripHtml('Line one<br/>Line two')).toBe('Line one Line two')
  })
})
