export type Role = 'DOCTOR' | 'LAB' | 'ADMIN'

export interface User {
  id: string
  login: string
  fullName: string
  position?: string | null
  role: Role
  isActive?: boolean
  mustChangePassword?: boolean
  telegramId?: string | null
}

export interface DictItem {
  id: string
  type: string
  code: string
  label: string
  numValue?: number | null
  flag: boolean
  sortOrder: number
  isActive: boolean
  isSystem: boolean
}

export interface Dictionaries {
  types: Record<string, string>
  items: Record<string, DictItem[]>
}

export interface PatientRow {
  id: string
  code: string
  fullName: string
  birthDate: string
  age: number
  phone?: string | null
  cardNumber?: string | null
  rhesus?: string | null
  referringInstitution?: string | null
  pregnancyCount: number
  lastProcedure?: { id: string; code: string; status: string; procedureType?: string | null; performedAt?: string | null } | null
  archivedAt?: string | null
}

export interface Outcome {
  id: string
  fetusId: string
  outcomeType?: string | null
  date?: string | null
  gestWeeks?: number | null
  gestDays?: number | null
  birthWeight?: number | null
  apgar1?: number | null
  apgar5?: number | null
  childCondition?: string | null
  postnatalConfirmation?: string | null
  postnatalDiagnosis?: string | null
  procedureRelatedLoss?: boolean
  notes?: string | null
}

export interface Fetus {
  id: string
  label: string
  sex?: string | null
  notes?: string | null
  outcome?: Outcome | null
}

export interface Screening {
  id: string
  pregnancyId: string
  fetusId?: string | null
  trimester?: number | null
  date?: string | null
  gestWeeks?: number | null
  gestDays?: number | null
  crl?: number | null
  ntMm?: number | null
  nasalBone?: string | null
  ductusVenosus?: string | null
  tricuspidRegurg?: string | null
  pappaMom?: number | null
  hcgMom?: number | null
  afpMom?: number | null
  riskT21?: number | null
  riskT18?: number | null
  riskT13?: number | null
  riskProgram?: string | null
  niptDone?: boolean
  niptDate?: string | null
  niptLab?: string | null
  niptResult?: string | null
  usFindings?: string | null
  malformations?: string | null
  notes?: string | null
}

export interface Result {
  id: string
  sampleId: string
  method: string
  reportedAt?: string | null
  metaphases?: number | null
  bandingLevel?: string | null
  quality?: string | null
  category?: string | null
  isPathological: boolean
  karyotype?: string | null
  sex?: string | null
  conclusion?: string | null
  deliveredAt?: string | null
  deliveryMethod?: string | null
  deliveredByName?: string | null
  performedBy?: { id: string; fullName: string } | null
  verifiedBy?: { id: string; fullName: string } | null
}

export interface Sample {
  id: string
  code: string
  fetusId?: string | null
  fetus?: { id: string; label: string } | null
  materialType?: string | null
  volume?: string | null
  containerNumber?: string | null
  quality?: string | null
  handedAt?: string | null
  receivedAt?: string | null
  deadline?: string | null
  status: string
  notes?: string | null
  methods: { dictionaryId: string; dictionary: DictItem }[]
  results: Result[]
}

export interface Procedure {
  id: string
  code: string
  pregnancyId: string
  status: string
  plannedDate?: string | null
  performedAt?: string | null
  gestWeeks?: number | null
  gestDays?: number | null
  procedureType?: string | null
  access?: string | null
  needleGauge?: string | null
  punctureCount?: number | null
  placentaLocation?: string | null
  usDevice?: string | null
  antibioticProphylaxis?: boolean
  antiDIndicated?: boolean
  antiDGiven?: boolean
  antiDDate?: string | null
  antiDDose?: string | null
  riskValue?: number | null
  indicationNotes?: string | null
  operatorId?: string | null
  assistantId?: string | null
  operator?: { id: string; fullName: string } | null
  assistant?: { id: string; fullName: string } | null
  technicalNotes?: string | null
  notes?: string | null
  cancelReason?: string | null
  failureReason?: string | null
  indications: { dictionaryId: string; dictionary: DictItem }[]
  complications: { id: string; dictionaryId: string; dictionary: DictItem; daysAfter?: number | null; notes?: string | null }[]
  samples: Sample[]
  pregnancy?: Pregnancy & { patient: Patient }
  warnings?: string[]
}

export interface Pregnancy {
  id: string
  patientId: string
  number?: number | null
  lmpDate?: string | null
  usDate?: string | null
  usGestWeeks?: number | null
  usGestDays?: number | null
  edd?: string | null
  plurality: string
  fetusCount: number
  chorionicity?: string | null
  amnionicity?: string | null
  conception?: string | null
  notes?: string | null
  fetuses: Fetus[]
  screenings: Screening[]
  procedures: Procedure[]
  currentGestation?: { weeks: number; days: number } | null
}

