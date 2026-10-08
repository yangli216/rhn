/** Validate an ISO timestamp without letting Date.parse normalize invalid calendar dates. */
export function isIsoInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false
  const local = Date.parse(`${value.slice(0, 19)}Z`)
  return Number.isFinite(local) && new Date(local).toISOString().slice(0, 19) === value.slice(0, 19)
}
