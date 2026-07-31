import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { ZodError } from 'zod'
import { loadUser } from './auth.js'

import authRoutes from './routes/auth.js'
import dictionaryRoutes from './routes/dictionaries.js'
import patientRoutes from './routes/patients.js'
import pregnancyRoutes from './routes/pregnancies.js'
import procedureRoutes from './routes/procedures.js'
import labRoutes from './routes/lab.js'
import outcomeRoutes from './routes/outcomes.js'
import dashboardRoutes from './routes/dashboard.js'
import reportRoutes from './routes/reports.js'
import userRoutes from './routes/users.js'
import exportRoutes from './routes/export.js'
import recognitionRoutes from './routes/recognition.js'

/**
 * Сборка приложения отделена от запуска: на своём сервере вызывается listen(),
 * а в бессерверном окружении (Vercel) тот же экземпляр отдаётся обработчику запроса.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 25 * 1024 * 1024,
    trustProxy: true,
  })

  await app.register(cookie)
  await app.register(cors, {
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  })
  // Фотографии документов с телефона: снимок камеры легко весит 8–10 МБ
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 5 } })

  app.addHook('preHandler', loadUser)

  // Понятные сообщения об ошибках: их читает врач, а не разработчик
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const first = err.errors[0]
      return reply.code(400).send({
        error: first?.message ?? 'Проверьте заполнение полей',
        field: first?.path.join('.'),
        details: err.errors,
      })
    }
    req.log.error({ err }, 'ошибка запроса')
    const e = err as { statusCode?: number; message?: string }
    const status = e.statusCode ?? 500
    return reply.code(status).send({ error: e.message || 'Внутренняя ошибка сервера' })
  })

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(dictionaryRoutes, { prefix: '/api/dictionaries' })
  await app.register(patientRoutes, { prefix: '/api/patients' })
  await app.register(pregnancyRoutes, { prefix: '/api/pregnancies' })
  await app.register(procedureRoutes, { prefix: '/api/procedures' })
  await app.register(labRoutes, { prefix: '/api/lab' })
  await app.register(outcomeRoutes, { prefix: '/api/outcomes' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(reportRoutes, { prefix: '/api/reports' })
  await app.register(userRoutes, { prefix: '/api/users' })
  await app.register(exportRoutes, { prefix: '/api/export' })
  await app.register(recognitionRoutes, { prefix: '/api/recognition' })

  return app
}
