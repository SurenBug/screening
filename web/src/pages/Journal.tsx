import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, download } from '../api'
import { useApp } from '../store'
import { Empty, Loader, StatusBadge } from '../components/ui'
import { fmtDate, fmtGest, plural } from '../lib/format'
import { STATUS_LABELS } from '../lib/labels'
import { useIsMobile } from '../lib/useIsMobile'
import type { JournalRow } from '../types'

/** Фильтры, кроме поиска: поле поиска на телефоне видно всегда. */
const FILTER_KEYS = ['status', 'type', 'indication', 'operatorId', 'from', 'to', 'pathological']

/** Показания в карточке — одной строкой, длинный перечень обрезаем. */
function cut(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

export default function JournalPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { label, list, users } = useApp()
  const mobile = useIsMobile()
  const [rows, setRows] = useState<JournalRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const q = Object.fromEntries(params.entries())
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length
  // На телефоне панель фильтров занимает пол-экрана — прячем её под кнопку
  const showFilters = !mobile || filtersOpen

  useEffect(() => {
    const search = new URLSearchParams(params)
    search.set('limit', '300')
    api.get<{ total: number; items: JournalRow[] }>(`/procedures?${search}`).then((d) => {
      setRows(d.items)
      setTotal(d.total)
    })
  }, [params])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Журнал процедур</h1>
          <div className="page-sub">{plural(total, 'запись', 'записи', 'записей')}</div>
        </div>
        <div className="spacer" />
        <button onClick={() => download(`/export/journal.xlsx?${params}`)}>Выгрузить в Excel</button>
        {!mobile && <button onClick={() => window.print()}>Печать</button>}
      </div>

      <div className="toolbar">
        <input
          className="search"
          type="text"
          placeholder="Поиск: код процедуры, фамилия, код пациентки…"
          value={q.search ?? ''}
          onChange={(e) => setParam('search', e.target.value)}
        />
        {mobile && (
          <button className={filtersOpen ? 'primary' : ''} onClick={() => setFiltersOpen(!filtersOpen)}>
            Фильтры{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
        )}
        {showFilters && (
          <>
            <select value={q.status ?? ''} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">Все статусы</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={q.type ?? ''} onChange={(e) => setParam('type', e.target.value)}>
              <option value="">Все виды процедур</option>
              {list('PROCEDURE_TYPE').map((d) => (
                <option key={d.id} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <select value={q.indication ?? ''} onChange={(e) => setParam('indication', e.target.value)}>
              <option value="">Все показания</option>
              {list('INDICATION').map((d) => (
                <option key={d.id} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <select value={q.operatorId ?? ''} onChange={(e) => setParam('operatorId', e.target.value)}>
              <option value="">Все операторы</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <input type="date" value={q.from ?? ''} onChange={(e) => setParam('from', e.target.value)} title="с" />
            <input type="date" value={q.to ?? ''} onChange={(e) => setParam('to', e.target.value)} title="по" />
            <button
              className={q.pathological === '1' ? 'primary' : ''}
              onClick={() => setParam('pathological', q.pathological === '1' ? '' : '1')}
            >
              Только патология
            </button>
            {params.toString() && <button onClick={() => setParams({})}>Сбросить</button>}
          </>
        )}
      </div>

      <div className="card tight">
        {!rows ? (
          <Loader />
        ) : rows.length === 0 ? (
          <Empty text="Ничего не найдено" />
        ) : mobile ? (
          // На телефоне — карточки: таблица из десяти колонок не помещается
          <div className="m-list" style={{ padding: 10 }}>
            {rows.map((r) => {
              const indications = r.indications.map((i) => i.label).join('; ')
              const complications = r.complications
                .filter((c) => c.code !== 'NONE')
                .map((c) => c.label)
                .join('; ')
              return (
                <button
                  key={r.id}
                  className={r.hasPathology ? 'm-card pathology' : 'm-card'}
                  onClick={() => navigate(`/procedures/${r.id}`)}
                >
                  <div className="m-top">
                    <span className="m-title">{r.patient.fullName}</span>
                    <span className="m-code">{r.code}</span>
                  </div>
                  <div className="m-row">
                    {fmtDate(r.performedAt ?? r.plannedDate)} · {label('PROCEDURE_TYPE', r.procedureType)} ·{' '}
                    {fmtGest(r.gestWeeks, r.gestDays)}
                  </div>
                  {indications && <div className="m-row">{cut(indications)}</div>}
                  {r.operator && <div className="m-row">{r.operator.fullName}</div>}
                  <div className="m-row">
                    {r.results.length === 0
                      ? 'результат ожидается'
                      : r.results.map((res) => (
                          <div key={res.id}>
                            <b>{label('RESULT_CATEGORY', res.category)}</b>
                            {res.karyotype && <span className="mono"> {res.karyotype}</span>}
                          </div>
                        ))}
                  </div>
                  <div className="m-tags">
                    <StatusBadge status={r.status} />
                    {r.plurality === 'MULTIPLE' && <span className="badge">двойня</span>}
                    {r.patient.rhesus === 'NEG' && <span className="badge red">Rh−</span>}
                    {complications && <span className="badge red">{complications}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Дата</th>
                  <th>Пациентка</th>
                  <th>Вид</th>
                  <th>Срок</th>
                  <th>Показания</th>
                  <th>Оператор</th>
                  <th>Результат</th>
                  <th>Осложнения</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`clickable ${r.hasPathology ? 'pathology' : ''}`}
                    onClick={() => navigate(`/procedures/${r.id}`)}
                  >
                    <td className="mono nowrap">{r.code}</td>
                    <td className="nowrap">{fmtDate(r.performedAt ?? r.plannedDate)}</td>
                    <td>
                      <b>{r.patient.fullName}</b>
                      <div className="muted mono">{r.patient.code}</div>
                      {r.plurality === 'MULTIPLE' && <span className="badge">двойня</span>}
                      {r.patient.rhesus === 'NEG' && <span className="badge red">Rh−</span>}
                    </td>
                    <td>{label('PROCEDURE_TYPE', r.procedureType)}</td>
                    <td className="nowrap">{fmtGest(r.gestWeeks, r.gestDays)}</td>
                    <td style={{ maxWidth: 240 }}>{r.indications.map((i) => i.label).join('; ') || '—'}</td>
                    <td>{r.operator?.fullName ?? '—'}</td>
                    <td>
                      {r.results.length === 0 ? (
                        <span className="muted">ожидается</span>
                      ) : (
                        r.results.map((res) => (
                          <div key={res.id}>
                            <b>{label('RESULT_CATEGORY', res.category)}</b>
                            {res.karyotype && <span className="mono"> {res.karyotype}</span>}
                          </div>
                        ))
                      )}
                    </td>
                    <td>{r.complications.filter((c) => c.code !== 'NONE').map((c) => c.label).join('; ') || '—'}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
