import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildApp } from '../server/src/app.js'

/**
 * Точка входа для Vercel: тот же самый сервер Fastify, но вместо прослушивания
 * порта запрос передаётся напрямую. Экземпляр создаётся один раз на «тёплый»
 * контейнер, поэтому повторные запросы не платят за инициализацию.
 */
let ready: Promise<Awaited<ReturnType<typeof buildApp>>> | null = null

async function getApp() {
  if (!ready) {
    ready = buildApp().then(async (app) => {
      await app.ready()
      return app
    })
  }
  return ready
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  app.server.emit('request', req, res)
}
