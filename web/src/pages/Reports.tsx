import { useEffect, useState } from 'react'
import { api, download } from '../api'
import { Card, Empty, Loader } from '../components/ui'
import { plural } from '../lib/format'
import { useIsMobile } from '../lib/useIsMobile'
import type { ReportSummary } from '../types'

export default function ReportsPage() {
  const year = new Date().getFullYear()
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState<ReportSummary | null>(null)

  useEffect(() => {
    setData(null)
    api.get<ReportSummary>(`/reports/summary?from=${from}&to=${to}`).then(setData)
  }, [from, to])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Отчёты</h1>
          <div className="page-sub">Считается по выполненным процедурам за выбранный период</div>
        </div>
        <div className="spacer" />
        <button onClick={() => download(`/export/journal.xlsx?from=${from}&to=${to}`)}>Выгрузить реестр</button>
      </div>

      <div className="toolbar">
        <label className="muted">Период:</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="muted">—</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button onClick={() => { setFrom(`${year}-01-01`); setTo(new Date().toISOString().slice(0, 10)) }}>
          Текущий год
        </button>
        <button onClick={() => { setFrom(`${year - 1}-01-01`); setTo(`${year - 1}-12-31`) }}>
          Прошлый год
        </button>
      </div>

      {!data ? (
        <Loader />
      ) : data.totals.procedures === 0 ? (
        <div className="card">
          <Empty text="За выбранный период выполненных процедур нет" />
        </div>
      ) : (
        <>
          <div className="tiles">
            <div className="tile">
              <div className="num">{data.totals.procedures}</div>
              <div className="lbl">процедур выполнено</div>
            </div>
            <div className="tile">
              <div className="num">{data.totals.results}</div>
              <div className="lbl">результатов получено</div>
            </div>
            <div className="tile alert">
              <div className="num">{data.totals.pathologyPct}%</div>
              <div className="lbl">диагностический выход ({data.totals.pathology})</div>
            </div>
            <div className="tile warn">
              <div className="num">{data.complications.ratePct}%</div>
              <div className="lbl">частота осложнений ({data.complications.total})</div>
            </div>
            <div className="tile warn">
              <div className="num">{data.totals.relatedLossPct}%</div>
              <div className="lbl">потери, связанные с процедурой ({data.totals.relatedLoss})</div>
            </div>
            <div className="tile">
              <div className="num">{data.totals.failuresPct}%</div>
              <div className="lbl">неудач и неинформативных ({data.totals.failures})</div>
            </div>
          </div>

          <div className="grid cols-2">
            <Card title="Диагностический выход по показаниям">
              <p className="muted" style={{ marginTop: 0 }}>
                Доля патологии среди процедур, выполненных по этому показанию. Показывает, какое показание реально
                работает.
              </p>
              <BarTable
                rows={data.yieldByIndication.map((y) => ({
                  label: y.label,
                  value: `${y.pathological} из ${y.withResult}`,
                  pct: y.yieldPct,
                }))}
                red
              />
            </Card>

            <Card title="Структура результатов">
              <BarTable
                rows={data.byCategory.map((c) => ({
                  label: c.label,
                  value: String(c.count),
                  pct: c.share,
                  red: c.isPathological,
                }))}
              />
            </Card>

            <Card title="Виды процедур">
              <BarTable rows={data.byType.map((t) => ({ label: t.label, value: String(t.count), pct: t.share }))} />
            </Card>

            <Card title="Структура показаний">
              <BarTable
                rows={data.byIndication.map((i) => ({ label: i.label, value: String(i.count), pct: i.share }))}
              />
            </Card>

            <Card title="Осложнения">
              {data.complications.byType.length === 0 ? (
                <Empty text="Осложнений не зарегистрировано" />
              ) : (
                <BarTable
                  rows={data.complications.byType.map((c) => ({
                    label: c.label,
                    value: String(c.count),
                    pct: c.share,
                    red: true,
                  }))}
                />
              )}
            </Card>

            <Card title="Исходы беременностей">
              {data.byOutcome.length === 0 ? (
                <Empty text="Исходы пока не внесены" />
              ) : (
                <BarTable
                  rows={data.byOutcome.map((o) => ({ label: o.label, value: String(o.count), pct: o.share }))}
                />
              )}
            </Card>

            <Card title="Сроки выполнения анализов">
              {data.turnaround.length === 0 ? (
                <Empty text="Недостаточно данных" />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Метод</th>
                      <th className="num">Анализов</th>
                      <th className="num">В среднем, дн</th>
                      <th className="num">Максимум, дн</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.turnaround.map((t) => (
                      <tr key={t.code}>
                        <td>{t.label}</td>
                        <td className="num">{t.count}</td>
                        <td className="num">{t.avgDays}</td>
                        <td className="num">{t.maxDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Нагрузка и осложнения по операторам">
              <table className="data">
                <thead>
                  <tr>
                    <th>Оператор</th>
                    <th className="num">Процедур</th>
                    <th className="num">Осложнений</th>
                    <th className="num">Частота</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byOperator.map((o) => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td className="num">{o.count}</td>
                      <td className="num">{o.complications}</td>
                      <td className="num">{o.complicationRatePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card title="Совпадение пренатального и постнатального диагноза">
              {data.postnatal.total === 0 ? (
                <Empty text="Сверка пока не проводилась" />
              ) : (
                <table className="data">
                  <tbody>
                    <tr>
                      <td>Сверено случаев</td>
                      <td className="num">{data.postnatal.total}</td>
                    </tr>
                    <tr>
                      <td>Диагноз совпал</td>
                      <td className="num">
                        {data.postnatal.match} (
                        {Math.round((data.postnatal.match / data.postnatal.total) * 100)}%)
                      </td>
                    </tr>
                    <tr className={data.postnatal.mismatch ? 'pathology' : ''}>
                      <td>Диагноз не совпал</td>
                      <td className="num">{data.postnatal.mismatch}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Процедуры по месяцам">
              <BarTable
                rows={data.byMonth.map((m) => ({
                  label: monthName(m.month),
                  value: plural(m.count, 'процедура', 'процедуры', 'процедур'),
                  pct: Math.round((m.count / Math.max(...data.byMonth.map((x) => x.count))) * 100),
                }))}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function BarTable({
  rows,
  red,
}: {
  rows: { label: string; value: string; pct: number; red?: boolean }[]
  red?: boolean
}) {
  const mobile = useIsMobile()
  if (rows.length === 0) return <Empty text="Нет данных" />

  // На телефоне колонка с полосой сжимается в ничто — выносим полосу отдельной строкой
  if (mobile)
    return (
      <div className="m-list">
        {rows.map((r, i) => (
          <div key={i} className="m-card">
            <div className="m-top">
              <span className="m-title">{r.label}</span>
              <span className="m-code">{r.pct}%</span>
            </div>
            <div className="m-row">{r.value}</div>
            <div className={`bar ${red || r.red ? 'red' : ''}`} style={{ marginTop: 6 }}>
              <span style={{ width: `${Math.min(r.pct, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    )

  return (
    <table className="data">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ width: '45%' }}>{r.label}</td>
            <td className="num nowrap" style={{ width: 90 }}>
              {r.value}
            </td>
            <td className="num nowrap" style={{ width: 56 }}>
              {r.pct}%
            </td>
            <td>
              <div className={`bar ${red || r.red ? 'red' : ''}`}>
                <span style={{ width: `${Math.min(r.pct, 100)}%` }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function monthName(m: string) {
  const [y, mm] = m.split('-')
  const names = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
  return `${names[Number(mm) - 1] ?? m} ${y}`
}
