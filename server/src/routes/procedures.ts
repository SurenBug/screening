import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nextProcedureCode, prisma } from '../db.js'
import { authGuard, requireRole } from '../auth.js'
import { audit, diff } from '../audit.js'
import { clean, fio } from './patients.js'
import { checkProcedureWindow, gestationAt } from '../util/gestation.js'

const dateish = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : new Date(v as any)))

const sampleInput = z.object({
  id: z.string().optional(),
  fetusId: z.string().nullish(),
  materialType: z.string().nullish(),
  volume: z.string().nullish(),
  containerNumber: z.string().nullish(),
  quality: z.string().nullish(),
  handedAt: dateish,
  methodIds: z.array(z.string()).optional(),
  notes: z.string().nullish(),
})

const procedureBody = z.object({
  pregnancyId: z.string().optional(),
  status: z.string().optional(),
  plannedDate: dateish,
  performedAt: dateish,
  procedureType: z.string().nullish(),
  access: z.string().nullish(),
  needleGauge: z.string().nullish(),
  punctureCount: z.number().int().nullish(),
  placentaLocation: z.string().nullish(),
  usDevice: z.string().nullish(),
  antibioticProphylaxis: z.boolean().optional(),
  antiDIndicated: z.boolean().optional(),
  antiDGiven: z.boolean().optional(),
  antiDDate: dateish,
  antiDDose: z.string().nullish(),
  riskValue: z.number().int().nullish(),
  indicationNotes: z.string().nullish(),
  operatorId: z.string().nullish(),
  assistantId: z.string().nullish(),
  technicalNotes: z.string().nullish(),
  notes: z.string().nullish(),
  repeatOfId: z.string().nullish(),
  indicationIds: z.array(z.string()).optional(),
  complications: z
    .array(z.object({ dictionaryId: z.string(), daysAfter: z.number().int().nullish(), notes: z.string().nullish() }))
    .optional(),
  samples: z.array(sampleInput).optional(),
})

