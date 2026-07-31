import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard, requireRole } from '../auth.js'
import { audit, diff } from '../audit.js'
import { clean, fio } from './patients.js'

const dateish = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : new Date(v as any)))

const OPEN_STATUSES = ['HANDED', 'RECEIVED', 'CULTURING', 'ANALYSIS']

export default async function labRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  // ───────────── Очередь образцов ─────────────
  app.get('/samples', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const where: any = {}
    if (q.status) where.status = { in: q.status.split(',') }
    else if (q.all !== '1') where.status = { in: OPEN_STATUSES }
    if (q.overdue === '1') where.deadline = { lt: new Date() }

    const rows = await prisma.sample.findMany({
      where,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
      include: {
        fetus: { select: { id: true, label: true } },
        methods: { include: { dictionary: true } },
        results: { orderBy: { createdAt: 'desc' } },
        labUser: { select: { id: true, fullName: true } },
        procedure: {
          include: {
            pregnancy: { include: { patient: true } },
            indications: { include: { dictionary: true } },
          },
        },
      },
    })

    const now = Date.now()
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      status: s.status,
      materialType: s.materialType,
      volume: s.volume,
      containerNumber: s.containerNumber,
      quality: s.quality,
      handedAt: s.handedAt,
      receivedAt: s.receivedAt,
      deadline: s.deadline,
      overdue: s.deadline ? s.deadline.getTime() < now && !s.results.length : false,
      daysLeft: s.deadline ? Math.ceil((s.deadline.getTime() - now) / 86_400_000) : null,
      labUser: s.labUser,
      fetus: s.fetus,
      methods: s.methods.map((m) => ({ id: m.dictionaryId, code: m.dictionary.code, label: m.dictionary.label })),
      resultCount: s.results.length,
      procedure: {
        id: s.procedure.id,
        code: s.procedure.code,
        procedureType: s.procedure.procedureType,
        performedAt: s.procedure.performedAt,
        gestWeeks: s.procedure.gestWeeks,
        gestDays: s.procedure.gestDays,
        indications: s.procedure.indications.map((i) => i.dictionary.label),
      },
      patient: {
        id: s.procedure.pregnancy.patient.id,
        code: s.procedure.pregnancy.patient.code,
        fullName: fio(s.procedure.pregnancy.patient),
      },
    }))
  })

  app.patch('/samples/:id', { preHandler: requireRole('LAB', 'DOCTOR') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        status: z.string().optional(),
        materialType: z.string().nullish(),
        volume: z.string().nullish(),
        containerNumber: z.string().nullish(),
        quality: z.string().nullish(),
        receivedAt: dateish,
        deadline: dateish,
        labUserId: z.string().nullish(),
        notes: z.string().nullish(),
        methodIds: z.array(z.string()).optional(),
      })
      .parse(req.body)

    const before = await prisma.sample.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Образец не найден' })

    const data: any = clean({ ...body, methodIds: undefined })
    if (body.status === 'RECEIVED' && !before.receivedAt) data.receivedAt = new Date()
    if (body.status === 'RECEIVED' && !before.labUserId) data.labUserId = req.user!.id

    const sample = await prisma.sample.update({ where: { id }, data })

    if (body.methodIds) {
      await prisma.sampleMethod.deleteMany({ where: { sampleId: id } })
      if (body.methodIds.length) {
        await prisma.sampleMethod.createMany({
          data: body.methodIds.map((dictionaryId) => ({ sampleId: id, dictionaryId })),
        })
      }
    }

    // Образец в лаборатории — двигаем и статус процедуры
    if (body.status === 'RECEIVED') {
      await prisma.procedure.updateMany({
        where: { id: before.procedureId, status: { in: ['PERFORMED', 'PLANNED'] } },
        data: { status: 'IN_LAB' },
      })
    }

    await audit(req, 'UPDATE', 'Sample', id, before.code, diff(before, sample))
    return sample
  })

  /** Массовый приём партии образцов. */
  app.post('/samples/receive', { preHandler: requireRole('LAB') }, async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body)
    const now = new Date()
    await prisma.sample.updateMany({
      where: { id: { in: ids } },
      data: { status: 'RECEIVED', receivedAt: now, labUserId: req.user!.id },
    })
    const samples = await prisma.sample.findMany({ where: { id: { in: ids } } })
    await prisma.procedure.updateMany({
      where: { id: { in: samples.map((s) => s.procedureId) }, status: { in: ['PERFORMED', 'PLANNED'] } },
      data: { status: 'IN_LAB' },
    })
    await audit(req, 'UPDATE', 'Sample', null, `принято образцов: ${ids.length}`)
    return { ok: true, count: ids.length }
  })

  // ───────────── Результаты ─────────────
  const resultBody = z.object({
    sampleId: z.string().optional(),
    method: z.string().optional(),
    reportedAt: dateish,
    metaphases: z.number().int().nullish(),
    bandingLevel: z.string().nullish(),
    quality: z.string().nullish(),
    category: z.string().nullish(),
    karyotype: z.string().nullish(),
    sex: z.string().nullish(),
    conclusion: z.string().nullish(),
    verifiedById: z.string().nullish(),
  })

  app.post('/results', { preHandler: requireRole('LAB') }, async (req) => {
    const body = resultBody.parse(req.body)
    if (!body.sampleId || !body.method) throw new Error('Не указан образец или метод')

    const isPathological = await categoryIsPathological(body.category)
    const result = await prisma.result.create({
      data: {
        ...clean({ ...body, sampleId: undefined, method: undefined }),
        sampleId: body.sampleId,
        method: body.method,
        reportedAt: body.reportedAt ?? new Date(),
        isPathological,
        performedById: req.user!.id,
      },
      include: { sample: { include: { procedure: { include: { pregnancy: { include: { patient: true } } } }, fetus: true } } },
    })

    await prisma.sample.update({ where: { id: body.sampleId }, data: { status: 'RESULT_READY' } })
    await prisma.procedure.update({
      where: { id: result.sample.procedureId },
      data: { status: 'RESULT_READY' },
    })

    // Пол плода по результату — заполняем автоматически, это чаще всего и есть источник
    if (body.sex && result.sample.fetusId) {
      await prisma.fetus.update({ where: { id: result.sample.fetusId }, data: { sex: body.sex } })
    }

    const patient = result.sample.procedure.pregnancy.patient
    // Задача «сообщить результат» — чтобы готовый результат не завис в лаборатории
    await prisma.task.create({
      data: {
        type: isPathological ? 'PATHOLOGY_ALERT' : 'DELIVER_RESULT',
        title: isPathological
          ? `Патологический результат: ${result.sample.code}, ${fio(patient)} — сообщить врачу и пациентке`
          : `Сообщить результат пациентке: ${result.sample.code}, ${fio(patient)}`,
        dueDate: new Date(),
        patientId: patient.id,
        procedureId: result.sample.procedureId,
        assigneeId: result.sample.procedure.operatorId,
      },
    })

    await audit(req, 'CREATE', 'Result', result.id, `${result.sample.code}: ${body.category ?? ''}`)
    return result
  })

  app.patch('/results/:id', { preHandler: requireRole('LAB') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = resultBody.partial().parse(req.body)
    const before = await prisma.result.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Результат не найден' })

    const data: any = clean({ ...body, sampleId: undefined })
    if (body.category !== undefined) data.isPathological = await categoryIsPathological(body.category)

    const result = await prisma.result.update({ where: { id }, data })
    await audit(req, 'UPDATE', 'Result', id, before.method, diff(before, result))
    return result
  })

  /** Фиксация выдачи результата пациентке — врач, а не лаборатория. */
  app.post('/results/:id/deliver', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({ deliveryMethod: z.string().optional(), deliveredAt: dateish })
      .parse(req.body)

    const result = await prisma.result.update({
      where: { id },
      data: {
        deliveredAt: body.deliveredAt ?? new Date(),
        deliveryMethod: body.deliveryMethod ?? 'IN_PERSON',
        deliveredByName: req.user!.fullName,
      },
      include: { sample: true },
    })
    await prisma.sample.update({ where: { id: result.sampleId }, data: { status: 'ISSUED' } })
    await prisma.procedure.updateMany({
      where: { id: result.sample.procedureId, status: 'RESULT_READY' },
      data: { status: 'RESULT_DELIVERED' },
    })
    await prisma.task.updateMany({
      where: { procedureId: result.sample.procedureId, type: { in: ['DELIVER_RESULT', 'PATHOLOGY_ALERT'] }, status: 'OPEN' },
      data: { status: 'DONE', completedAt: new Date() },
    })
    await audit(req, 'UPDATE', 'Result', id, 'результат выдан пациентке')
    return result
  })
}

async function categoryIsPathological(code?: string | null) {
  if (!code) return false
  const d = await prisma.dictionary.findUnique({ where: { type_code: { type: 'RESULT_CATEGORY', code } } })
  return d?.flag ?? false
}
