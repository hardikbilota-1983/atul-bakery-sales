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
