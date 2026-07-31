export function fmtDate(d?: string | Date | null): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU')
}

export function fmtDateTime(d?: string | Date | null): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Значение для <input type="date"> */
export function toInputDate(d?: string | Date | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  const tz = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - tz).toISOString().slice(0, 10)
}

export function fmtGest(weeks?: number | null, days?: number | null): string {
  if (weeks == null && days == null) return '—'
  return `${weeks ?? 0} нед ${days ?? 0} дн`
}

export function fmtAge(birthDate?: string | null, at?: string | null): string {
  if (!birthDate) return '—'
  const b = new Date(birthDate)
  const d = at ? new Date(at) : new Date()
  let years = d.getFullYear() - b.getFullYear()
  const m = d.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) years--
  return `${years}`
}

export function fmtRisk(v?: number | null): string {
  return v ? `1:${v}` : '—'
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`
  return `${n} ${many}`
}

export function num(v: string): number | null {
  if (v === '' || v == null) return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function int(v: string): number | null {
  if (v === '' || v == null) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}
