/**
 * Стартовое наполнение справочников.
 * Всё это редактируется администратором из интерфейса — здесь только значения по умолчанию.
 * numValue у METHOD — нормативный срок выполнения в днях (для расчёта просрочки).
 * flag у RESULT_CATEGORY — признак «патологический результат».
 */

export interface DictSeed {
  type: string
  code: string
  label: string
  numValue?: number
  flag?: boolean
  isSystem?: boolean
}

export const DICTIONARY_TYPES: Record<string, string> = {
  INDICATION: 'Показания к инвазивной диагностике',
  PROCEDURE_TYPE: 'Виды процедур',
  ACCESS: 'Доступ',
  MATERIAL_TYPE: 'Тип материала',
  METHOD: 'Методы исследования',
  RESULT_CATEGORY: 'Категории результата',
  COMPLICATION: 'Осложнения',
  OUTCOME: 'Исходы беременности',
  INSTITUTION: 'Направившие учреждения',
  PLACENTA_LOCATION: 'Расположение плаценты',
}

export const DICTIONARY_SEED: DictSeed[] = [
  // Показания
  { type: 'INDICATION', code: 'AGE', label: 'Возраст 35 лет и старше', isSystem: true },
  { type: 'INDICATION', code: 'SCREEN_RISK', label: 'Высокий риск по комбинированному скринингу', isSystem: true },
  { type: 'INDICATION', code: 'NIPT_RISK', label: 'Высокий риск по НИПТ', isSystem: true },
  { type: 'INDICATION', code: 'US_MARKERS', label: 'УЗ-маркеры хромосомной патологии', isSystem: true },
  { type: 'INDICATION', code: 'MALFORMATION', label: 'Врождённые пороки развития по УЗИ', isSystem: true },
  { type: 'INDICATION', code: 'PREV_CHILD_CA', label: 'Хромосомная патология у предыдущего ребёнка', isSystem: true },
  { type: 'INDICATION', code: 'PARENT_REARRANGEMENT', label: 'Носительство структурной перестройки у родителя', isSystem: true },
  { type: 'INDICATION', code: 'MONOGENIC', label: 'Моногенное заболевание в семье', isSystem: true },
  { type: 'INDICATION', code: 'NT_ENLARGED', label: 'Расширение ТВП 3,0 мм и более', isSystem: true },
  { type: 'INDICATION', code: 'PATIENT_REQUEST', label: 'Желание женщины', isSystem: true },

  // Виды процедур
  { type: 'PROCEDURE_TYPE', code: 'CVS', label: 'Биопсия ворсин хориона', isSystem: true },
  { type: 'PROCEDURE_TYPE', code: 'AMNIO', label: 'Амниоцентез', isSystem: true },
  { type: 'PROCEDURE_TYPE', code: 'CORDO', label: 'Кордоцентез', isSystem: true },
  { type: 'PROCEDURE_TYPE', code: 'PLACENTO', label: 'Плацентоцентез', isSystem: true },

  // Доступ
  { type: 'ACCESS', code: 'TRANSABDOMINAL', label: 'Трансабдоминальный', isSystem: true },
  { type: 'ACCESS', code: 'TRANSCERVICAL', label: 'Трансцервикальный', isSystem: true },

  // Материал
  { type: 'MATERIAL_TYPE', code: 'AMNIOTIC_FLUID', label: 'Околоплодные воды', isSystem: true },
  { type: 'MATERIAL_TYPE', code: 'CHORIONIC_VILLI', label: 'Ворсины хориона', isSystem: true },
  { type: 'MATERIAL_TYPE', code: 'PLACENTA', label: 'Ткань плаценты', isSystem: true },
  { type: 'MATERIAL_TYPE', code: 'FETAL_BLOOD', label: 'Кровь плода', isSystem: true },

  // Методы (numValue — нормативный срок, дней)
  { type: 'METHOD', code: 'QF_PCR', label: 'QF-PCR (быстрая диагностика 13/18/21/X/Y)', numValue: 3, isSystem: true },
  { type: 'METHOD', code: 'KARYOTYPE', label: 'Кариотипирование культуры клеток', numValue: 21, isSystem: true },
  { type: 'METHOD', code: 'FISH', label: 'FISH', numValue: 5, isSystem: true },
  { type: 'METHOD', code: 'CMA', label: 'Хромосомный микроматричный анализ', numValue: 21, isSystem: true },
  { type: 'METHOD', code: 'NGS_PANEL', label: 'NGS-панель', numValue: 30, isSystem: true },
  { type: 'METHOD', code: 'WES', label: 'Секвенирование экзома', numValue: 45, isSystem: true },
  { type: 'METHOD', code: 'MONOGENIC', label: 'Анализ на конкретное моногенное заболевание', numValue: 30, isSystem: true },

  // Категории результата (flag — патология)
  { type: 'RESULT_CATEGORY', code: 'NORMAL', label: 'Норма (46,XX / 46,XY)', isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'T21', label: 'Трисомия 21 (синдром Дауна)', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'T18', label: 'Трисомия 18 (синдром Эдвардса)', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'T13', label: 'Трисомия 13 (синдром Патау)', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'MONOSOMY_X', label: 'Моносомия X (синдром Шерешевского–Тёрнера)', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'SEX_ANEUPLOIDY', label: 'Другая анеуплоидия половых хромосом', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'AUTOSOMAL_ANEUPLOIDY', label: 'Другая аутосомная анеуплоидия', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'TRIPLOIDY', label: 'Триплоидия / полиплоидия', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'STRUCT_BALANCED', label: 'Структурная аберрация, сбалансированная', isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'STRUCT_UNBALANCED', label: 'Структурная аберрация, несбалансированная', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'MOSAIC', label: 'Мозаицизм', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'CNV_PATHOGENIC', label: 'Патогенная CNV', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'CNV_VUS', label: 'CNV неясного клинического значения (VUS)', isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'MONOGENIC_POSITIVE', label: 'Выявлена мутация (моногенное заболевание)', flag: true, isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'NORMAL_FOR_LOCI', label: 'Норма по исследованным локусам', isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'UNINFORMATIVE', label: 'Неинформативный результат', isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'CULTURE_FAILED', label: 'Неудача культивирования', isSystem: true },
  { type: 'RESULT_CATEGORY', code: 'MATERNAL_CONTAMINATION', label: 'Контаминация материнскими клетками', isSystem: true },

  // Осложнения
  { type: 'COMPLICATION', code: 'NONE', label: 'Без осложнений', isSystem: true },
  { type: 'COMPLICATION', code: 'AMNIOTIC_LEAK', label: 'Подтекание околоплодных вод', isSystem: true },
  { type: 'COMPLICATION', code: 'BLEEDING', label: 'Кровянистые выделения / кровотечение', isSystem: true },
  { type: 'COMPLICATION', code: 'HEMATOMA', label: 'Гематома', isSystem: true },
  { type: 'COMPLICATION', code: 'CHORIOAMNIONITIS', label: 'Хориоамнионит', isSystem: true },
  { type: 'COMPLICATION', code: 'PAIN', label: 'Выраженный болевой синдром', isSystem: true },
  { type: 'COMPLICATION', code: 'UTERINE_TONE', label: 'Повышение тонуса матки', isSystem: true },
  { type: 'COMPLICATION', code: 'PREGNANCY_LOSS_14D', label: 'Потеря беременности в течение 14 дней', isSystem: true },
  { type: 'COMPLICATION', code: 'PRETERM_LABOR', label: 'Преждевременные роды', isSystem: true },
  { type: 'COMPLICATION', code: 'FAILED_ATTEMPT', label: 'Неудачная попытка забора материала', isSystem: true },

  // Исходы
  { type: 'OUTCOME', code: 'TERM_BIRTH', label: 'Роды в срок', isSystem: true },
  { type: 'OUTCOME', code: 'PRETERM_BIRTH', label: 'Преждевременные роды', isSystem: true },
  { type: 'OUTCOME', code: 'TOP', label: 'Прерывание по медицинским показаниям', isSystem: true },
  { type: 'OUTCOME', code: 'MISCARRIAGE', label: 'Самопроизвольный выкидыш', isSystem: true },
  { type: 'OUTCOME', code: 'ANTENATAL_DEATH', label: 'Антенатальная гибель плода', isSystem: true },
  { type: 'OUTCOME', code: 'ONGOING', label: 'Беременность прогрессирует', isSystem: true },
  { type: 'OUTCOME', code: 'LOST_TO_FOLLOWUP', label: 'Потеряна из-под наблюдения', isSystem: true },

  // Расположение плаценты
  { type: 'PLACENTA_LOCATION', code: 'ANTERIOR', label: 'По передней стенке', isSystem: true },
  { type: 'PLACENTA_LOCATION', code: 'POSTERIOR', label: 'По задней стенке', isSystem: true },
  { type: 'PLACENTA_LOCATION', code: 'FUNDAL', label: 'В дне матки', isSystem: true },
  { type: 'PLACENTA_LOCATION', code: 'LATERAL', label: 'По боковой стенке', isSystem: true },
  { type: 'PLACENTA_LOCATION', code: 'PREVIA', label: 'Предлежание плаценты', isSystem: true },
]
