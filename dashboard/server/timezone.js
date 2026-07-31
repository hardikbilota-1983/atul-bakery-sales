/**
 * Merchant-local calendar helpers (Clover dashboards use store timezone).
 * Default: America/New_York for Long Island / Hillside.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export function merchantTimeZone() {
  return process.env.CLOVER_TIMEZONE?.trim() || 'America/New_York'
}

/** YYYY-MM-DD in merchant timezone */
export function dayKeyInZone(date = new Date(), timeZone = merchantTimeZone()) {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd')
}

/** Start/end Date objects (UTC instants) for a calendar day in merchant TZ */
export function dayBoundsInZone(dayKey, timeZone = merchantTimeZone()) {
  const start = fromZonedTime(`${dayKey}T00:00:00.000`, timeZone)
  const end = fromZonedTime(`${dayKey}T23:59:59.999`, timeZone)
  return { start, end, dayKey }
}

export function todayBoundsInZone(timeZone = merchantTimeZone()) {
  const dayKey = dayKeyInZone(new Date(), timeZone)
  return dayBoundsInZone(dayKey, timeZone)
}

export function yesterdayBoundsInZone(timeZone = merchantTimeZone()) {
  const todayKey = dayKeyInZone(new Date(), timeZone)
  const { start } = dayBoundsInZone(todayKey, timeZone)
  const y = new Date(start.getTime() - 86400000)
  const dayKey = dayKeyInZone(y, timeZone)
  return dayBoundsInZone(dayKey, timeZone)
}
