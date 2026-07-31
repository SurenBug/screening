import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import {
  authGuard,
  clearSessionCookie,
  createSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from '../auth.js'
import { audit } from '../audit.js'

export default async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const body = z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(req.body)

    const user = await prisma.user.findUnique({ where: { login: body.login.trim().toLowerCase() } })
    if (!user || !user.isActive || !(await verifyPassword(body.password, user.passwordHash))) {
      // Одинаковый текст на «нет такого логина» и «неверный пароль» — намеренно.
      return reply.code(401).send({ error: 'Неверный логин или пароль' })
    }

    const session = await createSession(user.id, req)
    setSessionCookie(reply, session.id)
    req.user = {
      id: user.id,
      login: user.login,
      fullName: user.fullName,
      role: user.role as any,
      mustChangePassword: user.mustChangePassword,
    }
    await audit(req, 'LOGIN', 'User', user.id, user.fullName)

    return {
      id: user.id,
      login: user.login,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    }
  })

  app.post('/logout', async (req, reply) => {
    if (req.sessionId) {
      await audit(req, 'LOGOUT', 'User', req.user?.id)
      await prisma.session.delete({ where: { id: req.sessionId } }).catch(() => {})
    }
    clearSessionCookie(reply)
    return { ok: true }
  })

  app.get('/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Не авторизован' })
    return req.user
  })

  app.post('/change-password', { preHandler: authGuard }, async (req, reply) => {
    const body = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(8) })
      .parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: 'Текущий пароль указан неверно' })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false },
    })
    await audit(req, 'UPDATE', 'User', user.id, 'смена пароля')
    return { ok: true }
  })
}
