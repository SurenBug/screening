import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { DICTIONARY_SEED } from '../src/dictionaries.js'

const prisma = new PrismaClient()

async function main() {
  // Справочники
  let created = 0
  for (const [i, d] of DICTIONARY_SEED.entries()) {
    const existing = await prisma.dictionary.findUnique({
      where: { type_code: { type: d.type, code: d.code } },
    })
    if (existing) continue
    await prisma.dictionary.create({
      data: {
        type: d.type,
        code: d.code,
        label: d.label,
        numValue: d.numValue ?? null,
        flag: d.flag ?? false,
        isSystem: d.isSystem ?? false,
        sortOrder: i,
      },
    })
    created++
  }
  console.log(`Справочники: добавлено значений — ${created}`)

  // Учётные записи по умолчанию
  const defaults = [
    { login: 'admin', fullName: 'Администратор системы', role: 'ADMIN', password: 'admin123' },
    { login: 'doctor', fullName: 'Врач (демо)', role: 'DOCTOR', password: 'doctor123' },
    { login: 'lab', fullName: 'Лаборант (демо)', role: 'LAB', password: 'lab123' },
  ]

  for (const u of defaults) {
    const existing = await prisma.user.findUnique({ where: { login: u.login } })
    if (existing) continue
    await prisma.user.create({
      data: {
        login: u.login,
        fullName: u.fullName,
        role: u.role,
        passwordHash: await bcrypt.hash(u.password, 10),
        mustChangePassword: true,
      },
    })
    console.log(`Создан пользователь ${u.login} / ${u.password} (смена пароля при первом входе)`)
  }

  // Настройки по умолчанию
  const settings: Record<string, string> = {
    institutionName: 'Отделение пренатальной диагностики',
    sessionTimeoutMinutes: '30',
    outcomeReminderDaysAfterEdd: '30',
  }
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: {} })
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
