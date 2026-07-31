/**
 * Демонстрационное наполнение: 12 случаев, покрывающих типичные ситуации отделения —
 * норма, трисомия 21, двойня, неудача культивирования, осложнение, незакрытый исход.
 * Запуск: npm run demo -w server
 * Данные вымышленные. На рабочей базе не запускать.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DAY = 86_400_000

interface Case {
  lastName: string
  firstName: string
  middleName: string
  birthYear: number
  rhesus: 'POS' | 'NEG'
  institution: string
  gravida: number
  para: number
  /** за сколько дней до сегодня выполнена процедура */
  daysAgo: number
  procedureType: 'CVS' | 'AMNIO' | 'CORDO'
  indications: string[]
  riskValue?: number
  ntMm?: number
  pappaMom?: number
  hcgMom?: number
  twins?: boolean
  /** результат по каждому плоду: код категории + кариотип */
  results: { category: string; karyotype?: string; sex?: 'MALE' | 'FEMALE' }[]
  complication?: string
  outcomes?: { type: string; postnatal?: string; weight?: number; relatedLoss?: boolean }[]
  /** результат ещё не внесён — образец в работе */
  pending?: boolean
}

const CASES: Case[] = [
  {
    lastName: 'Абрамова', firstName: 'Елена', middleName: 'Сергеевна', birthYear: 1987, rhesus: 'POS',
    institution: 'ЖК №1', gravida: 2, para: 1, daysAgo: 210, procedureType: 'AMNIO',
    indications: ['SCREEN_RISK'], riskValue: 120, ntMm: 2.1, pappaMom: 0.42, hcgMom: 2.1,
    results: [{ category: 'NORMAL', karyotype: '46,XX', sex: 'FEMALE' }],
    outcomes: [{ type: 'TERM_BIRTH', postnatal: 'MATCH', weight: 3420 }],
  },
  {
    lastName: 'Белова', firstName: 'Ирина', middleName: 'Павловна', birthYear: 1982, rhesus: 'NEG',
    institution: 'ЖК №3', gravida: 3, para: 2, daysAgo: 195, procedureType: 'AMNIO',
    indications: ['AGE', 'SCREEN_RISK'], riskValue: 68, ntMm: 3.6, pappaMom: 0.28, hcgMom: 3.4,
    results: [{ category: 'T21', karyotype: '47,XY,+21', sex: 'MALE' }],
    outcomes: [{ type: 'TOP', postnatal: 'MATCH' }],
  },
  {
    lastName: 'Волкова', firstName: 'Наталья', middleName: 'Игоревна', birthYear: 1994, rhesus: 'POS',
    institution: 'Перинатальный центр', gravida: 1, para: 0, daysAgo: 160, procedureType: 'CVS',
    indications: ['NT_ENLARGED'], ntMm: 4.2, riskValue: 22,
    results: [{ category: 'MONOSOMY_X', karyotype: '45,X', sex: 'FEMALE' }],
    outcomes: [{ type: 'TOP', postnatal: 'MATCH' }],
  },
  {
    lastName: 'Гринёва', firstName: 'Ольга', middleName: 'Дмитриевна', birthYear: 1990, rhesus: 'POS',
    institution: 'ЖК №1', gravida: 2, para: 1, daysAgo: 140, procedureType: 'AMNIO',
    indications: ['SCREEN_RISK'], riskValue: 190, ntMm: 2.4,
    twins: true,
    results: [
      { category: 'NORMAL', karyotype: '46,XY', sex: 'MALE' },
      { category: 'T18', karyotype: '47,XX,+18', sex: 'FEMALE' },
    ],
    outcomes: [
      { type: 'PRETERM_BIRTH', postnatal: 'MATCH', weight: 2280 },
      { type: 'ANTENATAL_DEATH', postnatal: 'MATCH' },
    ],
  },
  {
    lastName: 'Дьякова', firstName: 'Светлана', middleName: 'Юрьевна', birthYear: 1979, rhesus: 'NEG',
    institution: 'ЖК №5', gravida: 4, para: 2, daysAgo: 120, procedureType: 'AMNIO',
    indications: ['AGE'], riskValue: 310,
    results: [{ category: 'NORMAL', karyotype: '46,XY', sex: 'MALE' }],
    outcomes: [{ type: 'TERM_BIRTH', postnatal: 'MATCH', weight: 3600 }],
  },
  {
    lastName: 'Ершова', firstName: 'Марина', middleName: 'Олеговна', birthYear: 1992, rhesus: 'POS',
    institution: 'ЖК №3', gravida: 1, para: 0, daysAgo: 105, procedureType: 'CVS',
    indications: ['PREV_CHILD_CA'],
    results: [{ category: 'CULTURE_FAILED' }],
    outcomes: [{ type: 'TERM_BIRTH', weight: 3150 }],
  },
  {
    lastName: 'Жукова', firstName: 'Анна', middleName: 'Викторовна', birthYear: 1985, rhesus: 'POS',
    institution: 'Перинатальный центр', gravida: 3, para: 1, daysAgo: 92, procedureType: 'AMNIO',
    indications: ['US_MARKERS', 'MALFORMATION'], ntMm: 2.8,
    results: [{ category: 'CNV_PATHOGENIC', karyotype: 'arr[GRCh37] 22q11.21(18916842_21440514)x1', sex: 'MALE' }],
    complication: 'AMNIOTIC_LEAK',
    outcomes: [{ type: 'PRETERM_BIRTH', postnatal: 'MATCH', weight: 2440 }],
  },
  {
    lastName: 'Зотова', firstName: 'Татьяна', middleName: 'Андреевна', birthYear: 1988, rhesus: 'NEG',
    institution: 'ЖК №1', gravida: 2, para: 1, daysAgo: 74, procedureType: 'AMNIO',
    indications: ['NIPT_RISK'], riskValue: 45,
    results: [{ category: 'T21', karyotype: '47,XX,+21', sex: 'FEMALE' }],
    outcomes: [{ type: 'TOP', postnatal: 'MATCH' }],
  },
  {
    lastName: 'Ковалёва', firstName: 'Юлия', middleName: 'Романовна', birthYear: 1996, rhesus: 'POS',
    institution: 'ЖК №5', gravida: 1, para: 0, daysAgo: 58, procedureType: 'AMNIO',
    indications: ['PATIENT_REQUEST'],
    results: [{ category: 'NORMAL', karyotype: '46,XX', sex: 'FEMALE' }],
    outcomes: [{ type: 'ONGOING' }],
  },
  {
    lastName: 'Лебедева', firstName: 'Дарья', middleName: 'Максимовна', birthYear: 1983, rhesus: 'POS',
    institution: 'ЖК №3', gravida: 5, para: 2, daysAgo: 40, procedureType: 'AMNIO',
    indications: ['AGE', 'US_MARKERS'], riskValue: 260, ntMm: 2.9,
    results: [{ category: 'STRUCT_BALANCED', karyotype: '46,XY,t(2;7)(q31;p15)', sex: 'MALE' }],
  },
  {
    lastName: 'Миронова', firstName: 'Ксения', middleName: 'Алексеевна', birthYear: 1991, rhesus: 'NEG',
    institution: 'Перинатальный центр', gravida: 2, para: 0, daysAgo: 18, procedureType: 'AMNIO',
    indications: ['SCREEN_RISK'], riskValue: 95, ntMm: 3.1, pappaMom: 0.31, hcgMom: 2.9,
    results: [], pending: true,
  },
  {
    lastName: 'Новикова', firstName: 'Полина', middleName: 'Ивановна', birthYear: 1989, rhesus: 'POS',
    institution: 'ЖК №1', gravida: 3, para: 1, daysAgo: 5, procedureType: 'CVS',
    indications: ['PARENT_REARRANGEMENT'],
    results: [], pending: true,
  },
]

