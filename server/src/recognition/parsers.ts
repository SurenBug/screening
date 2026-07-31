import {
  has,
  lineWith,
  parseDate,
  parseGestation,
  parseInt10,
  parseKaryotype,
  parseNumber,
  parseRisk,
  toLatin,
  valueAfter,
  valueAfterColon,
} from './normalize.js'
import type { OcrResult } from './ocr.js'

export type DocType = 'LAB_REPORT' | 'REFERRAL' | 'ULTRASOUND' | 'NIPT' | 'UNKNOWN'

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  LAB_REPORT: 'Заключение цитогенетика',
  REFERRAL: 'Направление на процедуру',
  ULTRASOUND: 'Протокол УЗИ / скрининга',
  NIPT: 'Результат НИПТ',
  UNKNOWN: 'Тип документа не определён',
}

export interface Field {
  key: string
  label: string
  value: string
  /** 0..100 — насколько можно доверять именно этому полю */
  confidence: number
  /** фрагмент исходного текста, чтобы врач мог свериться */
  source?: string
}

/**
 * Уверенность поля складывается из уверенности распознавания страницы и того,
 * насколько однозначно значение было найдено: у поля с явной подписью
 * («Кариотип: …») доверия больше, чем у угаданного по контексту.
 */
const SURE = 1.0 // нашли по подписи и разобрали без домыслов
const LIKELY = 0.8 // нашли по ключевому слову в строке
const GUESS = 0.55 // вывели из смысла (например, пол из кариотипа)

function field(
  key: string,
  label: string,
  value: string | null | undefined,
  ocr: number,
  factor = SURE,
  source?: string | null,
): Field | null {
  if (value == null || value === '') return null
  return {
    key,
    label,
    value: String(value),
    confidence: Math.max(5, Math.min(99, Math.round(ocr * factor))),
    source: source ?? undefined,
  }
}

// ───────────────────────── Определение типа документа ─────────────────────────

const SIGNATURES: { type: DocType; words: string[]; weight: number }[] = [
  { type: 'LAB_REPORT', words: ['кариотип', 'цитогенетич', 'метафаз', 'культивирован', 'iscn'], weight: 3 },
  { type: 'LAB_REPORT', words: ['заключение', 'исследование материала', 'амниоцит'], weight: 1 },
  { type: 'NIPT', words: ['нипт', 'неинвазивн', 'внеклеточн', 'cffdna', 'cell-free'], weight: 3 },
  { type: 'ULTRASOUND', words: ['твп', 'воротниковог', 'копчико-теменн', 'ктр', 'papp', 'мом', 'скрининг'], weight: 3 },
  { type: 'ULTRASOUND', words: ['ультразвуков', 'узи', 'фетометри'], weight: 1 },
  { type: 'REFERRAL', words: ['направление', 'направляется', 'на инвазивную', 'показани'], weight: 3 },
  { type: 'REFERRAL', words: ['женская консультация', 'жк №', 'амбулаторн'], weight: 1 },
]

export function detectDocType(text: string): { type: DocType; score: number } {
  const low = text.toLowerCase()
  const scores = new Map<DocType, number>()
  for (const sig of SIGNATURES) {
    const hits = sig.words.filter((w) => low.includes(w)).length
    if (hits) scores.set(sig.type, (scores.get(sig.type) ?? 0) + hits * sig.weight)
  }
  let best: DocType = 'UNKNOWN'
  let bestScore = 0
  for (const [type, score] of scores) {
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }
  return { type: bestScore >= 3 ? best : 'UNKNOWN', score: bestScore }
}

// ───────────────────────── Сопоставление со справочниками ─────────────────────────

function matchCode(text: string, table: [string, string[]][]): string | null {
  const low = text.toLowerCase()
  for (const [code, words] of table) {
    if (words.some((w) => low.includes(w))) return code
  }
  return null
}

const METHODS: [string, string[]][] = [
  ['QF_PCR', ['qf-pcr', 'qf pcr', 'кф-пцр', 'количественная флуоресцентная']],
  ['FISH', ['fish', 'фиш', 'флуоресцентная гибридизация']],
  ['CMA', ['микроматрич', 'хма', 'array cgh', 'snp-array', 'хромосомный микроматричный']],
  ['WES', ['экзом']],
  ['NGS_PANEL', ['ngs', 'секвенирование нового поколения', 'панель']],
  ['MONOGENIC', ['моногенн', 'мутаци']],
  ['KARYOTYPE', ['кариотипирован', 'культуры клеток', 'gtg', 'стg', 'g-окраск', 'метафаз']],
]

