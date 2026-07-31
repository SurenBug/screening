import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { nextPatientCode, prisma } from '../db.js'
import { authGuard, requireRole } from '../auth.js'
import { audit, diff } from '../audit.js'
import { age, estimatedDueDate, gestationAt } from '../util/gestation.js'

const dateish = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : new Date(v as any)))

const patientBody = z.object({
  lastName: z.string().min(1, 'Укажите фамилию'),
  firstName: z.string().min(1, 'Укажите имя'),
  middleName: z.string().nullish(),
  birthDate: dateish,
  phone: z.string().nullish(),
  cardNumber: z.string().nullish(),
  bloodGroup: z.string().nullish(),
  rhesus: z.enum(['POS', 'NEG']).nullish(),
  address: z.string().nullish(),
  referringInstitution: z.string().nullish(),
  snils: z.string().nullish(),
  policy: z.string().nullish(),
  gravida: z.number().int().nullish(),
  para: z.number().int().nullish(),
  abortions: z.number().int().nullish(),
  miscarriages: z.number().int().nullish(),
  stillbirths: z.number().int().nullish(),
  ivf: z.boolean().optional(),
  consanguinity: z.boolean().optional(),
  familyHistory: z.string().nullish(),
  obstetricHistory: z.string().nullish(),
  geneticHistory: z.string().nullish(),
  teratogens: z.string().nullish(),
  chronicDiseases: z.string().nullish(),
  notes: z.string().nullish(),
})

export default async function patientRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  // ───────────── Список и поиск ─────────────
  app.get('/', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const search = q.search?.trim()
    const take = Math.min(Number(q.limit ?? 50), 500)
    const skip = Number(q.offset ?? 0)

    const where: any = {}
    if (!q.includeArchived) where.archivedAt = null
    if (search) {
      // SQLite: contains без mode — регистр учитывается для кириллицы,
      // поэтому дополнительно ищем по варианту с заглавной первой буквой.
      const variants = [search, capitalize(search), search.toLowerCase(), search.toUpperCase()]
      where.OR = variants.flatMap((v) => [
        { lastName: { contains: v } },
        { firstName: { contains: v } },
        { middleName: { contains: v } },
        { code: { contains: v } },
        { cardNumber: { contains: v } },
        { phone: { contains: v } },
      ])
    }

    const [items, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          pregnancies: {
            orderBy: { createdAt: 'desc' },
            include: {
              procedures: {
                orderBy: { performedAt: 'desc' },
                select: { id: true, code: true, status: true, procedureType: true, performedAt: true },
              },
            },
          },
        },
      }),
      prisma.patient.count({ where }),
    ])

    return {
      total,
      items: items.map((p) => {
        const last = p.pregnancies[0]?.procedures[0]
        return {
          id: p.id,
          code: p.code,
          fullName: fio(p),
          birthDate: p.birthDate,
          age: age(p.birthDate),
          phone: p.phone,
          cardNumber: p.cardNumber,
          rhesus: p.rhesus,
          referringInstitution: p.referringInstitution,
          pregnancyCount: p.pregnancies.length,
          lastProcedure: last ?? null,
          archivedAt: p.archivedAt,
        }
      }),
    }
  })

  // ───────────── Карточка ─────────────
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const p = await prisma.patient.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        pregnancies: {
          orderBy: { createdAt: 'desc' },
          include: {
            fetuses: {
              orderBy: { label: 'asc' },
              include: { outcome: true },
            },
            screenings: { orderBy: { date: 'asc' } },
            procedures: {
              orderBy: { createdAt: 'desc' },
              include: {
                operator: { select: { id: true, fullName: true } },
                indications: { include: { dictionary: true } },
                complications: { include: { dictionary: true } },
                samples: {
                  include: {
                    fetus: { select: { id: true, label: true } },
                    methods: { include: { dictionary: true } },
                    results: { orderBy: { createdAt: 'desc' } },
                  },
                },
              },
            },
          },
        },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!p) return reply.code(404).send({ error: 'Пациентка не найдена' })

    await audit(req, 'VIEW', 'Patient', p.id, fio(p))

    return {
      ...p,
      fullName: fio(p),
      age: age(p.birthDate),
      pregnancies: p.pregnancies.map((pr) => ({
        ...pr,
        edd: pr.edd ?? estimatedDueDate(pr),
        currentGestation: gestationAt(pr, new Date()),
      })),
    }
  })

  // ───────────── Создание ─────────────
  app.post('/', { preHandler: requireRole('DOCTOR') }, async (req) => {
    const body = patientBody.parse(req.body)
    if (!body.birthDate) throw new Error('Укажите дату рождения')

    const patient = await prisma.patient.create({
      data: {
        ...clean(body),
        birthDate: body.birthDate,
        code: await nextPatientCode(),
        createdById: req.user!.id,
      },
    })
    await audit(req, 'CREATE', 'Patient', patient.id, fio(patient))
    return patient
  })

  // ───────────── Изменение ─────────────
  app.patch('/:id', { preHandler: requireRole('DOCTOR') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = patientBody.partial().parse(req.body)
    const before = await prisma.patient.findUnique({ where: { id } })
    if (!before) return reply.code(404).send({ error: 'Пациентка не найдена' })

    // Дата рождения обязательна: пустым значением её не затираем
    const data: Record<string, any> = clean(body)
    if (data.birthDate == null) delete data.birthDate

    const patient = await prisma.patient.update({ where: { id }, data })
    await audit(req, 'UPDATE', 'Patient', id, fio(patient), diff(before, patient))
    return patient
  })

  /** Удаления нет — только аннулирование с причиной. */
  app.post('/:id/archive', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = req.params as { id: string }
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body)
    const patient = await prisma.patient.update({
      where: { id },
      data: { archivedAt: new Date(), archiveReason: reason },
    })
    await audit(req, 'ARCHIVE', 'Patient', id, reason)
    return patient
  })

  // ───────────── История изменений ─────────────
  app.get('/:id/history', async (req) => {
    const { id } = req.params as { id: string }
    const pregnancies = await prisma.pregnancy.findMany({
      where: { patientId: id },
      select: { id: true, procedures: { select: { id: true } } },
    })
    const ids = [
      id,
      ...pregnancies.map((p) => p.id),
      ...pregnancies.flatMap((p) => p.procedures.map((x) => x.id)),
    ]
    const rows = await prisma.auditLog.findMany({
      where: { entityId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    })
    return rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }))
  })
}

export function fio(p: { lastName: string; firstName: string; middleName?: string | null }) {
  return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Убирает undefined, чтобы PATCH не затирал незаполненные поля. */
export function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out as T
}
