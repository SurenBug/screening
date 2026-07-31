import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../store'
import { Card, Check, Empty, KV, Loader, Modal, Select, StatusBadge, Text, Warnings } from '../components/ui'
import ResultForm from '../components/ResultForm'
import { fmtDate, fmtGest, int } from '../lib/format'
import { useIsMobile } from '../lib/useIsMobile'
import { DELIVERY_LABELS, SAMPLE_STATUS_LABELS, STATUS_FLOW, STATUS_LABELS } from '../lib/labels'
import type { Procedure, Sample } from '../types'

export default function ProcedurePage() {
  const { id } = useParams()
  const { label, can, list } = useApp()
  const mobile = useIsMobile()
  const [proc, setProc] = useState<Procedure | null>(null)
  const [resultFor, setResultFor] = useState<Sample | null>(null)
  const [deliverFor, setDeliverFor] = useState<string | null>(null)
  const [compModal, setCompModal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setProc(await api.get<Procedure>(`/procedures/${id}`))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (!proc) return <Loader />
  const patient = proc.pregnancy!.patient
  const stepIndex = STATUS_FLOW.indexOf(proc.status)

  async function setStatus(status: string) {
    await api.post(`/procedures/${id}/status`, { status })
    load()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            <span className="mono">{proc.code}</span> · {label('PROCEDURE_TYPE', proc.procedureType)}
          </h1>
          <div className="page-sub">
            <Link to={`/patients/${patient.id}`}>
              {patient.lastName} {patient.firstName} {patient.middleName ?? ''}
            </Link>{' '}
            · <span className="mono">{patient.code}</span> ·{' '}
            {fmtDate(proc.performedAt ?? proc.plannedDate)} · срок {fmtGest(proc.gestWeeks, proc.gestDays)}
            {patient.rhesus === 'NEG' && <span className="badge red" style={{ marginLeft: 8 }}>Rh отрицательный</span>}
          </div>
        </div>
        <div className="spacer" />
        <StatusBadge status={proc.status} />
      </div>

      {notice && <div className="alert-box ok">{notice}</div>}
      <Warnings items={proc.warnings} />

      {/* Полоса жизненного цикла — сразу видно, на каком этапе застряла запись */}
      <div className="card">
        <div className="wizard-steps" style={{ marginBottom: 0 }}>
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className={`step ${proc!.status === s ? 'active' : ''} ${stepIndex > i ? 'done' : ''}`}>
              <span className="n">{stepIndex > i ? '✓' : i + 1}</span>
              {STATUS_LABELS[s]}
            </div>
          ))}
        </div>
        {can('DOCTOR', 'LAB') && (
          <div className="btn-row" style={{ marginTop: 12 }}>
            {proc.status === 'PLANNED' && (
              <button className="primary" onClick={() => setStatus('PERFORMED')}>
                Отметить как выполненную
              </button>
            )}
            {['PLANNED', 'PERFORMED'].includes(proc.status) && (
              <>
                <button onClick={() => setStatus('CANCELLED')}>Отменить процедуру</button>
                <button onClick={() => setStatus('FAILED')}>Неудачная попытка забора</button>
              </>
            )}
            <button onClick={() => setCompModal(true)}>Внести осложнение</button>
          </div>
        )}
      </div>

      <div className="grid cols-2">
        <Card title="Протокол процедуры">
          <KV
            items={[
              ['Вид', label('PROCEDURE_TYPE', proc.procedureType)],
              ['Дата', fmtDate(proc.performedAt ?? proc.plannedDate)],
              ['Срок беременности', fmtGest(proc.gestWeeks, proc.gestDays)],
              ['Доступ', label('ACCESS', proc.access)],
              ['Игла', proc.needleGauge],
              ['Число пункций', proc.punctureCount?.toString()],
              ['Расположение плаценты', label('PLACENTA_LOCATION', proc.placentaLocation)],
              ['Оператор', proc.operator?.fullName],
              ['Ассистент', proc.assistant?.fullName],
              ['Антибиотикопрофилактика', proc.antibioticProphylaxis ? 'да' : 'нет'],
              [
                'Анти-D иммуноглобулин',
                proc.antiDIndicated ? (
                  proc.antiDGiven ? (
                    `введён ${fmtDate(proc.antiDDate)}${proc.antiDDose ? `, ${proc.antiDDose}` : ''}`
                  ) : (
                    <span className="badge red">показан, но не отмечен</span>
                  )
                ) : (
                  'не требуется'
                ),
              ],
              ['Технические особенности', proc.technicalNotes],
              ['Примечания', proc.notes],
            ]}
          />
        </Card>

        <div>
          <Card title="Показания">
            {proc.indications.length === 0 ? (
              <Empty text="Не указаны" />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {proc.indications.map((i) => (
                  <li key={i.dictionaryId}>{i.dictionary.label}</li>
                ))}
              </ul>
            )}
            {proc.riskValue && <div style={{ marginTop: 8 }}>Расчётный риск: <b>1:{proc.riskValue}</b></div>}
            {proc.indicationNotes && <div className="muted" style={{ marginTop: 6 }}>{proc.indicationNotes}</div>}
          </Card>

          <Card title="Осложнения">
            {proc.complications.length === 0 ? (
              <Empty text="Осложнений не зарегистрировано" />
            ) : (
              <table className="data">
                <tbody>
                  {proc.complications.map((c) => (
                    <tr key={c.id}>
                      <td>{c.dictionary.label}</td>
                      <td className="muted">{c.daysAfter != null ? `через ${c.daysAfter} дн` : ''}</td>
                      <td className="muted">{c.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      <Card title="Образцы и результаты">
        {proc.samples.length === 0 ? (
          <Empty text="Образцы не заведены" />
        ) : mobile ? (
          <div className="m-list">
            {proc.samples.map((s) => {
              const r = s.results[0]
              return (
                <div key={s.id} className={r?.isPathological ? 'm-card pathology' : 'm-card'}>
                  <div className="m-top">
                    <span className="m-title">{s.fetus ? `Плод ${s.fetus.label}` : 'Образец'}</span>
                    <span className="m-code">{s.code}</span>
                  </div>
                  <div className="m-row">Материал: {label('MATERIAL_TYPE', s.materialType)}</div>
                  <div className="m-row">
                    Методы: {s.methods.map((m) => m.dictionary.label).join('; ') || '—'}
                  </div>
                  <div className="m-row">Срок готовности: {fmtDate(s.deadline)}</div>
                  <div className="m-tags">
                    <span className="badge">{SAMPLE_STATUS_LABELS[s.status] ?? s.status}</span>
                  </div>
                  {r ? (
                    <>
                      <div className="m-row">
                        <b>{label('RESULT_CATEGORY', r.category)}</b>
                      </div>
                      {r.karyotype && <div className="m-row mono">{r.karyotype}</div>}
                      {r.conclusion && <div className="m-row">{r.conclusion}</div>}
                      <div className="m-row">
                        {label('METHOD', r.method)} · {fmtDate(r.reportedAt)}
                        {r.performedBy ? ` · ${r.performedBy.fullName}` : ''}
                      </div>
                      <div className="m-tags">
                        {r.deliveredAt ? (
                          <span className="badge green">
                            выдан {fmtDate(r.deliveredAt)}
                            {r.deliveryMethod ? `, ${DELIVERY_LABELS[r.deliveryMethod] ?? ''}` : ''}
                          </span>
                        ) : (
                          <span className="badge amber">не выдан пациентке</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="m-row">Результат ожидается</div>
                  )}
                  {(can('LAB') || (r && !r.deliveredAt && can('DOCTOR'))) && (
                    <div className="m-actions">
                      {can('LAB') && (
                        <button className="sm" onClick={() => setResultFor(s)}>
                          {r ? 'Изменить результат' : 'Внести результат'}
                        </button>
                      )}
                      {r && !r.deliveredAt && can('DOCTOR') && (
                        <button className="sm primary" onClick={() => setDeliverFor(r.id)}>
                          Отметить выдачу
                        </button>
                      )}
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
                  <th>Образец</th>
                  <th>Плод</th>
                  <th>Материал</th>
                  <th>Методы</th>
                  <th>Статус</th>
                  <th>Срок готовности</th>
                  <th>Результат</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {proc.samples.map((s) => {
                  const r = s.results[0]
                  return (
                    <tr key={s.id} className={r?.isPathological ? 'pathology' : ''}>
                      <td className="mono nowrap">{s.code}</td>
                      <td>{s.fetus?.label ?? '—'}</td>
                      <td>{label('MATERIAL_TYPE', s.materialType)}</td>
                      <td>{s.methods.map((m) => m.dictionary.label).join('; ')}</td>
                      <td>
                        <span className="badge">{SAMPLE_STATUS_LABELS[s.status] ?? s.status}</span>
                      </td>
                      <td className="nowrap">{fmtDate(s.deadline)}</td>
                      <td>
                        {r ? (
                          <>
                            <div>
                              <b>{label('RESULT_CATEGORY', r.category)}</b>
                            </div>
                            {r.karyotype && <div className="mono">{r.karyotype}</div>}
                            {r.conclusion && <div className="muted">{r.conclusion}</div>}
                            <div className="muted" style={{ fontSize: 12 }}>
                              {label('METHOD', r.method)} · {fmtDate(r.reportedAt)}
                              {r.performedBy ? ` · ${r.performedBy.fullName}` : ''}
                            </div>
                            {r.deliveredAt ? (
                              <div className="badge green">
                                выдан {fmtDate(r.deliveredAt)}
                                {r.deliveryMethod ? `, ${DELIVERY_LABELS[r.deliveryMethod] ?? ''}` : ''}
                              </div>
                            ) : (
                              <div className="badge amber">не выдан пациентке</div>
                            )}
                          </>
                        ) : (
                          <span className="muted">ожидается</span>
                        )}
                      </td>
                      <td className="nowrap">
                        {can('LAB') && (
                          <button className="sm" onClick={() => setResultFor(s)}>
                            {r ? 'Изменить результат' : 'Внести результат'}
                          </button>
                        )}{' '}
                        {r && !r.deliveredAt && can('DOCTOR') && (
                          <button className="sm primary" onClick={() => setDeliverFor(r.id)}>
                            Отметить выдачу
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Исходы по плодам">
        {mobile ? (
          <div className="m-list">
            {proc.pregnancy!.fetuses.map((f) => (
              <div key={f.id} className="m-card">
                <div className="m-top">
                  <span className="m-title">Плод {f.label}</span>
                  <span className="m-code">{fmtDate(f.outcome?.date)}</span>
                </div>
                <div className="m-row">
                  Исход:{' '}
                  {f.outcome?.outcomeType ? (
                    <b>{label('OUTCOME', f.outcome.outcomeType)}</b>
                  ) : (
                    <span className="badge amber">не внесён</span>
                  )}
                </div>
                <div className="m-row">Постнатальная сверка: {f.outcome?.postnatalDiagnosis ?? '—'}</div>
                <div className="m-actions">
                  <Link className="btn sm" to={`/patients/${patient.id}`}>
                    Открыть карточку
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Плод</th>
                <th>Исход</th>
                <th>Дата</th>
                <th>Постнатальная сверка</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {proc.pregnancy!.fetuses.map((f) => (
                <tr key={f.id}>
                  <td>
                    <b>{f.label}</b>
                  </td>
                  <td>
                    {f.outcome?.outcomeType ? label('OUTCOME', f.outcome.outcomeType) : <span className="badge amber">не внесён</span>}
                  </td>
                  <td className="nowrap">{fmtDate(f.outcome?.date)}</td>
                  <td>{f.outcome?.postnatalDiagnosis ?? '—'}</td>
                  <td>
                    <Link className="btn sm" to={`/patients/${patient.id}`}>
                      Открыть карточку
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      {resultFor && (
        <ResultForm
          sample={resultFor}
          onClose={() => setResultFor(null)}
          onSaved={() => {
            setNotice('Результат сохранён. Задача «сообщить результат» создана автоматически.')
            load()
          }}
        />
      )}

      {deliverFor && (
        <DeliverModal
          resultId={deliverFor}
          onClose={() => setDeliverFor(null)}
          onSaved={() => {
            setNotice('Выдача результата зафиксирована.')
            load()
          }}
        />
      )}

      {compModal && (
        <ComplicationModal
          procedureId={proc.id}
          existing={proc.complications.map((c) => ({ dictionaryId: c.dictionaryId, daysAfter: c.daysAfter ?? null, notes: c.notes ?? null }))}
          options={list('COMPLICATION')}
          onClose={() => setCompModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}

function DeliverModal({
  resultId,
  onClose,
  onSaved,
}: {
  resultId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [method, setMethod] = useState('IN_PERSON')
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="Выдача результата пациентке"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await api.post(`/lab/results/${resultId}/deliver`, { deliveryMethod: method })
              onSaved()
              onClose()
            }}
          >
            Зафиксировать
          </button>
        </>
      }
    >
      <p className="muted">Фиксируется дата, способ и сотрудник, сообщивший результат.</p>
      <Select
        label="Способ"
        value={method}
        onChange={setMethod}
        empty={null}
        options={Object.entries(DELIVERY_LABELS).map(([value, label]) => ({ value, label }))}
      />
    </Modal>
  )
}

function ComplicationModal({
  procedureId,
  existing,
  options,
  onClose,
  onSaved,
}: {
  procedureId: string
  existing: { dictionaryId: string; daysAfter: number | null; notes: string | null }[]
  options: { id: string; label: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [items, setItems] = useState(existing)
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title="Осложнения процедуры"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await api.patch(`/procedures/${procedureId}`, { complications: items })
              onSaved()
              onClose()
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      {options.map((o) => {
        const idx = items.findIndex((i) => i.dictionaryId === o.id)
        const checked = idx >= 0
        return (
          <div key={o.id}>
            <Check
              label={o.label}
              checked={checked}
              onChange={(v) =>
                setItems(v ? [...items, { dictionaryId: o.id, daysAfter: null, notes: null }] : items.filter((i) => i.dictionaryId !== o.id))
              }
            />
            {checked && (
              <div className="grid cols-2" style={{ marginLeft: 24, marginBottom: 8 }}>
                <Text
                  label="Через сколько дней после процедуры"
                  type="number"
                  value={items[idx].daysAfter?.toString() ?? ''}
                  onChange={(v) =>
                    setItems(items.map((i, n) => (n === idx ? { ...i, daysAfter: int(v) } : i)))
                  }
                />
                <Text
                  label="Комментарий"
                  value={items[idx].notes ?? ''}
                  onChange={(v) => setItems(items.map((i, n) => (n === idx ? { ...i, notes: v } : i)))}
                />
              </div>
            )}
          </div>
        )
      })}
    </Modal>
  )
}

