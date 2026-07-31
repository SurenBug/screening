import type { FastifyInstance } from 'fastify'
import ExcelJS from 'exceljs'
import { prisma } from '../db.js'
import { authGuard } from '../auth.js'
import { audit } from '../audit.js'
import { fio } from './patients.js'
import { age, formatGestation } from '../util/gestation.js'

/**
 * Выгрузка реестра в Excel — тот же плоский формат, что и бумажный журнал:
 * одна строка = один образец (при двойне — две строки на одну процедуру).
 */
export default async function exportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  app.get('/journal.xlsx', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    const where: any = { status: { notIn: ['DRAFT'] } }
    if (q.from || q.to) {
      where.performedAt = {}
      if (q.from) where.performedAt.gte = new Date(q.from)
      if (q.to) {
        const d = new Date(q.to)
        d.setHours(23, 59, 59, 999)
        where.performedAt.lte = d
      }
    }

    const procedures = await prisma.procedure.findMany({
      where,
      orderBy: [{ performedAt: 'asc' }],
      include: {
        operator: true,
        assistant: true,
        indications: { include: { dictionary: true } },
        complications: { include: { dictionary: true } },
        pregnancy: {
          include: {
            patient: true,
            screenings: { orderBy: { date: 'asc' } },
            fetuses: { include: { outcome: true } },
          },
        },
        samples: {
          include: {
            fetus: { include: { outcome: true } },
            methods: { include: { dictionary: true } },
            results: { orderBy: { createdAt: 'desc' }, include: { performedBy: true } },
          },
        },
      },
    })

    const dict = await prisma.dictionary.findMany()
    const label = (type: string, code?: string | null) =>
      dict.find((d) => d.type === type && d.code === code)?.label ?? code ?? ''

    const wb = new ExcelJS.Workbook()
    wb.creator = 'Реестр пренатальной диагностики'
    const ws = wb.addWorksheet('Реестр', { views: [{ state: 'frozen', ySplit: 1 }] })

    const columns = [
      { header: '№ процедуры', key: 'procCode', width: 16 },
      { header: 'Код пациентки', key: 'patCode', width: 14 },
      { header: 'ФИО', key: 'fio', width: 30 },
      { header: 'Дата рождения', key: 'birth', width: 14 },
      { header: 'Возраст', key: 'age', width: 9 },
      { header: 'Резус', key: 'rh', width: 8 },
      { header: 'Направившее учреждение', key: 'inst', width: 26 },
      { header: 'Беременность №', key: 'pregNo', width: 14 },
      { header: 'Плодность', key: 'plurality', width: 12 },
      { header: 'Плод', key: 'fetus', width: 7 },
      { header: 'Показания', key: 'indications', width: 40 },
      { header: 'Риск 1:X', key: 'risk', width: 10 },
      { header: 'ТВП, мм', key: 'nt', width: 9 },
      { header: 'PAPP-A, МоМ', key: 'pappa', width: 12 },
      { header: 'ХГЧ, МоМ', key: 'hcg', width: 11 },
      { header: 'НИПТ', key: 'nipt', width: 20 },
      { header: 'Вид процедуры', key: 'type', width: 24 },
      { header: 'Дата процедуры', key: 'date', width: 15 },
      { header: 'Срок', key: 'gest', width: 13 },
      { header: 'Доступ', key: 'access', width: 18 },
      { header: 'Игла', key: 'needle', width: 8 },
      { header: 'Число пункций', key: 'punctures', width: 13 },
      { header: 'Оператор', key: 'operator', width: 24 },
      { header: 'Анти-D', key: 'antiD', width: 10 },
      { header: 'Материал', key: 'material', width: 20 },
      { header: 'Код образца', key: 'sampleCode', width: 18 },
      { header: 'Методы', key: 'methods', width: 34 },
      { header: 'Дата результата', key: 'resultDate', width: 15 },
      { header: 'Срок выполнения, дн', key: 'tat', width: 18 },
      { header: 'Категория результата', key: 'category', width: 32 },
      { header: 'Кариотип (ISCN)', key: 'karyotype', width: 22 },
      { header: 'Патология', key: 'path', width: 11 },
      { header: 'Заключение', key: 'conclusion', width: 40 },
      { header: 'Выдан пациентке', key: 'delivered', width: 16 },
      { header: 'Осложнения', key: 'complications', width: 30 },
      { header: 'Исход беременности', key: 'outcome', width: 28 },
      { header: 'Дата исхода', key: 'outcomeDate', width: 14 },
      { header: 'Постнатальное подтверждение', key: 'postnatal', width: 24 },
      { header: 'Статус', key: 'status', width: 20 },
    ]
    ws.columns = columns

    for (const p of procedures) {
      const scr = p.pregnancy.screenings[0]
      const rows = p.samples.length ? p.samples : [null]
      for (const s of rows) {
        const r = s?.results[0]
        const outcome = s?.fetus?.outcome ?? p.pregnancy.fetuses[0]?.outcome ?? null
        const start = s?.receivedAt ?? s?.handedAt ?? p.performedAt
        ws.addRow({
          procCode: p.code,
          patCode: p.pregnancy.patient.code,
          fio: fio(p.pregnancy.patient),
          birth: fmtDate(p.pregnancy.patient.birthDate),
          age: age(p.pregnancy.patient.birthDate, p.performedAt ?? new Date()),
          rh: p.pregnancy.patient.rhesus === 'NEG' ? 'отр.' : p.pregnancy.patient.rhesus === 'POS' ? 'полож.' : '',
          inst: p.pregnancy.patient.referringInstitution ?? '',
          pregNo: p.pregnancy.number ?? '',
          plurality: p.pregnancy.plurality === 'MULTIPLE' ? `многоплодная (${p.pregnancy.fetusCount})` : 'одноплодная',
          fetus: s?.fetus?.label ?? '',
          indications: p.indications.map((i) => i.dictionary.label).join('; '),
          risk: p.riskValue ?? scr?.riskT21 ?? '',
          nt: scr?.ntMm ?? '',
          pappa: scr?.pappaMom ?? '',
          hcg: scr?.hcgMom ?? '',
          nipt: scr?.niptResult ?? '',
          type: label('PROCEDURE_TYPE', p.procedureType),
          date: fmtDate(p.performedAt),
          gest: formatGestation(p.gestWeeks, p.gestDays),
          access: label('ACCESS', p.access),
          needle: p.needleGauge ?? '',
          punctures: p.punctureCount ?? '',
          operator: p.operator?.fullName ?? '',
          antiD: p.antiDIndicated ? (p.antiDGiven ? 'введён' : 'НЕ введён') : '—',
          material: label('MATERIAL_TYPE', s?.materialType),
          sampleCode: s?.code ?? '',
          methods: s?.methods.map((m) => m.dictionary.label).join('; ') ?? '',
          resultDate: fmtDate(r?.reportedAt),
          tat: r?.reportedAt && start ? Math.round((r.reportedAt.getTime() - start.getTime()) / 86_400_000) : '',
          category: label('RESULT_CATEGORY', r?.category),
          karyotype: r?.karyotype ?? '',
          path: r ? (r.isPathological ? 'да' : 'нет') : '',
          conclusion: r?.conclusion ?? '',
          delivered: fmtDate(r?.deliveredAt),
          complications: p.complications.map((c) => c.dictionary.label).join('; '),
          outcome: label('OUTCOME', outcome?.outcomeType),
          outcomeDate: fmtDate(outcome?.date),
          postnatal:
            outcome?.postnatalConfirmation === 'MATCH'
              ? 'совпал'
              : outcome?.postnatalConfirmation === 'MISMATCH'
                ? 'не совпал'
                : '',
          status: STATUS_LABELS[p.status] ?? p.status,
        })
      }
    }

    const header = ws.getRow(1)
    header.font = { bold: true }
    header.alignment = { vertical: 'middle', wrapText: true }
    header.height = 32
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

    // Патологические результаты подсвечиваем — их ищут в первую очередь
    const pathCol = columns.findIndex((c) => c.key === 'path') + 1
    ws.eachRow((row, i) => {
      if (i === 1) return
      if (row.getCell(pathCol).value === 'да') {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE7E9' } }
        })
      }
    })

    await audit(req, 'EXPORT', 'Procedure', null, `выгрузка реестра, строк: ${ws.rowCount - 1}`)

    const buffer = await wb.xlsx.writeBuffer()
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="registry-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    return reply.send(Buffer.from(buffer))
  })
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланирована',
  PERFORMED: 'Процедура выполнена',
  IN_LAB: 'Образец в лаборатории',
  RESULT_READY: 'Результат готов',
  RESULT_DELIVERED: 'Результат выдан',
  OUTCOME_RECORDED: 'Исход внесён',
  CLOSED: 'Закрыта',
  CANCELLED: 'Отменена',
  FAILED: 'Неудачная попытка',
}

function fmtDate(d?: Date | null) {
  if (!d) return ''
  return d.toLocaleDateString('ru-RU')
}
