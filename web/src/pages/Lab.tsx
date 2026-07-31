import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../store'
import { Empty, Loader } from '../components/ui'
import ResultForm from '../components/ResultForm'
import { fmtDate, fmtGest, plural } from '../lib/format'
import { SAMPLE_NEXT, SAMPLE_STATUS_LABELS } from '../lib/labels'
import { useIsMobile } from '../lib/useIsMobile'
import type { LabSample, Sample } from '../types'

export default function LabPage() {
  const [params, setParams] = useSearchParams()
  const { label, can } = useApp()
  const mobile = useIsMobile()
  const [rows, setRows] = useState<LabSample[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [resultFor, setResultFor] = useState<Sample | null>(null)
  const showAll = params.get('all') === '1'
  const onlyOverdue = params.get('overdue') === '1'

  const load = useCallback(async () => {
    const q = new URLSearchParams()
    if (showAll) q.set('all', '1')
    if (onlyOverdue) q.set('overdue', '1')
    setRows(await api.get<LabSample[]>(`/lab/samples?${q}`))
    setSelected([])
  }, [showAll, onlyOverdue])

  useEffect(() => {
    load()
  }, [load])

  async function receiveBatch() {
    await api.post('/lab/samples/receive', { ids: selected })
    load()
  }

  async function changeStatus(id: string, status: string) {
    await api.patch(`/lab/samples/${id}`, { status })
    load()
  }

  /** Открывает форму результата: подтягиваем полный образец с методами. */
  async function openResult(row: LabSample) {
    const proc = await api.get<any>(`/procedures/${row.procedure.id}`)
    const sample = proc.samples.find((s: Sample) => s.id === row.id)
    setResultFor(sample)
  }

  const overdueCount = rows?.filter((r) => r.overdue).length ?? 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Лаборатория</h1>
          <div className="page-sub">
            {rows ? plural(rows.length, 'образец', 'образца', 'образцов') : '…'} в очереди
            {overdueCount > 0 && <span className="badge red" style={{ marginLeft: 8 }}>просрочено: {overdueCount}</span>}
          </div>
        </div>
        <div className="spacer" />
        {/* Массовый приём партии — только с компьютера: на телефоне чекбоксов нет */}
        {!mobile && selected.length > 0 && can('LAB') && (
          <button className="primary" onClick={receiveBatch}>
            Принять выбранные ({selected.length})
          </button>
        )}
      </div>

      <div className="toolbar">
        <button
          className={!showAll && !onlyOverdue ? 'primary' : ''}
          onClick={() => setParams({})}
        >
          В работе
        </button>
        <button className={onlyOverdue ? 'primary' : ''} onClick={() => setParams({ overdue: '1' })}>
          Просроченные
        </button>
        <button className={showAll ? 'primary' : ''} onClick={() => setParams({ all: '1' })}>
          Все образцы
        </button>
      </div>

      <div className="card tight">
        {!rows ? (
          <Loader />
        ) : rows.length === 0 ? (
          <Empty text="Образцов нет" />
        ) : mobile ? (
          // На телефоне — карточки: таблица образца в телефон не помещается
          <div className="m-list" style={{ padding: 10 }}>
            {rows.map((r) => {
              const material = [label('MATERIAL_TYPE', r.materialType), r.volume, r.containerNumber]
                .filter(Boolean)
                .join(' · ')
              const methods = r.methods.map((m) => m.label).join('; ')
              return (
                <div key={r.id} className={r.overdue ? 'm-card overdue' : 'm-card'}>
                  <div className="m-top">
                    <span className="m-title">
                      <span className="mono">{r.code}</span>
                    </span>
                    {r.fetus && <span className="badge">плод {r.fetus.label}</span>}
                  </div>
                  <div className="m-row">
                    <b>{r.patient.fullName}</b>
                  </div>
                  <div className="m-row">
                    {label('PROCEDURE_TYPE', r.procedure.procedureType)} ·{' '}
                    {fmtGest(r.procedure.gestWeeks, r.procedure.gestDays)}
                  </div>
                  {material && <div className="m-row">{material}</div>}
                  {methods && <div className="m-row">{methods}</div>}
                  <div className="m-row">
                    Готовность: {fmtDate(r.deadline)}
                    {r.daysLeft != null && (
                      <span className={r.daysLeft < 0 ? 'rh-neg' : ''}>
                        {' '}
                        · {r.daysLeft < 0 ? `просрочено на ${-r.daysLeft} дн` : `осталось ${r.daysLeft} дн`}
                      </span>
                    )}
                  </div>
                  <div className="m-tags">
                    <span className="badge">{SAMPLE_STATUS_LABELS[r.status] ?? r.status}</span>
                  </div>
                  {can('LAB') && (
                    <div className="m-actions">
                      {(SAMPLE_NEXT[r.status] ?? []).map((next) => (
                        <button key={next} className="sm" onClick={() => changeStatus(r.id, next)}>
                          {/* Приём партии на телефоне недоступен — принимаем образец поштучно */}
                          {r.status === 'HANDED' && next === 'RECEIVED' ? 'Принять' : SAMPLE_STATUS_LABELS[next]}
                        </button>
                      ))}
                      <button className="sm primary" onClick={() => openResult(r)}>
                        {r.resultCount ? 'Результат' : 'Внести результат'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: 1 }}>
                    <input
                      type="checkbox"
                      checked={selected.length === rows.length}
                      onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                    />
                  </th>
                  <th>Образец</th>
                  <th>Пациентка</th>
                  <th>Процедура</th>
                  <th>Материал</th>
                  <th>Методы</th>
                  <th>Передан</th>
                  <th>Срок готовности</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.overdue ? 'pathology' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))
                        }
                      />
                    </td>
                    <td className="mono nowrap">
                      {r.code}
                      {r.fetus && <div className="badge">плод {r.fetus.label}</div>}
                    </td>
                    <td>
                      <Link to={`/patients/${r.patient.id}`}>{r.patient.fullName}</Link>
                      <div className="muted mono">{r.patient.code}</div>
                    </td>
                    <td>
                      <Link to={`/procedures/${r.procedure.id}`} className="mono">
                        {r.procedure.code}
                      </Link>
                      <div className="muted">
                        {label('PROCEDURE_TYPE', r.procedure.procedureType)},{' '}
                        {fmtGest(r.procedure.gestWeeks, r.procedure.gestDays)}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {r.procedure.indications.join('; ')}
                      </div>
                    </td>
                    <td>
                      {label('MATERIAL_TYPE', r.materialType)}
                      {r.volume && <div className="muted">{r.volume}</div>}
                      {r.containerNumber && <div className="muted mono">{r.containerNumber}</div>}
                    </td>
                    <td>{r.methods.map((m) => m.label).join('; ')}</td>
                    <td className="nowrap">{fmtDate(r.handedAt)}</td>
                    <td className="nowrap">
                      {fmtDate(r.deadline)}
                      {r.daysLeft != null && (
                        <div className={r.daysLeft < 0 ? 'rh-neg' : 'muted'}>
                          {r.daysLeft < 0 ? `просрочено на ${-r.daysLeft} дн` : `осталось ${r.daysLeft} дн`}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge">{SAMPLE_STATUS_LABELS[r.status] ?? r.status}</span>
                      {r.labUser && <div className="muted" style={{ fontSize: 12 }}>{r.labUser.fullName}</div>}
                    </td>
                    <td className="nowrap">
                      {can('LAB') && (
                        <>
                          {(SAMPLE_NEXT[r.status] ?? []).map((next) => (
                            <button key={next} className="sm" onClick={() => changeStatus(r.id, next)}>
                              {SAMPLE_STATUS_LABELS[next]}
                            </button>
                          ))}{' '}
                          <button className="sm primary" onClick={() => openResult(r)}>
                            {r.resultCount ? 'Результат' : 'Внести результат'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {resultFor && <ResultForm sample={resultFor} onClose={() => setResultFor(null)} onSaved={load} />}
    </div>
  )
}