const procedureInclude = {
  pregnancy: {
    include: {
      patient: true,
      fetuses: { orderBy: { label: 'asc' as const } },
      screenings: { orderBy: { date: 'asc' as const } },
    },
  },
  operator: { select: { id: true, fullName: true } },
  assistant: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  indications: { include: { dictionary: true } },
  complications: { include: { dictionary: true } },
  samples: {
    include: {
      fetus: { select: { id: true, label: true } },
      methods: { include: { dictionary: true } },
      results: {
        orderBy: { createdAt: 'desc' as const },
        include: {
          performedBy: { select: { id: true, fullName: true } },
          verifiedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  },
}

export default async function procedureRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  // ───────────── Журнал процедур ─────────────
  app.get('/', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const where: any = {}
    if (q.status) where.status = { in: q.status.split(',') }
    if (q.type) where.procedureType = { in: q.type.split(',') }
    if (q.operatorId) where.operatorId = q.operatorId
    if (q.from || q.to) {
      where.performedAt = {}
      if (q.from) where.performedAt.gte = new Date(q.from)
      if (q.to) where.performedAt.lte = endOfDay(q.to)
    }
    if (q.indication) {
      where.indications = { some: { dictionary: { code: q.indication } } }
    }
    if (q.resultCategory) {
      where.samples = { some: { results: { some: { category: q.resultCategory } } } }
    }
    if (q.pathological === '1') {
      where.samples = { some: { results: { some: { isPathological: true } } } }
    }
    if (q.search) {
      const s = q.search.trim()
      where.OR = [
        { code: { contains: s } },
        { pregnancy: { patient: { lastName: { contains: s } } } },
        { pregnancy: { patient: { lastName: { contains: capitalize(s) } } } },
        { pregnancy: { patient: { code: { contains: s } } } },
      ]
    }

    const take = Math.min(Number(q.limit ?? 100), 1000)
    const [rows, total] = await Promise.all([
      prisma.procedure.findMany({
        where,
        orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
        take,
        skip: Number(q.offset ?? 0),
        include: procedureInclude,
      }),
      prisma.procedure.count({ where }),
    ])
    return { total, items: rows.map(toRow) }
  })

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const p = await prisma.procedure.findUnique({ where: { id }, include: procedureInclude })
    if (!p) return reply.code(404).send({ error: 'Процедура не найдена' })
    return { ...p, warnings: warningsFor(p) }
  })

  // ───────────── Создание (мастер) ─────────────
  app.post('/', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const body = procedureBody.parse(req.body)
    if (!body.pregnancyId) throw new Error('Не указана беременность')

    const pregnancy = await prisma.pregnancy.findUnique({
      where: { id: body.pregnancyId },
      include: { patient: true },
    })
    if (!pregnancy) throw new Error('Беременность не найдена')

    const code = await nextProcedureCode()
    const at = body.performedAt ?? body.plannedDate
    const gest = at ? gestationAt(pregnancy, at) : null

    const created = await prisma.procedure.create({
      data: {
        ...clean({
          ...body,
          pregnancyId: undefined,
          indicationIds: undefined,
          complications: undefined,
          samples: undefined,
        }),
        code,
        pregnancyId: body.pregnancyId,
        createdById: req.user!.id,
        operatorId: body.operatorId ?? req.user!.id,
        status: body.status ?? (body.performedAt ? 'PERFORMED' : 'PLANNED'),
        gestWeeks: gest?.weeks ?? null,
        gestDays: gest?.days ?? null,
        // Профилактика анти-D обязательна при резус-отрицательной крови
        antiDIndicated: body.antiDIndicated ?? pregnancy.patient.rhesus === 'NEG',
        indications: body.indicationIds?.length
          ? { create: body.indicationIds.map((dictionaryId) => ({ dictionaryId })) }
          : undefined,
        complications: body.complications?.length
          ? { create: body.complications.map((c) => clean(c)) }
          : undefined,
      },
    })

    if (body.samples?.length) {
      await createSamples(created.id, code, body.samples)
    }

    await audit(req, 'CREATE', 'Procedure', created.id, `${code}, ${fio(pregnancy.patient)}`)
    const full = await prisma.procedure.findUnique({ where: { id: created.id }, include: procedureInclude })
    return { ...full, warnings: warningsFor(full!) }
  })

  // ───────────── Изменение ─────────────
  app.patch('/:id', { preHandler: requireRole('DOCTOR') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = procedureBody.partial().parse(req.body)
    const before = await prisma.procedure.findUnique({
      where: { id },
      include: { pregnancy: { include: { patient: true } } },
    })
    if (!before) return reply.code(404).send({ error: 'Процедура не найдена' })

    const at = body.performedAt ?? before.performedAt ?? body.plannedDate ?? before.plannedDate
    const gest = at ? gestationAt(before.pregnancy, at) : null

    await prisma.procedure.update({
      where: { id },
      data: {
        ...clean({
          ...body,
          pregnancyId: undefined,
          indicationIds: undefined,
          complications: undefined,
          samples: undefined,
        }),
        gestWeeks: gest?.weeks ?? before.gestWeeks,
        gestDays: gest?.days ?? before.gestDays,
      },
    })

    if (body.indicationIds) {
      await prisma.procedureIndication.deleteMany({ where: { procedureId: id } })
      if (body.indicationIds.length) {
        await prisma.procedureIndication.createMany({
          data: body.indicationIds.map((dictionaryId) => ({ procedureId: id, dictionaryId })),
        })
      }
    }
    if (body.complications) {
      await prisma.procedureComplication.deleteMany({ where: { procedureId: id } })
      for (const c of body.complications) {
        await prisma.procedureComplication.create({ data: { procedureId: id, ...clean(c) } })
      }
    }
    if (body.samples) {
      await syncSamples(id, before.code, body.samples)
    }

    const full = await prisma.procedure.findUnique({ where: { id }, include: procedureInclude })
    await audit(req, 'UPDATE', 'Procedure', id, before.code, diff(before, full!))
    return { ...full, warnings: warningsFor(full!) }
  })

  // ───────────── Смена статуса ─────────────
  app.post('/:id/status', { preHandler: requireRole('DOCTOR', 'LAB') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { status, reason } = z
      .object({ status: z.string(), reason: z.string().nullish() })
      .parse(req.body)

    const before = await prisma.procedure.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Процедура не найдена' })

    const data: any = { status }
    if (status === 'CANCELLED') data.cancelReason = reason ?? null
    if (status === 'FAILED') data.failureReason = reason ?? null
    if (status === 'PERFORMED' && !before.performedAt) data.performedAt = new Date()

    const updated = await prisma.procedure.update({ where: { id }, data })
    await audit(req, 'UPDATE', 'Procedure', id, `${before.code}: статус ${before.status} → ${status}`)
    return updated
  })

  // ───────────── Мягкая блокировка при одновременном редактировании ─────────────
  app.post('/:id/lock', async (req, reply) => {
    const { id } = req.params as { id: string }
    const p = await prisma.procedure.findUnique({ where: { id } })
    if (!p) return reply.code(404).send({ error: 'Процедура не найдена' })

    const STALE_MS = 5 * 60_000
    const fresh = p.lockedAt && Date.now() - p.lockedAt.getTime() < STALE_MS
    if (fresh && p.lockedById && p.lockedById !== req.user!.id) {
      const holder = await prisma.user.findUnique({ where: { id: p.lockedById } })
      return reply.code(409).send({
        error: 'Запись сейчас редактирует другой пользователь',
        lockedBy: holder?.fullName ?? 'другой пользователь',
        readOnly: true,
      })
    }
    await prisma.procedure.update({
      where: { id },
      data: { lockedById: req.user!.id, lockedAt: new Date() },
    })
    return { ok: true }
  })

  app.post('/:id/unlock', async (req) => {
    const { id } = req.params as { id: string }
    await prisma.procedure
      .updateMany({
        where: { id, lockedById: req.user!.id },
        data: { lockedById: null, lockedAt: null },
      })
      .catch(() => {})
    return { ok: true }
  })
}

