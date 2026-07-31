import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

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
