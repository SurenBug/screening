import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authGuard, requireRole } from '../auth.js'
import { audit } from '../audit.js'
import { DICTIONARY_TYPES } from '../dictionaries.js'

export default async function dictionaryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  /** Все справочники одним запросом — фронтенд загружает их один раз при входе. */
  app.get('/', async (req) => {
    const includeInactive = (req.query as any)?.all === '1'
    const rows = await prisma.dictionary.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    })
    const grouped: Record<string, typeof rows> = {}
    for (const r of rows) (grouped[r.type] ??= []).push(r)
    return { types: DICTIONARY_TYPES, items: grouped }
  })

  app.post('/', { preHandler: requireRole('ADMIN') }, async (req) => {
    const body = z
      .object({
        type: z.string(),
        code: z.string().optional(),
        label: z.string().min(1),
        numValue: z.number().int().nullable().optional(),
        flag: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body)

    const code = body.code?.trim() || slugCode(body.label)
    const item = await prisma.dictionary.create({
      data: {
        type: body.type,
        code,
        label: body.label.trim(),
        numValue: body.numValue ?? null,
        flag: body.flag ?? false,
        sortOrder: body.sortOrder ?? 999,
      },
    })
    await audit(req, 'CREATE', 'Dictionary', item.id, `${body.type}: ${body.label}`)
    return item
  })

  app.patch('/:id', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        label: z.string().min(1).optional(),
        numValue: z.number().int().nullable().optional(),
        flag: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body)

    const item = await prisma.dictionary.update({ where: { id }, data: body })
    await audit(req, 'UPDATE', 'Dictionary', id, item.label, body)
    return item
  })

  /** Значения не удаляются, а архивируются: на них могут ссылаться старые записи. */
  app.delete('/:id', { preHandler: requireRole('ADMIN') }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const item = await prisma.dictionary.findUnique({ where: { id } })
    if (!item) return reply.code(404).send({ error: 'Значение не найдено' })
    if (item.isSystem) {
      return reply.code(400).send({ error: 'Системное значение нельзя удалить, его можно только скрыть' })
    }
    const updated = await prisma.dictionary.update({ where: { id }, data: { isActive: false } })
    await audit(req, 'ARCHIVE', 'Dictionary', id, item.label)
    return updated
  })
}

function slugCode(label: string) {
  return (
    label
      .toUpperCase()
      .replace(/[^A-ZА-Я0-9]+/gi, '_')
      .slice(0, 30) + '_' + Math.random().toString(36).slice(2, 6).toUpperCase()
  )
}