export interface Patient {
  id: string
  code: string
  fullName?: string
  lastName: string
  firstName: string
  middleName?: string | null
  birthDate: string
  age?: number
  phone?: string | null
  cardNumber?: string | null
  bloodGroup?: string | null
  rhesus?: string | null
  address?: string | null
  referringInstitution?: string | null
  snils?: string | null
  policy?: string | null
  gravida?: number | null
  para?: number | null
  abortions?: number | null
  miscarriages?: number | null
  stillbirths?: number | null
  ivf?: boolean
  consanguinity?: boolean
  familyHistory?: string | null
  obstetricHistory?: string | null
  geneticHistory?: string | null
  teratogens?: string | null
  chronicDiseases?: string | null
  notes?: string | null
  archivedAt?: string | null
  pregnancies: Pregnancy[]
  createdBy?: { id: string; fullName: string }
}

export interface JournalRow {
  id: string
  code: string
  status: string
  performedAt?: string | null
  plannedDate?: string | null
  procedureType?: string | null
  gestWeeks?: number | null
  gestDays?: number | null
  operator?: { id: string; fullName: string } | null
  patient: { id: string; code: string; fullName: string; rhesus?: string | null; birthDate: string }
  pregnancyId: string
  plurality: string
  indications: { code: string; label: string }[]
  complications: { code: string; label: string }[]
  samples: { id: string; code: string; status: string; fetus?: { label: string } | null; deadline?: string | null; methods: string[] }[]
  results: { id: string; category?: string | null; karyotype?: string | null; isPathological: boolean; reportedAt?: string | null; deliveredAt?: string | null }[]
  hasPathology: boolean
}

export interface LabSample {
  id: string
  code: string
  status: string
  materialType?: string | null
  volume?: string | null
  containerNumber?: string | null
  quality?: string | null
  handedAt?: string | null
  receivedAt?: string | null
  deadline?: string | null
  overdue: boolean
  daysLeft?: number | null
  labUser?: { id: string; fullName: string } | null
  fetus?: { id: string; label: string } | null
  methods: { id: string; code: string; label: string }[]
  resultCount: number
  procedure: {
    id: string
    code: string
    procedureType?: string | null
    performedAt?: string | null
    gestWeeks?: number | null
    gestDays?: number | null
    indications: string[]
  }
  patient: { id: string; code: string; fullName: string }
}

export interface Task {
  id: string
  type: string
  title: string
  dueDate?: string | null
  status: string
  patientId?: string | null
  procedureId?: string | null
  patientName?: string | null
  assignee?: { id: string; fullName: string } | null
  overdue: boolean
}

export interface Dashboard {
  tiles: {
    today: number
    week: number
    awaiting: number
    overdue: number
    undelivered: number
    pendingOutcome: number
  }
  pathology: {
    id: string
    category?: string | null
    karyotype?: string | null
    reportedAt?: string | null
    deliveredAt?: string | null
    sampleCode: string
    fetusLabel?: string | null
    procedureId: string
    patient: { id: string; code: string; fullName: string }
  }[]
  feed: {
    id: string
    action: string
    entity: string
    entityId?: string | null
    summary?: string | null
    user: string
    createdAt: string
  }[]
}

export interface ReportSummary {
  period: { from: string; to: string }
  totals: {
    procedures: number
    patients: number
    samples: number
    results: number
    pathology: number
    pathologyPct: number
    failures: number
    failuresPct: number
    relatedLoss: number
    relatedLossPct: number
  }
  byType: { code: string; label: string; count: number; share: number }[]
  byMonth: { month: string; count: number }[]
  byIndication: { code: string; label: string; count: number; share: number }[]
  byCategory: { code: string; label: string; count: number; share: number; isPathological: boolean }[]
  yieldByIndication: { code: string; label: string; procedures: number; withResult: number; pathological: number; yieldPct: number }[]
  complications: { ratePct: number; total: number; byType: { code: string; label: string; count: number; share: number }[] }
  turnaround: { code: string; label: string; count: number; avgDays: number; maxDays: number }[]
  postnatal: { total: number; match: number; mismatch: number }
  byOperator: { id: string; name: string; count: number; complications: number; complicationRatePct: number }[]
  byOutcome: { code: string; label: string; count: number; share: number }[]
}

export interface AuditRow {
  id: string
  action: string
  entity: string
  entityId?: string | null
  summary?: string | null
  changes?: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
  user?: { fullName: string; login?: string } | null
}