// ───────────── Вспомогательное ─────────────

async function createSamples(procedureId: string, procedureCode: string, samples: z.infer<typeof sampleInput>[]) {
  for (const [i, s] of samples.entries()) {
    const suffix = await suffixFor(s.fetusId, i)
    const created = await prisma.sample.create({
      data: {
        procedureId,
        code: `${procedureCode}-${suffix}`,
        ...clean({ ...s, id: undefined, methodIds: undefined }),
        deadline: await deadlineFor(s.methodIds, s.handedAt ?? new Date()),
      },
    })
    if (s.methodIds?.length) {
      await prisma.sampleMethod.createMany({
        data: s.methodIds.map((dictionaryId) => ({ sampleId: created.id, dictionaryId })),
      })
    }
  }
}

async function syncSamples(procedureId: string, procedureCode: string, samples: z.infer<typeof sampleInput>[]) {
  const existing = await prisma.sample.findMany({ where: { procedureId }, include: { results: true } })
  const keepIds = samples.filter((s) => s.id).map((s) => s.id!)

  // Удаляем только те образцы, по которым ещё нет результата.
  for (const e of existing) {
    if (!keepIds.includes(e.id) && e.results.length === 0) {
      await prisma.sample.delete({ where: { id: e.id } })
    }
  }

  for (const [i, s] of samples.entries()) {
    if (s.id) {
      await prisma.sample.update({
        where: { id: s.id },
        data: clean({ ...s, id: undefined, methodIds: undefined }),
      })
      if (s.methodIds) {
        await prisma.sampleMethod.deleteMany({ where: { sampleId: s.id } })
        if (s.methodIds.length) {
          await prisma.sampleMethod.createMany({
            data: s.methodIds.map((dictionaryId) => ({ sampleId: s.id!, dictionaryId })),
          })
        }
        await prisma.sample.update({
          where: { id: s.id },
          data: { deadline: await deadlineFor(s.methodIds, s.handedAt ?? new Date()) },
        })
      }
    } else {
      await createSamples(procedureId, procedureCode, [s])
    }
  }
}

