import type { FastifyRequest } from 'fastify'
import { prisma } from './db.js'

type Action = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'ARCHIVE'

export async function audit(
  req: FastifyRequest,
  action: Action,
  entity: string,
  entityId?: string | null,
  summary?: string,
  changes?: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        summary: summary ?? null,
        changes: changes ? JSON.stringify(changes) : null,
        ip: req.ip,
      },
    })
  } catch (err) {
    req.log.error({ err }, 'не удалось записать в журнал аудита')
  }
}

/** Различия между старой и новой версией записи — чтобы в истории было видно, что именно поменяли. */
export function diff(before: Record<string, any>, after: Record<string, any>) {
  const changed: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(after)) {
    const a = before[key]
    const b = after[key]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) {
      changed[key] = { from: norm(a), to: norm(b) }
    }
  }
  return changed
}
