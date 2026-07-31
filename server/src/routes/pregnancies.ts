import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard, requireRole } from '../auth.js'
import { audit, diff } from '../audit.js'
import { clean } from './patients.js'
import { estimatedDueDate, gestationAt } from '../util/gestation.js'

const dateish = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : new Date(v as any)))

const pregnancyBody = z.object({
  patientId: z.string().optional(),
  lmpDate: dateish,
  usDate: dateish,
  usGestWeeks: z.number().int().min(0).max(45).nullish(),
  usGestDays: z.number().int().min(0).max(6).nullish(),
  plurality: z.enum(['SINGLE', 'MULTIPLE']).optional(),
  fetusCount: z.number().int().min(1).max(6).optional(),
  chorionicity: z.string().nullish(),
  amnionicity: z.string().nullish(),
  conception: z.string().nullish(),
  notes: z.string().nullish(),
})

const screeningBody = z.object({
  pregnancyId: z.string().optional(),
  fetusId: z.string().nullish(),
  trimester: z.number().int().min(1).max(3).nullish(),
  date: dateish,
  gestWeeks: z.number().int().nullish(),
  gestDays: z.number().int().nullish(),
  crl: z.number().nullish(),
  ntMm: z.number().nullish(),
  nasalBone: z.string().nullish(),
  ductusVenosus: z.string().nullish(),
  tricuspidRegurg: z.string().nullish(),
  pappaMom: z.number().nullish(),
  hcgMom: z.number().nullish(),
  afpMom: z.number().nullish(),
  ue3Mom: z.number().nullish(),
  inhibinMom: z.number().nullish(),
  riskT21: z.number().int().nullish(),
  riskT18: z.number().int().nullish(),
  riskT13: z.number().int().nullish(),
  riskProgram: z.string().nullish(),
  niptDone: z.boolean().optional(),
  niptDate: dateish,
  niptLab: z.string().nullish(),
  niptResult: z.string().nullish(),
  usFindings: z.string().nullish(),
  malformations: z.string().nullish(),
  notes: z.string().nullish(),
})

export default async function pregnancyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const pr = await prisma.pregnancy.findUnique({
      where: { id },
      include: {
        patient: true,
        fetuses: { orderBy: { label: 'asc' }, include: { outcome: true } },
        screenings: { orderBy: { date: 'asc' } },
        procedures: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!pr) return reply.code(404).send({ error: 'Беременность не найдена' })
    return { ...pr, edd: pr.edd ?? estimatedDueDate(pr), currentGestation: gestationAt(pr, new Date()) }
  })

  /**
   * Создание беременности сразу заводит плоды (A, B, …) — двойня ведётся
   * как одна беременность с несколькими плодами, у каждого свой образец и свой исход.
   */
  app.post('/', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const body = pregnancyBody.parse(req.body)
    if (!body.patientId) throw new Error('Не указана пациентка')

    const count = await prisma.pregnancy.count({ where: { patientId: body.patientId } })
    const fetusCount = body.plurality === 'MULTIPLE' ? Math.max(body.fetusCount ?? 2, 2) : 1

    const pregnancy = await prisma.pregnancy.create({
      data: {
        ...clean({ ...body, patientId: undefined }),
        patientId: body.patientId,
        number: count + 1,
        fetusCount,
        plurality: body.plurality ?? 'SINGLE',
        edd: estimatedDueDate({
          lmpDate: body.lmpDate,
          usDate: body.usDate,
          usGestWeeks: body.usGestWeeks,
          usGestDays: body.usGestDays,
        }),
        fetuses: {
          create: Array.from({ length: fetusCount }, (_, i) => ({
            label: String.fromCharCode(65 + i),
          })),
        },
      },
      include: { fetuses: true },
    })
    await audit(req, 'CREATE', 'Pregnancy', pregnancy.id, `беременность №${pregnancy.number}`)
    return pregnancy
  })

  app.patch('/:id', { preHandler: requireRole('DOCTOR') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = pregnancyBody.partial().parse(req.body)
    const before = await prisma.pregnancy.findUnique({ where: { id }, include: { fetuses: true } })
    if (!before) return reply.code(404).send({ error: 'Беременность не найдена' })

    const merged = { ...before, ...clean(body) }
    const updated = await prisma.pregnancy.update({
      where: { id },
      data: {
        ...clean({ ...body, patientId: undefined }),
        edd: estimatedDueDate(merged),
      },
    })

    // Плодов стало больше — добавляем недостающие. Уменьшать автоматически нельзя:
    // к плоду могут быть привязаны образцы и результаты.
    const wanted = body.fetusCount ?? updated.fetusCount
    if (wanted > before.fetuses.length) {
      await prisma.fetus.createMany({
        data: Array.from({ length: wanted - before.fetuses.length }, (_, i) => ({
          pregnancyId: id,
          label: String.fromCharCode(65 + before.fetuses.length + i),
        })),
      })
    }

    await audit(req, 'UPDATE', 'Pregnancy', id, `беременность №${updated.number}`, diff(before, updated))
    return updated
  })

  // ───────────── Плоды ─────────────
  app.patch('/fetus/:id', { preHandler: requireRole('DOCTOR', 'LAB') }, async (req) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({ sex: z.string().nullish(), notes: z.string().nullish(), label: z.string().optional() })
      .parse(req.body)
    const fetus = await prisma.fetus.update({ where: { id }, data: clean(body) })
    await audit(req, 'UPDATE', 'Fetus', id, `плод ${fetus.label}`)
    return fetus
  })

  // ───────────── Скрининг ─────────────
  app.post('/screening', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const body = screeningBody.parse(req.body)
    if (!body.pregnancyId) throw new Error('Не указана беременность')
    const s = await prisma.screening.create({
      data: { ...clean({ ...body, pregnancyId: undefined }), pregnancyId: body.pregnancyId },
    })
    await audit(req, 'CREATE', 'Screening', s.id, `скрининг ${s.trimester ?? ''} триместра`)
    return s
  })

  app.patch('/screening/:id', { preHandler: requireRole('DOCTOR') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = screeningBody.partial().parse(req.body)
    const before = await prisma.screening.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Запись скрининга не найдена' })
    const s = await prisma.screening.update({
      where: { id },
      data: clean({ ...body, pregnancyId: undefined }),
    })
    await audit(req, 'UPDATE', 'Screening', id, 'скрининг', diff(before, s))
    return s
  })

  app.delete('/screening/:id', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const { id } = req.params as { id: string }
    await prisma.screening.delete({ where: { id } })
    await audit(req, 'DELETE', 'Screening', id, 'удалена запись скрининга')
    return { ok: true }
  })
}
