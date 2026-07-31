import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, download } from '../api'
import { useApp } from '../store'
import { Empty, Loader } from '../components/ui'
import { fmtDate } from '../lib/format'
import { STATUS_LABELS } from '../lib/labels'
import { useIsMobile } from '../lib/useIsMobile'
import type { PatientRow } from '../types'

export default function PatientsPage() {
  const navigate = useNavigate()
  const { label, can } = useApp()
  const mobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<PatientRow[] | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<{ total: number; items: PatientRow[] }>(`/patients?search=${encodeURIComponent(search)}&limit=200`)
        .then((d) => {
          setRows(d.items)
          setTotal(d.total)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Пациентки</h1>
          <div className="page-sub">Найдено: {total}</div>
        </div>
        <div className="spacer" />
        <button onClick={() => download('/export/journal.xlsx')}>Выгрузить в Excel</button>
        {can('DOCTOR') && (
          <Link className="btn primary" to="/patients/new">
            + Новая пациентка
          </Link>
        )}
      </div>

      <div className="toolbar">
        <input
          className="search"
          type="text"
          placeholder="Поиск: фамилия, код, номер карты, телефон…"
          value={search}
          autoFocus
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card tight">
        {!rows ? (
          <Loader />
        ) : rows.length === 0 ? (
          <Empty text={search ? 'Ничего не найдено' : 'Пациенток пока нет — заведите первую'} />
        ) : mobile ? (
          // На телефоне — карточки: в таблицу из восьми колонок телефон не помещается
          <div className="m-list" style={{ padding: 10 }}>
            {rows.map((p) => (
              <button key={p.id} className="m-card" onClick={() => navigate(`/patients/${p.id}`)}>
                <div className="m-top">
                  <span className="m-title">{p.fullName}</span>
                  <span className="m-code">{p.code}</span>
                </div>
                <div className="m-row">
                  {p.age} лет · {fmtDate(p.birthDate)}
                  {p.phone ? ` · ${p.phone}` : ''}
                </div>
                {p.referringInstitution && <div className="m-row">{p.referringInstitution}</div>}
                {p.lastProcedure && (
                  <div className="m-row">
                    <b>{label('PROCEDURE_TYPE', p.lastProcedure.procedureType)}</b> ·{' '}
                    {fmtDate(p.lastProcedure.performedAt)}
                  </div>
                )}
                <div className="m-tags">
                  {p.rhesus === 'NEG' && <span className="badge red">Rh отрицательный</span>}
                  {p.lastProcedure && (
                    <span className="badge">{STATUS_LABELS[p.lastProcedure.status]}</span>
                  )}
                  {p.pregnancyCount > 1 && (
                    <span className="badge">беременностей: {p.pregnancyCount}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>ФИО</th>
                  <th className="num">Возраст</th>
                  <th>Дата рождения</th>
                  <th>Резус</th>
                  <th>Направившее учреждение</th>
                  <th className="num">Беременностей</th>
                  <th>Последняя процедура</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                    <td className="mono nowrap">{p.code}</td>
                    <td>
                      <b>{p.fullName}</b>
                      {p.phone && <div className="muted">{p.phone}</div>}
                    </td>
                    <td className="num">{p.age}</td>
                    <td className="nowrap">{fmtDate(p.birthDate)}</td>
                    <td className={p.rhesus === 'NEG' ? 'rh-neg nowrap' : 'nowrap'}>
                      {p.rhesus === 'NEG' ? 'отр.' : p.rhesus === 'POS' ? 'полож.' : '—'}
                    </td>
                    <td>{p.referringInstitution ?? '—'}</td>
                    <td className="num">{p.pregnancyCount}</td>
                    <td>
                      {p.lastProcedure ? (
                        <>
                          <div>
                            {label('PROCEDURE_TYPE', p.lastProcedure.procedureType)} ·{' '}
                            {fmtDate(p.lastProcedure.performedAt)}
                          </div>
                          <div className="muted">{STATUS_LABELS[p.lastProcedure.status]}</div>
                        </>
                      ) : (
                        <span className="muted">нет</span>
                      )}
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