async function suffixFor(fetusId: string | null | undefined, index: number) {
  if (fetusId) {
    const f = await prisma.fetus.findUnique({ where: { id: fetusId } })
    if (f) return f.label
  }
  return String.fromCharCode(65 + index)
}

/** Дедлайн — по самому долгому из назначенных методов. */
async function deadlineFor(methodIds: string[] | undefined, from: Date) {
  if (!methodIds?.length) return null
  const methods = await prisma.dictionary.findMany({ where: { id: { in: methodIds } } })
  const days = Math.max(...methods.map((m) => m.numValue ?? 21))
  return new Date(from.getTime() + days * 86_400_000)
}

function toRow(p: any) {
  const results = p.samples.flatMap((s: any) => s.results)
  return {
    id: p.id,
    code: p.code,
    status: p.status,
    performedAt: p.performedAt,
    plannedDate: p.plannedDate,
    procedureType: p.procedureType,
    gestWeeks: p.gestWeeks,
    gestDays: p.gestDays,
    operator: p.operator,
    patient: {
      id: p.pregnancy.patient.id,
      code: p.pregnancy.patient.code,
      fullName: fio(p.pregnancy.patient),
      rhesus: p.pregnancy.patient.rhesus,
      birthDate: p.pregnancy.patient.birthDate,
    },
    pregnancyId: p.pregnancy.id,
    plurality: p.pregnancy.plurality,
    indications: p.indications.map((i: any) => ({ code: i.dictionary.code, label: i.dictionary.label })),
    complications: p.complications.map((c: any) => ({ code: c.dictionary.code, label: c.dictionary.label })),
    samples: p.samples.map((s: any) => ({
      id: s.id,
      code: s.code,
      status: s.status,
      fetus: s.fetus,
      deadline: s.deadline,
      methods: s.methods.map((m: any) => m.dictionary.label),
    })),
    results: results.map((r: any) => ({
      id: r.id,
      category: r.category,
      karyotype: r.karyotype,
      isPathological: r.isPathological,
      reportedAt: r.reportedAt,
      deliveredAt: r.deliveredAt,
    })),
    hasPathology: results.some((r: any) => r.isPathological),
  }
}

/** Мягкие предупреждения — подсказки, а не запреты. */
function warningsFor(p: any): string[] {
  const w: string[] = []
  const windowWarn = checkProcedureWindow(p.procedureType, p.gestWeeks)
  if (windowWarn) w.push(windowWarn)
  if (p.pregnancy?.patient?.rhesus === 'NEG' && !p.antiDGiven && p.status !== 'PLANNED') {
    w.push('Резус-отрицательная кровь: не отмечено введение анти-D иммуноглобулина')
  }
  if (p.status === 'PERFORMED' && (!p.samples || p.samples.length === 0)) {
    w.push('Процедура выполнена, но не заведён ни один образец')
  }
  if (p.pregnancy?.plurality === 'MULTIPLE') {
    const withFetus = (p.samples ?? []).filter((s: any) => s.fetusId || s.fetus).length
    if (withFetus < (p.pregnancy.fetusCount ?? 2)) {
      w.push('Многоплодная беременность: образец заведён не на каждый плод')
    }
  }
  if (!p.indications || p.indications.length === 0) {
    w.push('Не указано показание к инвазивной диагностике')
  }
  return w
}

function endOfDay(s: string) {
  const d = new Date(s)
  d.setHours(23, 59, 59, 999)
  return d
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