async function main() {
  const doctor = await prisma.user.findUnique({ where: { login: 'doctor' } })
  const lab = await prisma.user.findUnique({ where: { login: 'lab' } })
  const admin = await prisma.user.findUnique({ where: { login: 'admin' } })
  if (!doctor || !lab || !admin) throw new Error('Сначала выполните: npm run seed -w server')

  if (await prisma.patient.count()) {
    console.log('В базе уже есть пациентки — демонстрационные данные не добавлены.')
    console.log('Чтобы наполнить заново: удалите server/prisma/dev.db, затем db:push, seed, demo.')
    return
  }

  const dict = await prisma.dictionary.findMany()
  const byCode = (type: string, code: string) => {
    const d = dict.find((x) => x.type === type && x.code === code)
    if (!d) throw new Error(`Нет значения справочника ${type}/${code}`)
    return d
  }
  const year = new Date().getFullYear()
  let patientNo = 0
  let procedureNo = 0

  for (const c of CASES) {
    const performedAt = new Date(Date.now() - c.daysAgo * DAY)
    // Датировка: УЗИ в 12 недель, отсчёт от даты процедуры назад
    const gestAtProcedure = c.procedureType === 'CVS' ? 12 : 17
    const usDate = new Date(performedAt.getTime() - (gestAtProcedure - 12) * 7 * DAY)

    const patient = await prisma.patient.create({
      data: {
        code: `PD-${year}-${String(++patientNo).padStart(3, '0')}`,
        lastName: c.lastName,
        firstName: c.firstName,
        middleName: c.middleName,
        birthDate: new Date(c.birthYear, 4, 15),
        phone: `+7900${String(1000000 + patientNo * 137).slice(0, 7)}`,
        rhesus: c.rhesus,
        bloodGroup: ['O(I)', 'A(II)', 'B(III)', 'AB(IV)'][patientNo % 4],
        referringInstitution: c.institution,
        gravida: c.gravida,
        para: c.para,
        createdById: doctor.id,
      },
    })

    const fetusCount = c.twins ? 2 : 1
    const pregnancy = await prisma.pregnancy.create({
      data: {
        patientId: patient.id,
        number: 1,
        usDate,
        usGestWeeks: 12,
        usGestDays: 0,
        edd: new Date(usDate.getTime() + (280 - 84) * DAY),
        plurality: c.twins ? 'MULTIPLE' : 'SINGLE',
        fetusCount,
        chorionicity: c.twins ? 'DI' : null,
        amnionicity: c.twins ? 'DI' : null,
        fetuses: { create: Array.from({ length: fetusCount }, (_, i) => ({ label: String.fromCharCode(65 + i) })) },
      },
      include: { fetuses: { orderBy: { label: 'asc' } } },
    })

    await prisma.screening.create({
      data: {
        pregnancyId: pregnancy.id,
        trimester: 1,
        date: usDate,
        gestWeeks: 12,
        gestDays: 0,
        crl: 58 + (patientNo % 7),
        ntMm: c.ntMm ?? 1.8,
        pappaMom: c.pappaMom ?? 1.1,
        hcgMom: c.hcgMom ?? 1.2,
        riskT21: c.riskValue ?? 1500,
        riskProgram: 'ASTRAIA',
        niptDone: c.indications.includes('NIPT_RISK'),
        niptResult: c.indications.includes('NIPT_RISK') ? 'высокий риск трисомии 21' : null,
      },
    })

    const code = `IPD-${year}-${String(++procedureNo).padStart(4, '0')}`
    const status = c.pending ? 'IN_LAB' : c.outcomes ? 'OUTCOME_RECORDED' : 'RESULT_DELIVERED'
    const procedure = await prisma.procedure.create({
      data: {
        code,
        pregnancyId: pregnancy.id,
        status,
        performedAt,
        gestWeeks: gestAtProcedure,
        gestDays: 2,
        procedureType: c.procedureType,
        access: 'TRANSABDOMINAL',
        needleGauge: c.procedureType === 'CVS' ? '20G' : '22G',
        punctureCount: 1,
        placentaLocation: patientNo % 2 ? 'ANTERIOR' : 'POSTERIOR',
        operatorId: patientNo % 3 === 0 ? admin.id : doctor.id,
        riskValue: c.riskValue ?? null,
        antiDIndicated: c.rhesus === 'NEG',
        antiDGiven: c.rhesus === 'NEG',
        antiDDate: c.rhesus === 'NEG' ? performedAt : null,
        antiDDose: c.rhesus === 'NEG' ? '1250 МЕ' : null,
        createdById: doctor.id,
        indications: { create: c.indications.map((i) => ({ dictionaryId: byCode('INDICATION', i).id })) },
        complications: c.complication
          ? { create: [{ dictionaryId: byCode('COMPLICATION', c.complication).id, daysAfter: 3 }] }
          : undefined,
      },
    })

    const methodIds = [byCode('METHOD', 'QF_PCR').id, byCode('METHOD', 'KARYOTYPE').id]
    for (const [i, fetus] of pregnancy.fetuses.entries()) {
      const result = c.results[i]
      const sample = await prisma.sample.create({
        data: {
          code: `${code}-${fetus.label}`,
          procedureId: procedure.id,
          fetusId: fetus.id,
          materialType: c.procedureType === 'CVS' ? 'CHORIONIC_VILLI' : 'AMNIOTIC_FLUID',
          volume: c.procedureType === 'CVS' ? '15 мг' : '20 мл',
          containerNumber: `К-${100 + procedureNo * 2 + i}`,
          quality: 'GOOD',
          handedAt: performedAt,
          receivedAt: new Date(performedAt.getTime() + DAY),
          deadline: new Date(performedAt.getTime() + 21 * DAY),
          status: result ? 'ISSUED' : 'CULTURING',
          labUserId: lab.id,
          methods: { create: methodIds.map((dictionaryId) => ({ dictionaryId })) },
        },
      })

      if (!result) continue

      const category = byCode('RESULT_CATEGORY', result.category)
      const reportedAt = new Date(performedAt.getTime() + (14 + (procedureNo % 6)) * DAY)
      await prisma.result.create({
        data: {
          sampleId: sample.id,
          method: 'KARYOTYPE',
          reportedAt,
          metaphases: 15 + (procedureNo % 5),
          bandingLevel: '550 GTG',
          category: category.code,
          isPathological: category.flag,
          karyotype: result.karyotype ?? null,
          sex: result.sex ?? null,
          conclusion: category.label,
          performedById: lab.id,
          verifiedById: category.flag ? admin.id : null,
          deliveredAt: new Date(reportedAt.getTime() + DAY),
          deliveryMethod: 'IN_PERSON',
          deliveredByName: doctor.fullName,
        },
      })

      if (result.sex) await prisma.fetus.update({ where: { id: fetus.id }, data: { sex: result.sex } })

      const outcome = c.outcomes?.[i]
      if (outcome) {
        await prisma.outcome.create({
          data: {
            fetusId: fetus.id,
            outcomeType: outcome.type,
            date: new Date(performedAt.getTime() + 150 * DAY),
            gestWeeks: outcome.type === 'TERM_BIRTH' ? 39 : outcome.type === 'PRETERM_BIRTH' ? 35 : 21,
            birthWeight: outcome.weight ?? null,
            apgar1: outcome.weight ? 8 : null,
            apgar5: outcome.weight ? 9 : null,
            postnatalConfirmation: outcome.postnatal ?? null,
            postnatalDiagnosis: outcome.postnatal === 'MATCH' ? category.label : null,
            procedureRelatedLoss: outcome.relatedLoss ?? false,
          },
        })
      }
    }
  }

  await prisma.counter.upsert({
    where: { key: `patient:${year}` },
    create: { key: `patient:${year}`, value: patientNo },
    update: { value: patientNo },
  })
  await prisma.counter.upsert({
    where: { key: `procedure:${year}` },
    create: { key: `procedure:${year}`, value: procedureNo },
    update: { value: procedureNo },
  })

  console.log(`Демонстрационные данные добавлены: пациенток — ${patientNo}, процедур — ${procedureNo}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
