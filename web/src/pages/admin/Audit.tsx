import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { useApp } from '../../store'
import { Empty, ErrorBox, Loader, Modal } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { AUDIT_ACTION_LABELS, ENTITY_LABELS } from '../../lib/labels'
import type { AuditRow } from '../../types'

type Change = { from: unknown; to: unknown }
type ChangePair = [string, Change]

/** Сколько пар «было → стало» показывать прямо в строке таблицы. */
const INLINE_CHANGES = 4

/** Понятные названия часто изменяемых полей; для остальных показываем как есть. */
const FIELD_LABELS: Record<string, string> = {
  fullName: 'ФИО',
  lastName: 'фамилия',
  firstName: 'имя',
  middleName: 'отчество',
  birthDate: 'дата рождения',
  phone: 'телефон',
  address: 'адрес',
  cardNumber: 'номер карты',
  snils: 'СНИЛС',
  policy: 'полис',
  login: 'логин',
  role: 'роль',
  isActive: 'активен',
  position: 'должность',
  password: 'пароль',
  status: 'статус',
  notes: 'примечания',
  plannedDate: 'плановая дата',
  performedAt: 'дата выполнения',
  procedureType: 'вид процедуры',
  karyotype: 'кариотип',
  conclusion: 'заключение',
  deliveredAt: 'выдан',
  isPathological: 'патология',
}

export default function AuditPage() {
  const [params, setParams] = useSearchParams()
  const { users, can } = useApp()
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<AuditRow | null>(null)

  const allowed = can('ADMIN')

  useEffect(() => {
    if (!allowed) return
    const search = new URLSearchParams(params)
    search.set('limit', '300')
    setRows(null)
    api
      .get<AuditRow[]>(`/users/audit?${search}`)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Не удалось загрузить журнал'))
  }, [params, allowed])

  if (!allowed) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Журнал доступа</h1>
        </div>
        <div className="card">
          <Empty text="Раздел доступен только администратору" />
        </div>
      </div>
    )
  }

  const q = Object.fromEntries(params.entries())

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
          <h1>Журнал доступа</h1>
          <div className="page-sub">{rows ? `записей показано: ${rows.length}` : '…'}</div>
        </div>
      </div>

      <div className="alert-box info">
        Журнал фиксирует все просмотры и изменения персональных данных: кто, когда и что открывал или правил. Записи
        журнала не редактируются и не удаляются.
      </div>

      <div className="toolbar">
        <select value={q.userId ?? ''} onChange={(e) => setParam('userId', e.target.value)} title="Сотрудник">
          <option value="">Все сотрудники</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <select value={q.action ?? ''} onChange={(e) => setParam('action', e.target.value)} title="Тип действия">
          <option value="">Все действия</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={q.entity ?? ''} onChange={(e) => setParam('entity', e.target.value)} title="Объект">
          <option value="">Все объекты</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input type="date" value={q.from ?? ''} onChange={(e) => setParam('from', e.target.value)} title="с" />
        <input type="date" value={q.to ?? ''} onChange={(e) => setParam('to', e.target.value)} title="по" />
        {params.toString() && <button onClick={() => setParams({})}>Сбросить</button>}
      </div>

      <ErrorBox error={error} />

      <div className="card tight">
        {!rows ? (
          <Loader />
        ) : rows.length === 0 ? (
          <Empty text="Записей за выбранный период нет" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Сотрудник</th>
                  <th>Действие</th>
                  <th>Объект</th>
                  <th>Описание</th>
                  <th>Изменения</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pairs = toPairs(r.changes)
                  return (
                    <tr key={r.id}>
                      <td className="nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td>
                        {r.user?.fullName ?? '—'}
                        {r.user?.login && <div className="muted mono">{r.user.login}</div>}
                      </td>
                      <td className="nowrap">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</td>
                      <td className="nowrap">{ENTITY_LABELS[r.entity] ?? r.entity}</td>
                      <td style={{ maxWidth: 280 }}>{r.summary || '—'}</td>
                      <td style={{ maxWidth: 340 }}>
                        {pairs.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <>
                            {pairs.slice(0, INLINE_CHANGES).map(([key, c]) => (
                              <div key={key} className="muted" style={{ fontSize: 12.5 }}>
                                <b>{FIELD_LABELS[key] ?? key}:</b> {fmtVal(c.from)} → {fmtVal(c.to)}
                              </div>
                            ))}
                            {pairs.length > INLINE_CHANGES && (
                              <button className="sm" onClick={() => setDetails(r)}>
                                показать все ({pairs.length})
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {details && (
        <Modal
          title="Изменения"
          onClose={() => setDetails(null)}
          footer={<button onClick={() => setDetails(null)}>Закрыть</button>}
        >
          <div className="muted" style={{ marginBottom: 10 }}>
            {fmtDateTime(details.createdAt)} · {details.user?.fullName ?? '—'} ·{' '}
            {AUDIT_ACTION_LABELS[details.action] ?? details.action} · {ENTITY_LABELS[details.entity] ?? details.entity}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Поле</th>
                  <th>Было</th>
                  <th>Стало</th>
                </tr>
              </thead>
              <tbody>
                {toPairs(details.changes).map(([key, c]) => (
                  <tr key={key}>
                    <td>{FIELD_LABELS[key] ?? key}</td>
                    <td>{fmtVal(c.from, 120)}</td>
                    <td>{fmtVal(c.to, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}

function toPairs(changes: AuditRow['changes']): ChangePair[] {
  if (!changes) return []
  return Object.entries(changes).filter(([, c]) => c && typeof c === 'object')
}

function fmtVal(v: unknown, limit = 24): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > limit ? `${s.slice(0, limit)}…` : s
}
