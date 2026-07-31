const DAY = 86_400_000
const TERM_DAYS = 280 // 40 недель

export interface DatingSource {
  lmpDate?: Date | null
  usDate?: Date | null
  usGestWeeks?: number | null
  usGestDays?: number | null
}

/**
 * Срок беременности на указанную дату, в днях.
 * Приоритет у датировки по УЗИ — она точнее, чем по последней менструации.
 * Возвращает null, если срок установить не по чему.
 */
export function gestationDaysAt(p: DatingSource, at: Date): number | null {
  if (p.usDate && (p.usGestWeeks != null || p.usGestDays != null)) {
    const base = (p.usGestWeeks ?? 0) * 7 + (p.usGestDays ?? 0)
    return base + Math.round((startOfDay(at) - startOfDay(p.usDate)) / DAY)
  }
  if (p.lmpDate) {
    return Math.round((startOfDay(at) - startOfDay(p.lmpDate)) / DAY)
  }
  return null
}

export function gestationAt(p: DatingSource, at: Date): { weeks: number; days: number } | null {
  const total = gestationDaysAt(p, at)
  if (total == null || total < 0) return null
  return { weeks: Math.floor(total / 7), days: total % 7 }
}

/** Предполагаемая дата родов. */
export function estimatedDueDate(p: DatingSource): Date | null {
  if (p.usDate && (p.usGestWeeks != null || p.usGestDays != null)) {
    const base = (p.usGestWeeks ?? 0) * 7 + (p.usGestDays ?? 0)
    return new Date(startOfDay(p.usDate) + (TERM_DAYS - base) * DAY)
  }
  if (p.lmpDate) return new Date(startOfDay(p.lmpDate) + TERM_DAYS * DAY)
  return null
}

export function formatGestation(weeks?: number | null, days?: number | null): string {
  if (weeks == null && days == null) return ''
  return `${weeks ?? 0} нед ${days ?? 0} дн`
}

/**
 * Рекомендуемые сроки для инвазивных процедур — используются для мягкого
 * предупреждения в мастере, а не для запрета.
 */
export const PROCEDURE_WINDOWS: Record<string, { minWeeks: number; maxWeeks: number }> = {
  CVS: { minWeeks: 10, maxWeeks: 14 },
  AMNIO: { minWeeks: 16, maxWeeks: 22 },
  CORDO: { minWeeks: 19, maxWeeks: 40 },
  PLACENTO: { minWeeks: 14, maxWeeks: 20 },
}

export function checkProcedureWindow(type: string | null | undefined, weeks: number | null | undefined) {
  if (!type || weeks == null) return null
  const w = PROCEDURE_WINDOWS[type]
  if (!w) return null
  if (weeks < w.minWeeks || weeks > w.maxWeeks) {
    return `Срок ${weeks} нед вне рекомендуемого окна для этой процедуры (${w.minWeeks}–${w.maxWeeks} нед)`
  }
  return null
}

function startOfDay(d: Date | number): number {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function age(birthDate: Date, at: Date = new Date()): number {
  let years = at.getFullYear() - birthDate.getFullYear()
  const m = at.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < birthDate.getDate())) years--
  return years
}
