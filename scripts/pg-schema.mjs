/**
 * На своём компьютере база — SQLite, на сервере — PostgreSQL.
 * Prisma не умеет выбирать провайдера через переменную окружения, поэтому
 * для развёртывания схема копируется с заменой одной строки.
 * Исходный server/prisma/schema.prisma не меняется — локальная разработка не ломается.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(root, 'server/prisma/schema.prisma')
const out = path.join(root, 'server/prisma/schema.postgres.prisma')

const schema = readFileSync(src, 'utf8')
if (!schema.includes('provider = "sqlite"')) {
  console.error('В схеме не найден provider = "sqlite" — проверьте server/prisma/schema.prisma')
  process.exit(1)
}

writeFileSync(out, schema.replace('provider = "sqlite"', 'provider = "postgresql"'))
console.log('Схема для PostgreSQL готова:', path.relative(root, out))