const MATERIALS: [string, string[]][] = [
  ['AMNIOTIC_FLUID', ['околоплодн', 'амниотическ', 'амниоцит', 'воды']],
  ['CHORIONIC_VILLI', ['ворсин', 'хорион']],
  ['PLACENTA', ['плацент']],
  ['FETAL_BLOOD', ['кровь плода', 'пуповинн', 'кордоцентез']],
]

const PROCEDURES: [string, string[]][] = [
  ['CVS', ['биопсия ворсин', 'бвх', 'аспирация ворсин', 'хорионбиопси']],
  ['AMNIO', ['амниоцентез']],
  ['CORDO', ['кордоцентез']],
  ['PLACENTO', ['плацентоцентез']],
]

const INDICATIONS: [string, string[]][] = [
  ['PREV_CHILD_CA', ['предыдущего ребёнка', 'предыдущего ребенка', 'ребёнок с хромосомн', 'отягощённый генетическ']],
  ['PARENT_REARRANGEMENT', ['транслокац', 'перестройк', 'носительство']],
  ['MONOGENIC', ['моногенн', 'наследственное заболевание']],
  ['NIPT_RISK', ['нипт', 'неинвазивн']],
  ['NT_ENLARGED', ['твп', 'воротниковог']],
  ['MALFORMATION', ['порок', 'впр', 'аномали']],
  ['US_MARKERS', ['маркер', 'узи-маркер', 'эхографическ']],
  ['SCREEN_RISK', ['высокий риск', 'скрининг', 'риск по']],
  ['AGE', ['возраст', 'старше 35', '35 лет']],
  ['PATIENT_REQUEST', ['желани', 'по собственному']],
]

/**
 * Категория результата. Сначала пробуем по кариотипу — он однозначен,
 * затем по словесному заключению.
 */
