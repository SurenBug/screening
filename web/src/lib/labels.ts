export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланирована',
  PERFORMED: 'Процедура выполнена',
  IN_LAB: 'Образец в лаборатории',
  RESULT_READY: 'Результат готов',
  RESULT_DELIVERED: 'Результат выдан',
  OUTCOME_RECORDED: 'Исход внесён',
  CLOSED: 'Закрыта',
  CANCELLED: 'Отменена',
  FAILED: 'Неудачная попытка',
}

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: '',
  PLANNED: 'blue',
  PERFORMED: 'blue',
  IN_LAB: 'amber',
  RESULT_READY: 'amber',
  RESULT_DELIVERED: 'green',
  OUTCOME_RECORDED: 'green',
  CLOSED: 'green',
  CANCELLED: '',
  FAILED: 'red',
}

/** Порядок статусов для полосы прогресса в карточке процедуры. */
export const STATUS_FLOW = [
  'PLANNED',
  'PERFORMED',
  'IN_LAB',
  'RESULT_READY',
  'RESULT_DELIVERED',
  'OUTCOME_RECORDED',
]

export const SAMPLE_STATUS_LABELS: Record<string, string> = {
  HANDED: 'Передан',
  RECEIVED: 'Принят',
  CULTURING: 'Культивирование',
  ANALYSIS: 'Анализ',
  RESULT_READY: 'Результат готов',
  ISSUED: 'Выдан',
  CONTAMINATED: 'Контаминация',
  CULTURE_FAILED: 'Неудача культивирования',
  INSUFFICIENT: 'Недостаточно материала',
}

export const SAMPLE_NEXT: Record<string, string[]> = {
  HANDED: ['RECEIVED'],
  RECEIVED: ['CULTURING', 'ANALYSIS', 'CONTAMINATED', 'INSUFFICIENT'],
  CULTURING: ['ANALYSIS', 'CULTURE_FAILED', 'CONTAMINATED'],
  ANALYSIS: ['CULTURE_FAILED', 'CONTAMINATED'],
}

export const ROLE_LABELS: Record<string, string> = {
  DOCTOR: 'Врач',
  LAB: 'Лаборатория',
  ADMIN: 'Администратор',
}

export const SEX_LABELS: Record<string, string> = {
  MALE: 'мужской',
  FEMALE: 'женский',
  UNKNOWN: 'не определён',
}

export const RHESUS_LABELS: Record<string, string> = {
  POS: 'положительный',
  NEG: 'отрицательный',
}

export const POSTNATAL_LABELS: Record<string, string> = {
  MATCH: 'диагноз совпал',
  MISMATCH: 'диагноз не совпал',
  NOT_APPLICABLE: 'не применимо',
}

export const DELIVERY_LABELS: Record<string, string> = {
  IN_PERSON: 'лично на приёме',
  PHONE: 'по телефону',
  OTHER: 'иным способом',
}

export const CHORIONICITY_LABELS: Record<string, string> = {
  MONO: 'монохориальная',
  DI: 'дихориальная',
  TRI: 'трихориальная',
}

export const AMNIONICITY_LABELS: Record<string, string> = {
  MONO: 'моноамниотическая',
  DI: 'диамниотическая',
  TRI: 'триамниотическая',
}

export const CONCEPTION_LABELS: Record<string, string> = {
  NATURAL: 'самопроизвольная',
  IVF: 'ЭКО',
  ICSI: 'ЭКО/ИКСИ',
  OVULATION_INDUCTION: 'индукция овуляции',
}

export const NASAL_BONE_LABELS: Record<string, string> = {
  PRESENT: 'визуализируется',
  ABSENT: 'не визуализируется',
  HYPOPLASTIC: 'гипоплазия',
}

export const TASK_TYPE_LABELS: Record<string, string> = {
  RESULT_OVERDUE: 'Просрочен анализ',
  DELIVER_RESULT: 'Сообщить результат',
  RECORD_OUTCOME: 'Внести исход',
  PATHOLOGY_ALERT: 'Патология',
  CUSTOM: 'Задача',
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: 'создание',
  UPDATE: 'изменение',
  DELETE: 'удаление',
  VIEW: 'просмотр',
  LOGIN: 'вход',
  LOGOUT: 'выход',
  EXPORT: 'выгрузка',
  ARCHIVE: 'архивирование',
}

export const ENTITY_LABELS: Record<string, string> = {
  Patient: 'пациентка',
  Pregnancy: 'беременность',
  Screening: 'скрининг',
  Procedure: 'процедура',
  Sample: 'образец',
  Result: 'результат',
  Outcome: 'исход',
  Fetus: 'плод',
  User: 'пользователь',
  Dictionary: 'справочник',
  Setting: 'настройки',
  Report: 'отчёт',
}
