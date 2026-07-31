/**
 * Подготовка базы при сборке на Vercel.
 * В бессерверной функции миграции запустить нельзя, а во время сборки —
 * можно: DATABASE_URL уже доступен. Обе команды безопасно повторять:
 * db push только досоздаёт недостающее, а seed пропускает то, что уже есть.
 */
import { execSync } from 'node:child_process'

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL не задан — база не подготовлена.')
  console.warn('Добавьте базу в разделе Storage, иначе сервис поднимется без данных и войти будет нельзя.')
  process.exit(0)
}

const schema = 'server/prisma/schema.postgres.prisma'
const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

console.log('Приводим таблицы в соответствие со схемой…')
run(`npx prisma db push --schema ${schema} --skip-generate`)

console.log('Заполняем справочники и учётные записи…')
run('npm run seed -w server')
