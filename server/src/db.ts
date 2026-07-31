import { PrismaClient } from '@prisma/client'

/**
 * Neon (база на Vercel) даёт две строки подключения: через пул соединений и прямую.
 * Приложению нужна пулерная — в бессерверной среде соединения открываются
 * и закрываются постоянно. Prisma требует у неё пометку pgbouncer=true,
 * поэтому берём готовую POSTGRES_PRISMA_URL, когда она есть.
 * На своём сервере и при разработке ничего не меняется — работает DATABASE_URL.
 */
const url = process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL

export const prisma = new PrismaClient(url ? { datasourceUrl: url } : {})

/**
 * Выдаёт следующий номер в году для кода пациентки или процедуры.
 * Транзакция нужна потому, что вносить будут одновременно несколько человек.
 */
export async function nextNumber(key: string): Promise<number> {
  const row = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  })
  return row.value
}

export async function nextPatientCode(): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextNumber(`patient:${year}`)
  return `PD-${year}-${String(n).padStart(3, '0')}`
}

export async function nextProcedureCode(): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextNumber(`procedure:${year}`)
  return `IPD-${year}-${String(n).padStart(4, '0')}`
}
