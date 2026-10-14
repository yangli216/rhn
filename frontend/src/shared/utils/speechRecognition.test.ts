import { afterEach, describe, expect, it, vi } from 'vitest'
import { speechRecognitionConstructor } from './speechRecognition'

describe('speechRecognitionConstructor', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('prefers the standard constructor and falls back to the webkit prefix', () => {
    class Standard {}
    class Prefixed {}
    vi.stubGlobal('webkitSpeechRecognition', Prefixed)
    expect(speechRecognitionConstructor()).toBe(Prefixed)
    vi.stubGlobal('SpeechRecognition', Standard)
    expect(speechRecognitionConstructor()).toBe(Standard)
  })

  it('reports no support when the browser exposes neither constructor', () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', undefined)
    expect(speechRecognitionConstructor()).toBeUndefined()
  })
})
