import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../store'
import { Card, Empty, Loader } from '../components/ui'
import { fmtDate, fmtDateTime } from '../lib/format'
import { useIsMobile } from '../lib/useIsMobile'
import { AUDIT_ACTION_LABELS, ENTITY_LABELS, TASK_TYPE_LABELS } from '../lib/labels'
import type { Dashboard, Task } from '../types'

export default function DashboardPage() {
  const { user, label, can } = useApp()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const [data, setData] = useState<Dashboard | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])

  async function load() {
    // Пересборка задач при открытии — заменяет планировщик, пока его нет
    await api.post('/dashboard/tasks/rebuild').catch(() => {})
    const [d, t] = await Promise.all([api.get<Dashboard>('/dashboard'), api.get<Task[]>('/dashboard/tasks')])
    setData(d)
    setTasks(t)
  }

  useEffect(() => {
    load()
  }, [])

  if (!data) return <Loader />
  const t = data.tiles

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Мой день</h1>
          <div className="page-sub">
            {user!.fullName} ·{' '}
            {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
        <div className="spacer" />
        {can('DOCTOR') && (
          <Link className="btn primary" to="/patients/new">
            + Новая пациентка
          </Link>
        )}
      </div>

      <div className="tiles">
        <button className="tile" onClick={() => navigate('/journal?status=PLANNED,PERFORMED')}>
          <div className="num">{t.today}</div>
          <div className="lbl">процедуры сегодня</div>
        </button>
        <button className="tile" onClick={() => navigate('/journal?status=PLANNED')}>
          <div className="num">{t.week}</div>
          <div className="lbl">запланировано на неделю</div>
        </button>
        <button className="tile" onClick={() => navigate('/lab')}>
          <div className="num">{t.awaiting}</div>
          <div className="lbl">образцов в работе</div>
        </button>
        <button className={`tile ${t.overdue ? 'alert' : ''}`} onClick={() => navigate('/lab?overdue=1')}>
          <div className="num">{t.overdue}</div>
          <div className="lbl">просрочен результат</div>
        </button>
        <button className={`tile ${t.undelivered ? 'warn' : ''}`} onClick={() => navigate('/journal?status=RESULT_READY')}>
          <div className="num">{t.undelivered}</div>
          <div className="lbl">готово, но не выдано</div>
        </button>
        <button className={`tile ${t.pendingOutcome ? 'warn' : ''}`} onClick={() => navigate('/journal?status=RESULT_DELIVERED')}>
          <div className="num">{t.pendingOutcome}</div>
          <div className="lbl">не внесён исход</div>
        </button>
      </div>

      {data.pathology.length > 0 && (
        <div className="card tight" style={{ borderColor: '#f3c4c0' }}>
          <div className="card-head" style={{ background: 'var(--danger-soft)' }}>
            <h2 style={{ color: 'var(--danger)' }}>Патологические результаты за неделю</h2>
          </div>
          {mobile ? (
            <div className="m-list" style={{ padding: 10 }}>
              {data.pathology.map((p) => (
                <button
                  key={p.id}
                  className="m-card pathology"
                  onClick={() => navigate(`/procedures/${p.procedureId}`)}
                >
                  <div className="m-top">
                    <span className="m-title">{p.patient.fullName}</span>
                    <span className="m-code">{p.sampleCode}</span>
                  </div>
                  <div className="m-row">
                    <b>{label('RESULT_CATEGORY', p.category)}</b>
                    {p.fetusLabel ? ` · плод ${p.fetusLabel}` : ''}
                  </div>
                  {p.karyotype && <div className="m-row mono">{p.karyotype}</div>}
                  <div className="m-row">Готов: {fmtDate(p.reportedAt)}</div>
                  <div className="m-tags">
                    {p.deliveredAt ? (
                      <span className="badge green">выдан {fmtDate(p.deliveredAt)}</span>
                    ) : (
                      <span className="badge red">не выдан</span>
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
                  <th>Образец</th>
                  <th>Пациентка</th>
                  <th>Результат</th>
                  <th>Кариотип</th>
                  <th>Готов</th>
                  <th>Выдан</th>
                </tr>
              </thead>
              <tbody>
                {data.pathology.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/procedures/${p.procedureId}`)}>
                    <td className="mono nowrap">
                      {p.sampleCode}
                      {p.fetusLabel && <span className="badge" style={{ marginLeft: 6 }}>плод {p.fetusLabel}</span>}
                    </td>
                    <td>
                      <div>{p.patient.fullName}</div>
                      <div className="muted mono">{p.patient.code}</div>
                    </td>
                    <td>{label('RESULT_CATEGORY', p.category)}</td>
                    <td className="mono">{p.karyotype ?? '—'}</td>
                    <td className="nowrap">{fmtDate(p.reportedAt)}</td>
                    <td className="nowrap">
                      {p.deliveredAt ? (
                        fmtDate(p.deliveredAt)
                      ) : (
                        <span className="badge red">не выдан</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      <div className="grid cols-2">
        <Card title={`Задачи (${tasks.length})`}>
          {tasks.length === 0 ? (
            <Empty text="Открытых задач нет" />
          ) : mobile ? (
            <div className="m-list">
              {tasks.map((task) => (
                <div key={task.id} className={task.overdue ? 'm-card overdue' : 'm-card'}>
                  <div className="m-tags">
                    <span className={`badge ${task.type === 'PATHOLOGY_ALERT' ? 'red' : task.overdue ? 'amber' : ''}`}>
                      {TASK_TYPE_LABELS[task.type] ?? task.type}
                    </span>
                  </div>
                  <div className="m-row">
                    <b>
                      {task.procedureId ? (
                        <Link to={`/procedures/${task.procedureId}`}>{task.title}</Link>
                      ) : task.patientId ? (
                        <Link to={`/patients/${task.patientId}`}>{task.title}</Link>
                      ) : (
                        task.title
                      )}
                    </b>
                  </div>
                  <div className="m-row">
                    срок {fmtDate(task.dueDate)}
                    {task.assignee ? ` · ${task.assignee.fullName}` : ''}
                  </div>
                  <div className="m-actions">
                    <button
                      className="sm"
                      onClick={async () => {
                        await api.post(`/dashboard/tasks/${task.id}`, { status: 'SNOOZED', snoozeDays: 7 })
                        load()
                      }}
                    >
                      Позже
                    </button>
                    <button
                      className="sm"
                      onClick={async () => {
                        await api.post(`/dashboard/tasks/${task.id}`, { status: 'DONE' })
                        load()
                      }}
                    >
                      Готово
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td style={{ width: 1 }}>
                        <span className={`badge ${task.type === 'PATHOLOGY_ALERT' ? 'red' : task.overdue ? 'amber' : ''}`}>
                          {TASK_TYPE_LABELS[task.type] ?? task.type}
                        </span>
                      </td>
                      <td>
                        {task.procedureId ? (
                          <Link to={`/procedures/${task.procedureId}`}>{task.title}</Link>
                        ) : task.patientId ? (
                          <Link to={`/patients/${task.patientId}`}>{task.title}</Link>
                        ) : (
                          task.title
                        )}
                        <div className="muted" style={{ fontSize: 12 }}>
                          срок {fmtDate(task.dueDate)}
                          {task.assignee ? ` · ${task.assignee.fullName}` : ''}
                        </div>
                      </td>
                      <td style={{ width: 1 }} className="nowrap">
                        <button
                          className="sm"
                          onClick={async () => {
                            await api.post(`/dashboard/tasks/${task.id}`, { status: 'SNOOZED', snoozeDays: 7 })
                            load()
                          }}
                        >
                          Позже
                        </button>{' '}
                        <button
                          className="sm"
                          onClick={async () => {
                            await api.post(`/dashboard/tasks/${task.id}`, { status: 'DONE' })
                            load()
                          }}
                        >
                          Готово
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Что происходит в системе">
          {data.feed.length === 0 ? (
            <Empty text="Пока пусто" />
          ) : mobile ? (
            <div className="m-list">
              {data.feed.map((f) => (
                <div key={f.id} className="m-card">
                  <div className="m-row" style={{ fontSize: 11.5 }}>
                    {fmtDateTime(f.createdAt)}
                  </div>
                  <div className="m-row">
                    <b>{f.user}</b> — {AUDIT_ACTION_LABELS[f.action] ?? f.action}{' '}
                    {ENTITY_LABELS[f.entity] ?? f.entity}
                    {f.summary ? `: ${f.summary}` : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <tbody>
                  {data.feed.map((f) => (
                    <tr key={f.id}>
                      <td className="nowrap muted" style={{ width: 1 }}>
                        {fmtDateTime(f.createdAt)}
                      </td>
                      <td>
                        <b>{f.user}</b> — {AUDIT_ACTION_LABELS[f.action] ?? f.action}{' '}
                        {ENTITY_LABELS[f.entity] ?? f.entity}
                        {f.summary ? `: ${f.summary}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