function detectCategory(karyotype: string | null, text: string): { code: string; sure: boolean } | null {
  const k = karyotype ? toLatin(karyotype).toUpperCase().replace(/\s/g, '') : ''
  if (k) {
    if (/\+21/.test(k)) return { code: 'T21', sure: true }
    if (/\+18/.test(k)) return { code: 'T18', sure: true }
    if (/\+13/.test(k)) return { code: 'T13', sure: true }
    if (/^45,X(?!X|Y)/.test(k)) return { code: 'MONOSOMY_X', sure: true }
    if (/^47,(XXY|XXX|XYY)/.test(k)) return { code: 'SEX_ANEUPLOIDY', sure: true }
    if (/^(69|92),/.test(k)) return { code: 'TRIPLOIDY', sure: true }
    if (/MOS|\/\d{2},/.test(k)) return { code: 'MOSAIC', sure: true }
    if (/T\(|DER\(|INV\(|DEL\(|DUP\(|ADD\(/.test(k)) {
      return { code: has(text, ['несбалансир']) ? 'STRUCT_UNBALANCED' : 'STRUCT_BALANCED', sure: false }
    }
    if (/^46,(XX|XY)$/.test(k)) return { code: 'NORMAL', sure: true }
  }

  const low = text.toLowerCase()
  if (has(low, ['мозаи'])) return { code: 'MOSAIC', sure: false }
  if (has(low, ['дауна'])) return { code: 'T21', sure: false }
  if (has(low, ['эдвардса'])) return { code: 'T18', sure: false }
  if (has(low, ['патау'])) return { code: 'T13', sure: false }
  if (has(low, ['шерешевск', 'тернера', 'тёрнера'])) return { code: 'MONOSOMY_X', sure: false }
  if (has(low, ['клайнфельтер'])) return { code: 'SEX_ANEUPLOIDY', sure: false }
  if (has(low, ['неудача культивирован', 'культура не выросла', 'рост культуры отсутств'])) {
    return { code: 'CULTURE_FAILED', sure: false }
  }
  if (has(low, ['контаминац', 'примесь материнск'])) return { code: 'MATERNAL_CONTAMINATION', sure: false }
  if (has(low, ['неинформатив'])) return { code: 'UNINFORMATIVE', sure: false }
  if (has(low, ['патогенн'])) return { code: 'CNV_PATHOGENIC', sure: false }
  if (has(low, ['неясного значения', 'vus'])) return { code: 'CNV_VUS', sure: false }
  if (has(low, ['патологии не выявлено', 'норма', 'без патологии', 'не выявлено'])) {
    return { code: 'NORMAL', sure: false }
  }
  return null
}

// ───────────────────────── Разбор по типам документов ─────────────────────────

export function parseFields(docType: DocType, ocr: OcrResult): Field[] {
  const { text, latinText, confidence: c } = ocr
  switch (docType) {
    case 'LAB_REPORT':
      return labReport(text, latinText, c)
    case 'REFERRAL':
      return referral(text, c)
    case 'ULTRASOUND':
      return ultrasound(text, latinText, c)
    case 'NIPT':
      return nipt(text, c)
    default:
      // Тип не определён — отдаём то, что удаётся вытащить в любом документе
      return [
        ...person(text, c),
        ...([field('reportedAt', 'Дата документа', parseDate(firstDate(text)), c, LIKELY)].filter(Boolean) as Field[]),
      ]
  }
}

function labReport(text: string, latin: string, c: number): Field[] {
  const karyotype = parseKaryotype(latin, text)
  const category = detectCategory(karyotype, text)
  const method = matchCode(text, METHODS)
  const material = matchCode(text, MATERIALS)

  const sexRaw = valueAfter(text, ['Пол плода', 'Пол'])
  let sex: string | null = null
  let sexSure = LIKELY
  if (sexRaw) sex = /муж/i.test(sexRaw) ? 'MALE' : /жен/i.test(sexRaw) ? 'FEMALE' : null
  if (!sex && karyotype) {
    const k = toLatin(karyotype).toUpperCase()
    sex = /,X{1,2}Y/.test(k) ? 'MALE' : /,XX(?!Y)/.test(k) ? 'FEMALE' : null
    sexSure = GUESS
  }

  const conclusion =
    valueAfterColon(text, ['Заключение', 'Результат исследования', 'Вывод']) ?? lineWith(text, ['выявлен', 'обнаружен'])

  return compact([
    ...person(text, c),
    field('materialType', 'Материал', material, c, LIKELY, lineWith(text, ['материал'])),
    field('method', 'Метод', method, c, LIKELY, lineWith(text, ['метод'])),
    field(
      'reportedAt',
      'Дата готовности',
      parseDate(valueAfter(text, ['Дата выдачи заключения', 'Дата выдачи', 'Дата заключения', 'Дата исследования'])) ??
        parseDate(lastDate(text)),
      c,
      valueAfter(text, ['Дата выдачи заключения', 'Дата выдачи']) ? SURE : GUESS,
    ),
    field('metaphases', 'Проанализировано метафаз', parseInt10(valueAfter(text, ['Проанализировано метафаз', 'Метафаз', 'Изучено метафаз'])), c),
    field('bandingLevel', 'Уровень разрешения', bandingLevel(latin, text), c, LIKELY),
    field('category', 'Категория результата', category?.code, c, category?.sure ? LIKELY : GUESS, conclusion),
    field('karyotype', 'Кариотип', karyotype, c, karyotype ? SURE : GUESS, lineWith(text, ['кариотип'])),
    field('sex', 'Пол плода', sex, c, sexSure),
    field('conclusion', 'Заключение', conclusion, c, LIKELY),
  ])
}

function referral(text: string, c: number): Field[] {
  const gest = parseGestation(lineWith(text, ['срок', 'недел']))
  const rhLine = lineWith(text, ['резус', 'rh'])
  const rhesus = rhLine ? (/отриц|neg|\(-\)|\bотр\b/i.test(rhLine) ? 'NEG' : /полож|pos|\(\+\)/i.test(rhLine) ? 'POS' : null) : null

  const fio = valueAfter(text, ['ФИО', 'Пациентка', 'Ф.И.О', 'Фамилия, имя, отчество'])
  const parts = fio ? fio.replace(/[^А-Яа-яЁё\s-]/g, '').trim().split(/\s+/) : []

  return compact([
    field('lastName', 'Фамилия', parts[0], c),
    field('firstName', 'Имя', parts[1], c),
    field('middleName', 'Отчество', parts[2], c),
    field('birthDate', 'Дата рождения', parseDate(valueAfter(text, ['Дата рождения', 'Д.р', 'Год рождения'])), c),
    field('phone', 'Телефон', phone(text), c, LIKELY),
    field('cardNumber', 'Номер карты', valueAfter(text, ['Номер карты', '№ карты', 'История болезни', 'Амбулаторная карта']), c),
    field('referringInstitution', 'Направившее учреждение', valueAfter(text, ['Направившее учреждение', 'Учреждение', 'Направлена из', 'Кем направлена']), c),
    field('bloodGroup', 'Группа крови', bloodGroup(text), c, LIKELY, lineWith(text, ['группа крови'])),
    field('rhesus', 'Резус-фактор', rhesus, c, LIKELY, rhLine),
    field('indication', 'Показание', matchCode(text, INDICATIONS), c, GUESS, lineWith(text, ['показани'])),
    field('riskT21', 'Риск Т21 (1:X)', parseRisk(lineWith(text, ['риск'])), c, LIKELY, lineWith(text, ['риск'])),
    field('gestWeeks', 'Срок, недель', gest?.weeks, c, LIKELY),
    field('gestDays', 'Срок, дней', gest?.days, c, LIKELY),
    field('procedureType', 'Вид процедуры', matchCode(text, PROCEDURES), c, LIKELY),
  ])
}

function ultrasound(text: string, latin: string, c: number): Field[] {
  const gest = parseGestation(lineWith(text, ['срок', 'недел']))
  const nbLine = lineWith(text, ['носовая кость', 'носовой кости'])
  const nasalBone = nbLine
    ? /не визуал|отсутств|гипоплаз/i.test(nbLine)
      ? /гипоплаз/i.test(nbLine)
        ? 'HYPOPLASTIC'
        : 'ABSENT'
      : 'PRESENT'
    : null

  return compact([
    field('date', 'Дата исследования', parseDate(valueAfter(text, ['Дата исследования', 'Дата УЗИ', 'Дата'])) ?? parseDate(firstDate(text)), c, LIKELY),
    field('gestWeeks', 'Срок, недель', gest?.weeks, c, LIKELY),
    field('gestDays', 'Срок, дней', gest?.days, c, LIKELY),
    field('crl', 'КТР, мм', parseNumber(valueAfter(text, ['КТР', 'Копчико-теменной размер', 'CRL'])), c),
    field('ntMm', 'ТВП, мм', parseNumber(valueAfter(text, ['ТВП', 'Толщина воротникового пространства', 'NT'])), c),
    field('nasalBone', 'Носовая кость', nasalBone, c, LIKELY, nbLine),
    field('pappaMom', 'PAPP-A, МоМ', mom(text, latin, ['papp', 'папп']), c, LIKELY),
    field('hcgMom', 'β-ХГЧ, МоМ', mom(text, latin, ['хгч', 'hcg', 'бета-хгч']), c, LIKELY),
    field('riskT21', 'Риск Т21 (1:X)', parseRisk(lineWith(text, ['трисомия 21', 'т21', 'дауна', 'риск'])), c, LIKELY),
    field('riskT18', 'Риск Т18 (1:X)', parseRisk(lineWith(text, ['трисомия 18', 'т18', 'эдвардса'])), c, LIKELY),
    field('riskT13', 'Риск Т13 (1:X)', parseRisk(lineWith(text, ['трисомия 13', 'т13', 'патау'])), c, LIKELY),
    field('riskProgram', 'Программа расчёта', program(text, latin), c, LIKELY),
    field('usFindings', 'УЗ-маркеры', valueAfter(text, ['Маркеры', 'УЗ-маркеры', 'Эхографические маркеры']), c, LIKELY),
    field('malformations', 'Пороки развития', valueAfter(text, ['Пороки развития', 'ВПР', 'Аномалии']), c, LIKELY),
  ])
}

function nipt(text: string, c: number): Field[] {
  return compact([
    field('niptDate', 'Дата исследования', parseDate(valueAfter(text, ['Дата исследования', 'Дата взятия', 'Дата'])) ?? parseDate(firstDate(text)), c, LIKELY),
    field('niptLab', 'Лаборатория', valueAfter(text, ['Лаборатория', 'Выполнено в', 'Медицинский центр']), c, LIKELY),
    field('niptResult', 'Результат', valueAfterColon(text, ['Результат', 'Заключение', 'Вывод']) ?? lineWith(text, ['риск']), c, LIKELY),
    field('riskT21', 'Риск Т21 (1:X)', parseRisk(lineWith(text, ['трисомия 21', 'т21', 'дауна'])), c, LIKELY),
    field('riskT18', 'Риск Т18 (1:X)', parseRisk(lineWith(text, ['трисомия 18', 'т18'])), c, LIKELY),
    field('riskT13', 'Риск Т13 (1:X)', parseRisk(lineWith(text, ['трисомия 13', 'т13'])), c, LIKELY),
  ])
}

// ───────────────────────── Мелкие извлекатели ─────────────────────────

function person(text: string, c: number): Field[] {
  return compact([
    field('patientName', 'Пациентка', valueAfter(text, ['Пациентка', 'ФИО', 'Ф.И.О', 'Пациент']), c, LIKELY),
    field('patientBirthDate', 'Дата рождения', parseDate(valueAfter(text, ['Дата рождения', 'Год рождения', 'Д.р'])), c),
  ])
}

function bandingLevel(latin: string, rus: string): string | null {
  const line = lineWith(latin, ['GTG', 'GTC', 'CTC', 'банд']) ?? lineWith(rus, ['окраск', 'разрешен'])
  if (!line) return null
  const m = toLatin(line).match(/(\d{3,4})\s*(GTG|G|band)?/i)
  return m ? `${m[1]} GTG` : null
}

function mom(rus: string, latin: string, needles: string[]): string | null {
  // PAPP-A русская модель распознаёт как «РАРР-А» кириллицей — ищем в обоих написаниях
  const line =
    lineWith(rus, needles) ??
    lineWith(latin, needles) ??
    lineWith(toLatin(rus), needles) ??
    lineWith(toLatin(latin), needles)
  if (!line) return null
  // В строке обычно два числа: концентрация и МоМ. МоМ — то, что рядом со словом «МоМ»
  // «МоМ» встречается и кириллицей, и латиницей — принимаем оба написания
  const momPart =
    line.match(/([\d.,]+)\s*(?:мом|mom)/i) ?? line.match(/(?:мом|mom)\D{0,4}([\d.,]+)/i)
  return parseNumber(momPart ? momPart[1] : line)
}

function program(text: string, latin: string): string | null {
  const low = (text + '\n' + latin + '\n' + toLatin(text)).toLowerCase()
  for (const p of ['astraia', 'prisca', 'lifecycle', 'fmf']) {
    if (low.includes(p)) return p.toUpperCase()
  }
  return null
}

function bloodGroup(text: string): string | null {
  const line = lineWith(text, ['группа крови', 'группа кров'])
  if (!line) return null
  // Римские цифры распознаются плохо: «A(II)» превращается в «А(!)».
  // Поэтому группу определяем по букве — она однозначна и читается надёжнее.
  const l = toLatin(line).toUpperCase().replace(/\s/g, '')
  const m = l.match(/КРОВИ|KPOBИ|KROVI|:/) ? l.split(':').slice(1).join(':') : l
  if (/\bAB\b|AB\(/.test(m)) return 'AB(IV)'
  if (/\bB\b|B\(/.test(m)) return 'B(III)'
  if (/\bA\b|A\(/.test(m)) return 'A(II)'
  if (/\b[O0]\b|[O0]\(/.test(m)) return 'O(I)'
  return null
}

function phone(text: string): string | null {
  const m = text.match(/(\+?7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/)
  return m ? m[0].replace(/[^\d+]/g, '') : null
}

function firstDate(text: string): string | null {
  const m = text.match(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/)
  return m ? m[0] : null
}

function lastDate(text: string): string | null {
  const all = text.match(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/g)
  return all ? all[all.length - 1] : null
}

function compact(items: (Field | null)[]): Field[] {
  return items.filter((f): f is Field => f !== null)
}
