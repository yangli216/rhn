import { describe, expect, it } from 'vitest'
import { semanticTone } from './presentation'

describe('semanticTone', () => {
  it('keeps known tones and falls back for unknown or missing values', () => {
    expect(semanticTone('danger')).toBe('danger')
    expect(semanticTone('DANGER')).toBe('neutral')
    expect(semanticTone(undefined, 'info')).toBe('info')
  })
})
