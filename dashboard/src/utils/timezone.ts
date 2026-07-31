import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

/** Must match server CLOVER_TIMEZONE default */
export const MERCHANT_TZ = 'America/New_York'

export function dayKeyInZone(date: Date = new Date(), timeZone = MERCHANT_TZ): string {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd')
}

export function dayBoundsInZone(dayKey: string, timeZone = MERCHANT_TZ) {
  const start = fromZonedTime(`${dayKey}T00:00:00.000`, timeZone)
  const end = fromZonedTime(`${dayKey}T23:59:59.999`, timeZone)
  return { start, end, dayKey }
}

/** Inclusive list of YYYY-MM-DD keys from startKey → endKey in merchant TZ. */
export function eachDayKey(startKey: string, endKey: string, timeZone = MERCHANT_TZ): string[] {
  if (!startKey || !endKey || startKey > endKey) return []
  const out: string[] = []
  let cursor = startKey
  while (cursor <= endKey) {
    out.push(cursor)
    const { end } = dayBoundsInZone(cursor, timeZone)
    cursor = dayKeyInZone(new Date(end.getTime() + 1), timeZone)
    if (out.length > 400) break
  }
  return out
}

export function rangeFullyCached(
  startKey: string,
  endKey: string,
  cached: Iterable<string>,
  timeZone = MERCHANT_TZ,
): boolean {
  const set = cached instanceof Set ? cached : new Set(cached)
  if (!set.size) return false
  const days = eachDayKey(startKey, endKey, timeZone)
  if (!days.length) return true
  return days.every((d) => set.has(d))
}
