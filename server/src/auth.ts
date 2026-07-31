import type { FastifyReply, FastifyRequest } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from './db.js'

export const SESSION_COOKIE = 'pdreg_session'
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12)

export type Role = 'DOCTOR' | 'LAB' | 'ADMIN'

export interface AuthUser {
  id: string
  login: string
  fullName: string
  role: Role
  mustChangePassword: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
    sessionId?: string
  }
}

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10)
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}

export async function createSession(userId: string, req: FastifyRequest) {
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600_000)
  return prisma.session.create({
    data: {
      userId,
      expiresAt,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    },
  })
}

export function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TTL_HOURS * 3600,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

/** Подгружает пользователя из cookie для каждого запроса. Не отклоняет анонимов. */
export async function loadUser(req: FastifyRequest) {
  const sid = req.cookies?.[SESSION_COOKIE]
  if (!sid) return
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: true },
  })
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return
  req.sessionId = session.id
  req.user = {
    id: session.user.id,
    login: session.user.login,
    fullName: session.user.fullName,
    role: session.user.role as Role,
    mustChangePassword: session.user.mustChangePassword,
  }
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    reply.code(401).send({ error: 'Требуется вход в систему' })
    return false
  }
  return true
}

/**
 * Проверка роли. Администратор проходит везде.
 */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: 'Требуется вход в систему' })
    }
    if (req.user.role === 'ADMIN') return
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Недостаточно прав для этого действия' })
    }
  }
}

export async function authGuard(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) {
    return reply.code(401).send({ error: 'Требуется вход в систему' })
  }
}
