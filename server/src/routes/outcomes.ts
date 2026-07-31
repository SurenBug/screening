import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard, requireRole } from '../auth.js'
import { audit } from '../audit.js'
import { clean } from './patients.js'

const dateish = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : new Date(v as any)))

const outcomeBody = z.object({
  outcomeType: z.string().nullish(),
  date: dateish,
  gestWeeks: z.number().int().nullish(),
  gestDays: z.number().int().nullish(),
  birthWeight: z.number().int().nullish(),
  apgar1: z.number().int().nullish(),
  apgar5: z.number().int().nullish(),
  childCondition: z.string().nullish(),
  postnatalConfirmation: z.string().nullish(),
  postnatalDiagnosis: z.string().nullish(),
  procedureRelatedLoss: z.boolean().optional(),
  notes: z.string().nullish(),
})

export default async function outcomeRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  /** Исход заполняется по каждому плоду отдельно — при двойне их два. */
  app.put('/fetus/:fetusId', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const { fetusId } = req.params as { fetusId: string }
    const body = outcomeBody.parse(req.body)

    const outcome = await prisma.outcome.upsert({
      where: { fetusId },
      create: { fetusId, ...clean(body) },
      update: clean(body),
      include: {
        fetus: { include: { pregnancy: { include: { procedures: true, patient: true } } } },
      },
    })

    // Если исходы внесены по всем плодам — закрываем процедуры этой беременности
    const fetuses = await prisma.fetus.findMany({
      where: { pregnancyId: outcome.fetus.pregnancyId },
      include: { outcome: true },
    })
    if (fetuses.every((f) => f.outcome?.outcomeType)) {
      await prisma.procedure.updateMany({
        where: {
          pregnancyId: outcome.fetus.pregnancyId,
          status: { in: ['RESULT_DELIVERED', 'RESULT_READY', 'IN_LAB', 'PERFORMED'] },
        },
        data: { status: 'OUTCOME_RECORDED' },
      })
      await prisma.task.updateMany({
        where: {
          patientId: outcome.fetus.pregnancy.patientId,
          type: 'RECORD_OUTCOME',
          status: 'OPEN',
        },
        data: { status: 'DONE', completedAt: new Date() },
      })
    }

    await audit(req, 'UPDATE', 'Outcome', outcome.id, `плод ${outcome.fetus.label}: ${body.outcomeType ?? ''}`)
    return outcome
  })

  app.get('/pending', async () => {
    // Беременности, у которых прошла предполагаемая дата родов, а исход не внесён
    const cutoff = new Date(Date.now() - 30 * 86_400_000)
    const rows = await prisma.pregnancy.findMany({
      where: {
        edd: { lt: cutoff },
        procedures: { some: { status: { notIn: ['CANCELLED', 'DRAFT'] } } },
        fetuses: { some: { outcome: { is: null } } },
      },
      include: {
        patient: true,
        fetuses: { include: { outcome: true } },
        procedures: { select: { id: true, code: true, performedAt: true, procedureType: true } },
      },
      orderBy: { edd: 'asc' },
      take: 200,
    })
    return rows
  })
}
