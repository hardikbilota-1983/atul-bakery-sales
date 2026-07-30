/** Parse Clover/Excel currency and numeric cells. */
export function parseMoney(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  let s = String(raw).trim()
  if (!s || s === '-' || s === '—' || s === 'N/A') return 0
  // Accounting negatives: ($1.23) or (1.23)
  const paren = /^\((.*)\)$/.exec(s)
  const neg = Boolean(paren)
  if (paren) s = paren[1]
  s = s.replace(/[$£€,\s]/g, '').replace(/%$/, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return neg ? -Math.abs(n) : n
}

export function parsePct(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return raw > 1 ? raw : raw * 100
  const s = String(raw).trim().replace(/%$/, '')
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
}

/** Parse "Feb 1, 2026 12:00 AM - Feb 28, 2026 11:59 PM" */
export function parseCloverPeriod(text: string): { start: Date; end: Date } | null {
  const cleaned = text.replace(/^"|"$/g, '').trim()
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}).*?-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(
    cleaned,
  )
  if (!m) return null
  const sm = MONTHS[m[1].toLowerCase()]
  const em = MONTHS[m[4].toLowerCase()]
  if (sm == null || em == null) return null
  return {
    start: new Date(Number(m[3]), sm, Number(m[2])),
    end: new Date(Number(m[6]), em, Number(m[5])),
  }
}

/** Parse period from filename like "… Mar 2026.csv" */
export function parsePeriodFromFilename(name: string): { start: Date; end: Date } | null {
  const m = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i.exec(name)
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase().slice(0, 3)]
  if (month == null) return null
  const year = Number(m[2])
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0)
  return { start, end }
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
