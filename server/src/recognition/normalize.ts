/**
 * Приведение распознанного текста в пригодный для разбора вид.
 * Всё, что здесь есть, — следствие реальных ошибок Tesseract на русских бланках.
 */

/** Кириллические двойники латинских букв — главная беда при распознавании кариотипа. */
const CYR_TO_LAT: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
  а: 'a', в: 'b', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', н: 'n',
}

export function toLatin(s: string): string {
  return s.replace(/[А-Яа-я]/g, (ch) => CYR_TO_LAT[ch] ?? ch)
}

/** Общая чистка: одинаковые пробелы, убранные переносы, нормальные тире. */
export function cleanText(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[«»""]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n')
}

export function lines(s: string): string[] {
  return cleanText(s).split('\n')
}

/**
 * Значение после подписи поля. Ищем строку, начинающуюся с одного из вариантов
 * названия, и берём всё после двоеточия. Если двоеточия нет — остаток строки.
 */
export function valueAfter(text: string, labels: string[]): string | null {
  for (const line of lines(text)) {
    for (const label of labels) {
      const re = new RegExp(`^\\s*${escape(label)}\\s*[:—-]?\\s*(.+)$`, 'i')
      const m = line.match(re)
      if (m && m[1].trim()) return m[1].trim()
    }
  }
  return null
}

/**
 * То же, но подпись обязана заканчиваться двоеточием. Нужно там, где название поля
 * совпадает со словом из заголовка документа: «ЗАКЛЮЧЕНИЕ ЦИТОГЕНЕТИЧЕСКОГО
 * ИССЛЕДОВАНИЯ» иначе принимается за значение поля «Заключение».
 */
export function valueAfterColon(text: string, labels: string[]): string | null {
  for (const line of lines(text)) {
    for (const label of labels) {
      const m = line.match(new RegExp(`^\\s*${escape(label)}\\s*:\\s*(.+)$`, 'i'))
      if (m && m[1].trim()) return m[1].trim()
    }
  }
  return null
}

/** Строка целиком, если в ней встречается любое из слов. */
export function lineWith(text: string, needles: string[]): string | null {
  for (const line of lines(text)) {
    const low = line.toLowerCase()
    if (needles.some((n) => low.includes(n.toLowerCase()))) return line
  }
  return null
}

export function has(text: string, needles: string[]): boolean {
  const low = text.toLowerCase()
  return needles.some((n) => low.includes(n.toLowerCase()))
}

const MONTHS: Record<string, number> = {
  январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6,
  июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12,
}

/** Дата в формате YYYY-MM-DD или null. Понимает 12.04.1982, 12/04/1982 и «12 мая 2026». */
export function parseDate(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.replace(/\s+/g, ' ').trim()

  const numeric = s.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/)
  if (numeric) {
    const d = Number(numeric[1])
    const m = Number(numeric[2])
    let y = Number(numeric[3])
    if (y < 100) y += y > 50 ? 1900 : 2000
    if (valid(y, m, d)) return iso(y, m, d)
  }

  const iso8601 = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso8601) {
    const [, y, m, d] = iso8601.map(Number)
    if (valid(y, m, d)) return iso(y, m, d)
  }

  const textual = s.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i)
  if (textual) {
    const d = Number(textual[1])
    const word = textual[2].toLowerCase()
    const key = Object.keys(MONTHS).find((k) => word.startsWith(k))
    const y = Number(textual[3])
    if (key && valid(y, MONTHS[key], d)) return iso(y, MONTHS[key], d)
  }

  return null
}

function valid(y: number, m: number, d: number) {
  return y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Число с запятой или точкой: «1,25» и «1.25» одинаково. */
export function parseNumber(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.replace(',', '.').match(/-?\d+(\.\d+)?/)
  return m ? m[0] : null
}

export function parseInt10(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/\d+/)
  return m ? m[0] : null
}

/** Риск вида 1:250, 1/250, «1 : 250» → «250» (знаменатель, как хранится в базе). */
export function parseRisk(raw: string | null): string | null {
  if (!raw) return null
  // Важна проверка «перед единицей не цифра»: в строке «Риск трисомия 21: 1:85»
  // без неё находится «21:1» и риск читается как 1:1
  const all = [...raw.matchAll(/(?<![\d,.])1\s*[:/]\s*(\d{2,6})/g)]
  if (all.length) return all[all.length - 1][1]
  // Иногда печатают «риск 0,4%» — в знаменатель не переводим, слишком легко ошибиться
  return null
}

/** Срок беременности: «17 нед 2 дн», «17+2», «17 недель». */
export function parseGestation(raw: string | null): { weeks: string; days: string } | null {
  if (!raw) return null
  const s = raw.toLowerCase()
  // \b после кириллицы не срабатывает: в JS-регулярках русские буквы не считаются
  // словесными символами, поэтому границы слова здесь задаются явно
  const full = s.match(/(\d{1,2})\s*нед\S*\s*(\d)\s*д/)
  if (full) return { weeks: full[1], days: full[2] }
  const plus = s.match(/(?<!\d)(\d{1,2})\s*\+\s*(\d)(?!\d)/)
  if (plus) return { weeks: plus[1], days: plus[2] }
  const weeksOnly = s.match(/(\d{1,2})\s*нед/)
  if (weeksOnly) return { weeks: weeksOnly[1], days: '0' }
  return null
}

/**
 * Кариотип по ISCN. Берётся из английского прохода распознавания и дочищается:
 * убираем пробелы вокруг знаков, лечим типичные подмены (\ вместо Y, l вместо 1).
 */
export function parseKaryotype(latin: string, rus: string): string | null {
  const candidates = [
    valueAfter(latin, ['Kariotip', 'Karyotype', 'Kapиотип', 'Кариотип']),
    valueAfter(rus, ['Кариотип', 'Кариотип плода', 'Результат']),
    lineWith(latin, [',XX', ',XY', ',X,', '45,X', '46,', '47,', '69,']),
    lineWith(rus, ['кариотип']),
  ].filter(Boolean) as string[]

  for (const c of candidates) {
    const fixed = toLatin(c)
      .replace(/\\/g, 'Y') // «\» вместо Y — самая частая подмена
      .replace(/[|]/g, '')
      .replace(/\s*,\s*/g, ',')
      .replace(/\s*\+\s*/g, '+')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim()

    const m = fixed.match(/\b(4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9])\s*,\s*[XY]{1,4}[^\s]*/)
    if (m) return m[0].replace(/[.,;:]+$/, '')
  }
  return null
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g
function escape(s: string) {
  return s.replace(ESCAPE_RE, '\\$&')
}
