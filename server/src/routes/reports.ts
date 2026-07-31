import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { authGuard } from '../auth.js'
import { audit } from '../audit.js'

export default async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authGuard)

  app.get('/summary', async (req) => {
    const q = req.query as Record<string, string | undefined>
    const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), 0, 1)
    const to = q.to ? endOfDay(q.to) : new Date()

    const procedures = await prisma.procedure.findMany({
      where: {
        performedAt: { gte: from, lte: to },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      include: {
        operator: { select: { id: true, fullName: true } },
        indications: { include: { dictionary: true } },
        complications: { include: { dictionary: true } },
        pregnancy: { include: { fetuses: { include: { outcome: true } } } },
        samples: { include: { results: true, methods: { include: { dictionary: true } } } },
      },
    })

    const dict = await prisma.dictionary.findMany({ where: { isActive: true } })
    const label = (type: string, code: string | null | undefined) =>
      dict.find((d) => d.type === type && d.code === code)?.label ?? code ?? '—'

    const total = procedures.length
    const results = procedures.flatMap((p) => p.samples.flatMap((s) => s.results))

    // По видам процедур
    const byType = countBy(procedures, (p) => p.procedureType ?? 'UNKNOWN').map(([code, count]) => ({
      code,
      label: label('PROCEDURE_TYPE', code),
      count,
      share: pct(count, total),
    }))

    // По месяцам
    const byMonth = countBy(procedures, (p) =>
      p.performedAt ? `${p.performedAt.getFullYear()}-${String(p.performedAt.getMonth() + 1).padStart(2, '0')}` : '—',
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, count }))

    // Структура показаний (одна процедура может иметь несколько)
    const indicationCounts = new Map<string, number>()
    for (const p of procedures) {
      for (const i of p.indications) {
        indicationCounts.set(i.dictionary.code, (indicationCounts.get(i.dictionary.code) ?? 0) + 1)
      }
    }
    const byIndication = [...indicationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, label: label('INDICATION', code), count, share: pct(count, total) }))

    // Структура результатов
    const byCategory = countBy(results, (r) => r.category ?? 'UNSPECIFIED')
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({
        code,
        label: label('RESULT_CATEGORY', code),
        count,
        share: pct(count, results.length),
        isPathological: dict.find((d) => d.type === 'RESULT_CATEGORY' && d.code === code)?.flag ?? false,
      }))

    const pathologyCount = results.filter((r) => r.isPathological).length

    // Диагностический выход по показаниям: какое показание реально даёт находки
    const yieldByIndication = [...indicationCounts.keys()]
      .map((code) => {
        const withIndication = procedures.filter((p) => p.indications.some((i) => i.dictionary.code === code))
        const withResult = withIndication.filter((p) => p.samples.some((s) => s.results.length > 0))
        const pathological = withIndication.filter((p) =>
          p.samples.some((s) => s.results.some((r) => r.isPathological)),
        )
        return {
          code,
          label: label('INDICATION', code),
          procedures: withIndication.length,
          withResult: withResult.length,
          pathological: pathological.length,
          yieldPct: pct(pathological.length, withResult.length),
        }
      })
      .sort((a, b) => b.yieldPct - a.yieldPct)

    // Осложнения
    const complicationCounts = new Map<string, number>()
    let withAnyComplication = 0
    for (const p of procedures) {
      const real = p.complications.filter((c) => c.dictionary.code !== 'NONE')
      if (real.length) withAnyComplication++
      for (const c of real) {
        complicationCounts.set(c.dictionary.code, (complicationCounts.get(c.dictionary.code) ?? 0) + 1)
      }
    }
    const complications = {
      ratePct: pct(withAnyComplication, total),
      total: withAnyComplication,
      byType: [...complicationCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({ code, label: label('COMPLICATION', code), count, share: pct(count, total) })),
    }

    // Потери беременности, связанные с процедурой
    const outcomes = procedures.flatMap((p) => p.pregnancy.fetuses.map((f) => f.outcome).filter(Boolean))
    const relatedLoss = outcomes.filter((o) => o!.procedureRelatedLoss).length

    // Неудачи культивирования и неинформативные результаты
    const failures = results.filter((r) =>
      ['CULTURE_FAILED', 'UNINFORMATIVE', 'MATERNAL_CONTAMINATION'].includes(r.category ?? ''),
    ).length

    // Средний срок выполнения по методам
    const turnaroundByMethod = new Map<string, number[]>()
    for (const p of procedures) {
      for (const s of p.samples) {
        for (const r of s.results) {
          const startAt = s.receivedAt ?? s.handedAt ?? p.performedAt
          if (!startAt || !r.reportedAt) continue
          const days = Math.round((r.reportedAt.getTime() - startAt.getTime()) / 86_400_000)
          if (days < 0) continue
          const arr = turnaroundByMethod.get(r.method) ?? []
          arr.push(days)
          turnaroundByMethod.set(r.method, arr)
        }
      }
    }
    const turnaround = [...turnaroundByMethod.entries()].map(([code, days]) => ({
      code,
      label: label('METHOD', code),
      count: days.length,
      avgDays: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
      maxDays: Math.max(...days),
    }))

    // Совпадение пренатального и постнатального диагноза
    const confirmations = outcomes.filter((o) => o!.postnatalConfirmation)
    const postnatal = {
      total: confirmations.length,
      match: confirmations.filter((o) => o!.postnatalConfirmation === 'MATCH').length,
      mismatch: confirmations.filter((o) => o!.postnatalConfirmation === 'MISMATCH').length,
    }

    // Нагрузка и осложнения по операторам
    const byOperator = countBy(procedures, (p) => p.operator?.id ?? 'unknown').map(([id, count]) => {
      const ops = procedures.filter((p) => (p.operator?.id ?? 'unknown') === id)
      const comp = ops.filter((p) => p.complications.some((c) => c.dictionary.code !== 'NONE')).length
      return {
        id,
        name: ops[0]?.operator?.fullName ?? 'не указан',
        count,
        complications: comp,
        complicationRatePct: pct(comp, count),
      }
    }).sort((a, b) => b.count - a.count)

    // Исходы беременностей
    const byOutcome = countBy(outcomes.filter(Boolean), (o) => o!.outcomeType ?? 'UNSPECIFIED').map(
      ([code, count]) => ({ code, label: label('OUTCOME', code), count, share: pct(count, outcomes.length) }),
    )

    await audit(req, 'VIEW', 'Report', null, `сводка ${from.toISOString().slice(0, 10)}–${to.toISOString().slice(0, 10)}`)

    return {
      period: { from, to },
      totals: {
        procedures: total,
        patients: new Set(procedures.map((p) => p.pregnancy.id)).size,
        samples: procedures.reduce((a, p) => a + p.samples.length, 0),
        results: results.length,
        pathology: pathologyCount,
        pathologyPct: pct(pathologyCount, results.length),
        failures,
        failuresPct: pct(failures, results.length),
        relatedLoss,
        relatedLossPct: pct(relatedLoss, total),
      },
      byType,
      byMonth,
      byIndication,
      byCategory,
      yieldByIndication,
      complications,
      turnaround,
      postnatal,
      byOperator,
      byOutcome,
    }
  })
}

function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function pct(part: number, whole: number) {
  if (!whole) return 0
  return Math.round((part / whole) * 1000) / 10
}

function endOfDay(s: string) {
  const d = new Date(s)
  d.setHours(23, 59, 59, 999)
  return d
}
