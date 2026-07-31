import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard, hashPassword, requireRole } from '../auth.js'
import { audit } from '../audit.js'
import { clean } from './patients.js'

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  /** Список нужен всем: врач выбирает оператора и ассистента процедуры. */
  app.get('/', async () => {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { fullName: 'asc' }],
      select: {
        id: true,
        login: true,
        fullName: true,
        position: true,
        role: true,
        isActive: true,
        telegramId: true,
        createdAt: true,
      },
    })
    return users
  })

  app.post('/', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const body = z
      .object({
        login: z.string().min(3),
        fullName: z.string().min(3),
        position: z.string().nullish(),
        role: z.enum(['DOCTOR', 'LAB', 'ADMIN']),
        password: z.string().min(8),
      })
      .parse(req.body)

    const login = body.login.trim().toLowerCase()
    if (await prisma.user.findUnique({ where: { login } })) {
      return reply.code(400).send({ error: 'Пользователь с таким логином уже есть' })
    }

    const user = await prisma.user.create({
      data: {
        login,
        fullName: body.fullName.trim(),
        position: body.position ?? null,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        mustChangePassword: true,
      },
      select: { id: true, login: true, fullName: true, role: true, isActive: true },
    })
    await audit(req, 'CREATE', 'User', user.id, `${user.fullName} (${user.role})`)
    return user
  })

  app.patch('/:id', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        fullName: z.string().min(3).optional(),
        position: z.string().nullish(),
        role: z.enum(['DOCTOR', 'LAB', 'ADMIN']).optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(8).optional(),
      })
      .parse(req.body)

    const data: any = clean({ ...body, password: undefined })
    if (body.password) {
      data.passwordHash = await hashPassword(body.password)
      data.mustChangePassword = true
      // Сброс пароля закрывает все активные сессии этого пользователя
      await prisma.session.deleteMany({ where: { userId: id } })
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, login: true, fullName: true, role: true, isActive: true },
    })
    await audit(req, 'UPDATE', 'User', id, user.fullName, { ...body, password: body.password ? '***' : undefined })
    return user
  })

  // ───────────── Журнал доступа ─────────────
  app.get('/audit', { preHandler: requireRole('ADMIN') }, async (req) => {
    const q = req.query as Record<string, string | undefined>
    const where: any = {}
    if (q.userId) where.userId = q.userId
    if (q.entity) where.entity = q.entity
    if (q.action) where.action = q.action
    if (q.from || q.to) {
      where.createdAt = {}
      if (q.from) where.createdAt.gte = new Date(q.from)
      if (q.to) {
        const d = new Date(q.to)
        d.setHours(23, 59, 59, 999)
        where.createdAt.lte = d
      }
    }
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(q.limit ?? 200), 1000),
      include: { user: { select: { fullName: true, login: true } } },
    })
    return rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null }))
  })

  // ───────────── Настройки ─────────────
  app.get('/settings', async () => {
    const rows = await prisma.setting.findMany()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  app.put('/settings', { preHandler: requireRole('ADMIN') }, async (req) => {
    const body = z.record(z.string()).parse(req.body)
    for (const [key, value] of Object.entries(body)) {
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    }
    await audit(req, 'UPDATE', 'Setting', null, 'изменены настройки', body)
    return { ok: true }
  })
}
