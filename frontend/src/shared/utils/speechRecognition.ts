/**
 * Minimal typing for the browser Web Speech recognition API, which TypeScript's DOM lib does not declare.
 * Only the members used for live dictation are described; Chromium exposes it as webkitSpeechRecognition.
 */
export interface BrowserSpeechRecognitionAlternative {
  transcript: string
}

export interface BrowserSpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: BrowserSpeechRecognitionAlternative | undefined
}

export interface BrowserSpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: ArrayLike<BrowserSpeechRecognitionResult>
}

export interface BrowserSpeechRecognitionErrorEvent {
  readonly error: string
}

export interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort?(): void
}

export type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type SpeechWindow = {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

/** Returns the standard or prefixed constructor, or undefined outside a supporting browser. */
export function speechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as unknown as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}
