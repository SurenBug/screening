import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard } from '../auth.js'
import { fio } from './patients.js'

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  app.get('/', async (req) => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const weekEnd = new Date(todayStart.getTime() + 7 * 86_400_000)
    const outcomeCutoff = new Date(now.getTime() - 30 * 86_400_000)

    const [today, week, awaiting, overdue, undelivered, pendingOutcome, pathologyWeek, recent] =
      await Promise.all([
        prisma.procedure.count({
          where: {
            status: { in: ['PLANNED', 'PERFORMED'] },
            OR: [
              { plannedDate: { gte: todayStart, lte: todayEnd } },
              { performedAt: { gte: todayStart, lte: todayEnd } },
            ],
          },
        }),
        prisma.procedure.count({
          where: { status: 'PLANNED', plannedDate: { gte: todayStart, lt: weekEnd } },
        }),
        prisma.sample.count({
          where: { status: { in: ['HANDED', 'RECEIVED', 'CULTURING', 'ANALYSIS'] } },
        }),
        prisma.sample.count({
          where: {
            status: { in: ['HANDED', 'RECEIVED', 'CULTURING', 'ANALYSIS'] },
            deadline: { lt: now },
          },
        }),
        prisma.result.count({ where: { deliveredAt: null } }),
        prisma.pregnancy.count({
          where: {
            edd: { lt: outcomeCutoff },
            procedures: { some: { status: { notIn: ['CANCELLED', 'DRAFT'] } } },
            fetuses: { some: { outcome: { is: null } } },
          },
        }),
        prisma.result.findMany({
          // Отбор по дате готовности результата, а не по дате внесения в систему:
          // задним числом внесённое старое заключение не должно всплывать как «за неделю»
          where: { isPathological: true, reportedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
          include: {
            sample: {
              include: {
                fetus: true,
                procedure: { include: { pregnancy: { include: { patient: true } } } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.auditLog.findMany({
          where: { action: { in: ['CREATE', 'UPDATE'] } },
          orderBy: { createdAt: 'desc' },
          take: 15,
          include: { user: { select: { fullName: true } } },
        }),
      ])

    return {
      tiles: {
        today,
        week,
        awaiting,
        overdue,
        undelivered,
        pendingOutcome,
      },
      pathology: pathologyWeek.map((r) => ({
        id: r.id,
        category: r.category,
        karyotype: r.karyotype,
        reportedAt: r.reportedAt,
        deliveredAt: r.deliveredAt,
        sampleCode: r.sample.code,
        fetusLabel: r.sample.fetus?.label ?? null,
        procedureId: r.sample.procedureId,
        patient: {
          id: r.sample.procedure.pregnancy.patient.id,
          code: r.sample.procedure.pregnancy.patient.code,
          fullName: fio(r.sample.procedure.pregnancy.patient),
        },
      })),
      feed: recent.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        summary: a.summary,
        user: a.user?.fullName ?? 'система',
        createdAt: a.createdAt,
      })),
    }
  })

  // ───────────── Задачи ─────────────
  app.get('/tasks', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const where: any = { status: q.status ?? 'OPEN' }
    if (q.mine === '1') where.assigneeId = req.user!.id
    const rows = await prisma.task.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        patient: { select: { id: true, code: true, lastName: true, firstName: true, middleName: true } },
        assignee: { select: { id: true, fullName: true } },
      },
    })
    return rows.map((t) => ({
      ...t,
      patientName: t.patient ? fio(t.patient) : null,
      overdue: t.dueDate ? t.dueDate < new Date() : false,
    }))
  })

  app.post('/tasks/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({ status: z.enum(['OPEN', 'DONE', 'SNOOZED', 'CANCELLED']), snoozeDays: z.number().optional() })
      .parse(req.body)

    const data: any = { status: body.status }
    if (body.status === 'DONE') data.completedAt = new Date()
    if (body.status === 'SNOOZED') {
      data.snoozedUntil = new Date(Date.now() + (body.snoozeDays ?? 7) * 86_400_000)
    }
    return prisma.task.update({ where: { id }, data })
  })

  /**
   * Пересборка задач: просроченные анализы и незаполненные исходы.
   * Вызывается по расписанию, а пока — при открытии дашборда.
   */
  app.post('/tasks/rebuild', async () => {
    const now = new Date()

    const overdue = await prisma.sample.findMany({
      where: {
        status: { in: ['HANDED', 'RECEIVED', 'CULTURING', 'ANALYSIS'] },
        deadline: { lt: now },
      },
      include: { procedure: { include: { pregnancy: { include: { patient: true } } } } },
    })
    for (const s of overdue) {
      const exists = await prisma.task.findFirst({
        where: { type: 'RESULT_OVERDUE', procedureId: s.procedureId, status: 'OPEN' },
      })
      if (exists) continue
      await prisma.task.create({
        data: {
          type: 'RESULT_OVERDUE',
          title: `Просрочен результат по образцу ${s.code} (${fio(s.procedure.pregnancy.patient)})`,
          dueDate: s.deadline,
          patientId: s.procedure.pregnancy.patientId,
          procedureId: s.procedureId,
          assigneeId: s.labUserId ?? s.procedure.operatorId,
        },
      })
    }

    const cutoff = new Date(now.getTime() - 30 * 86_400_000)
    const pending = await prisma.pregnancy.findMany({
      where: {
        edd: { lt: cutoff },
        procedures: { some: { status: { notIn: ['CANCELLED', 'DRAFT'] } } },
        fetuses: { some: { outcome: { is: null } } },
      },
      include: { patient: true, procedures: { take: 1, orderBy: { performedAt: 'desc' } } },
    })
    for (const p of pending) {
      const exists = await prisma.task.findFirst({
        where: { type: 'RECORD_OUTCOME', patientId: p.patientId, status: 'OPEN' },
      })
      if (exists) continue
      await prisma.task.create({
        data: {
          type: 'RECORD_OUTCOME',
          title: `Внести исход беременности: ${fio(p.patient)} (${p.patient.code})`,
          dueDate: p.edd,
          patientId: p.patientId,
          procedureId: p.procedures[0]?.id ?? null,
          assigneeId: p.procedures[0]?.operatorId ?? null,
        },
      })
    }

    return { ok: true }
  })
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}
