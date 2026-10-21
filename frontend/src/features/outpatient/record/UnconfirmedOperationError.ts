/** Remote outcome is uncertain; callers branch on `kind`, never on the message text. */
export class UnconfirmedOperationError extends Error {
  readonly kind: 'clinical-document' | 'encounter-completion'

  constructor(kind: UnconfirmedOperationError['kind'], message: string) {
    super(message)
    this.name = 'UnconfirmedOperationError'
    this.kind = kind
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
