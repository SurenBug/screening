import { buildApp } from './app.js'
import { prisma } from './db.js'

const app = await buildApp()

const port = Number(process.env.PORT ?? 3001)
await app.listen({ port, host: '0.0.0.0' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  })
}
