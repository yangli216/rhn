/** Only a confirmed minor is exempt from the existing adult requirement. */
export function requiresBloodPressure(birthDate: string | undefined, registeredAt: string): boolean {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return true
  const birth = new Date(`${birthDate}T00:00:00Z`)
  const visit = new Date(registeredAt)
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(visit.getTime())
    || birth.toISOString().slice(0, 10) !== birthDate) return true
  const visitDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(visit)
  if (birthDate > visitDate) return true
  const years = Number(visitDate.slice(0, 4)) - Number(birthDate.slice(0, 4))
    - (visitDate.slice(5) < birthDate.slice(5) ? 1 : 0)
  return years >= 18
}
