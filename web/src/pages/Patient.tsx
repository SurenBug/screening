import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../store'
import { Card, Empty, KV, Loader, StatusBadge } from '../components/ui'
import PregnancyForm from '../components/PregnancyForm'
import ScreeningForm from '../components/ScreeningForm'
import OutcomeForm from '../components/OutcomeForm'
import { fmtDate, fmtDateTime, fmtGest, fmtRisk, plural } from '../lib/format'
import { useIsMobile } from '../lib/useIsMobile'
import {
  AMNIONICITY_LABELS,
  AUDIT_ACTION_LABELS,
  CHORIONICITY_LABELS,
  CONCEPTION_LABELS,
  ENTITY_LABELS,
  POSTNATAL_LABELS,
  RHESUS_LABELS,
  SEX_LABELS,
} from '../lib/labels'
import type { AuditRow, Fetus, Patient, Pregnancy, Screening } from '../types'

type Tab = 'passport' | 'anamnesis' | 'pregnancy' | 'screening' | 'procedures' | 'results' | 'outcomes' | 'history'

const TABS: [Tab, string][] = [
  ['passport', 'Паспорт'],
  ['anamnesis', 'Анамнез'],
  ['pregnancy', 'Беременности'],
  ['screening', 'Скрининг'],
  ['procedures', 'Процедуры'],
  ['results', 'Результаты'],
  ['outcomes', 'Исходы'],
  ['history', 'История'],
]

export default function PatientPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { label, can } = useApp()
  const mobile = useIsMobile()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [tab, setTab] = useState<Tab>('passport')
  const [pregId, setPregId] = useState<string | null>(null)
  const [pregModal, setPregModal] = useState<{ open: boolean; pregnancy?: Pregnancy | null } | null>(null)
  const [scrModal, setScrModal] = useState<{ open: boolean; screening?: Screening | null } | null>(null)
  const [outModal, setOutModal] = useState<Fetus | null>(null)
  const [history, setHistory] = useState<AuditRow[] | null>(null)

  const load = useCallback(async () => {
    const p = await api.get<Patient>(`/patients/${id}`)
    setPatient(p)
    setPregId((cur) => cur ?? p.pregnancies[0]?.id ?? null)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab === 'history' && !history) {
      api.get<AuditRow[]>(`/patients/${id}/history`).then(setHistory)
    }
  }, [tab, history, id])

  if (!patient) return <Loader />
  const preg = patient.pregnancies.find((p) => p.id === pregId) ?? patient.pregnancies[0] ?? null

  const headActions = can('DOCTOR') ? (
    <>
      <button onClick={() => setPregModal({ open: true })}>+ Беременность</button>
      {preg && (
        <Link className="btn primary" to={`/procedures/new?pregnancyId=${preg.id}`}>
          + Процедура
        </Link>
      )}
      <button onClick={() => navigate(`/patients/${patient.id}/edit`)}>Изменить</button>
    </>
  ) : null

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {patient.fullName}{' '}
            {patient.rhesus === 'NEG' && <span className="badge red">Rh отрицательный</span>}
          </h1>
          <div className="page-sub">
            <span className="mono">{patient.code}</span> · {patient.age} лет · {fmtDate(patient.birthDate)}
            {patient.phone ? ` · ${patient.phone}` : ''}
            {patient.referringInstitution ? ` · ${patient.referringInstitution}` : ''}
          </div>
        </div>
        <div className="spacer" />
        {/* На телефоне кнопки собираются в один переносимый ряд */}
        {mobile ? <div className="btn-row">{headActions}</div> : headActions}
      </div>

      <div className="tabs">
        {TABS.map(([key, title]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {title}
          </button>
        ))}
      </div>

      {['screening', 'procedures', 'results', 'outcomes'].includes(tab) && patient.pregnancies.length > 1 && (
        <div className="toolbar">
          <label className="muted">Беременность:</label>
          <select value={pregId ?? ''} onChange={(e) => setPregId(e.target.value)} style={{ width: 'auto' }}>
            {patient.pregnancies.map((p) => (
              <option key={p.id} value={p.id}>
                №{p.number} · ПДР {fmtDate(p.edd)} · {p.plurality === 'MULTIPLE' ? `двойня (${p.fetusCount})` : 'одноплодная'}
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === 'passport' && (
        <div className="grid cols-2">
          <Card title="Паспортные данные">
            <KV
              items={[
                ['Код', <span className="mono">{patient.code}</span>],
                ['ФИО', patient.fullName],
                ['Дата рождения', `${fmtDate(patient.birthDate)} (${patient.age} лет)`],
                ['Телефон', patient.phone],
                ['Номер карты', patient.cardNumber],
                ['Группа крови', patient.bloodGroup],
                [
                  'Резус-фактор',
                  patient.rhesus ? (
                    <span className={patient.rhesus === 'NEG' ? 'rh-neg' : ''}>{RHESUS_LABELS[patient.rhesus]}</span>
                  ) : null,
                ],
                ['Адрес', patient.address],
                ['Направившее учреждение', patient.referringInstitution],
                ['СНИЛС', patient.snils],
                ['Полис', patient.policy],
              ]}
            />
          </Card>
          <Card title="Служебное">
            <KV
              items={[
                ['Заведена', `${fmtDate((patient as any).createdAt)} · ${patient.createdBy?.fullName ?? '—'}`],
                ['Беременностей в системе', String(patient.pregnancies.length)],
                [
                  'Процедур',
                  String(patient.pregnancies.reduce((a, p) => a + p.procedures.length, 0)),
                ],
                ['Примечания', patient.notes],
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'anamnesis' && (
        <div className="grid cols-2">
          <Card title="Акушерский анамнез">
            <KV
              items={[
                ['Беременностей', patient.gravida?.toString()],
                ['Родов', patient.para?.toString()],
                ['Выкидышей', patient.miscarriages?.toString()],
                ['Прерываний', patient.abortions?.toString()],
                ['Мертворождений', patient.stillbirths?.toString()],
                ['ЭКО', patient.ivf ? 'да' : 'нет'],
                ['Отягощённый анамнез', patient.obstetricHistory],
              ]}
            />
          </Card>
          <Card title="Генетический анамнез">
            <KV
              items={[
                ['Кровное родство', patient.consanguinity ? 'да' : 'нет'],
                ['Генетический анамнез', patient.geneticHistory],
                ['Заболевания в семье', patient.familyHistory],
                ['Хронические заболевания', patient.chronicDiseases],
                ['Тератогены, вредности', patient.teratogens],
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'pregnancy' && (
        <>
          {patient.pregnancies.length === 0 ? (
            <div className="card">
              <Empty text="Беременностей нет. Заведите беременность, чтобы назначить процедуру." />
            </div>
          ) : (
            patient.pregnancies.map((p) => (
              <Card
                key={p.id}
                title={`Беременность №${p.number}`}
                actions={
                  can('DOCTOR') && (
                    <div className="btn-row">
                      <button className="sm" onClick={() => setPregModal({ open: true, pregnancy: p })}>
                        Изменить
                      </button>
                      <Link className="btn sm primary" to={`/procedures/new?pregnancyId=${p.id}`}>
                        + Процедура
                      </Link>
                    </div>
                  )
                }
              >
                <div className="grid cols-2">
                  <KV
                    items={[
                      ['Последняя менструация', fmtDate(p.lmpDate)],
                      ['УЗИ для датировки', p.usDate ? `${fmtDate(p.usDate)} — ${fmtGest(p.usGestWeeks, p.usGestDays)}` : '—'],
                      ['Предполагаемая дата родов', fmtDate(p.edd)],
                      ['Текущий срок', p.currentGestation ? fmtGest(p.currentGestation.weeks, p.currentGestation.days) : '—'],
                      ['Наступление', p.conception ? CONCEPTION_LABELS[p.conception] : '—'],
                    ]}
                  />
                  <KV
                    items={[
                      [
                        'Плодность',
                        p.plurality === 'MULTIPLE'
                          ? `многоплодная, ${plural(p.fetusCount, 'плод', 'плода', 'плодов')}`
                          : 'одноплодная',
                      ],
                      ['Хориальность', p.chorionicity ? CHORIONICITY_LABELS[p.chorionicity] : '—'],
                      ['Амниальность', p.amnionicity ? AMNIONICITY_LABELS[p.amnionicity] : '—'],
                      [
                        'Плоды',
                        p.fetuses
                          .map((fx) => `${fx.label}${fx.sex ? ` (${SEX_LABELS[fx.sex] ?? fx.sex})` : ''}`)
                          .join(', '),
                      ],
                      ['Процедур', String(p.procedures.length)],
                    ]}
                  />
                </div>
                {p.notes && <div className="muted" style={{ marginTop: 10 }}>{p.notes}</div>}
              </Card>
            ))
          )}
        </>
      )}

      {tab === 'screening' && (
        <Card
          title="Данные скрининга"
          actions={
            preg &&
            can('DOCTOR') && (
              <button className="sm primary" onClick={() => setScrModal({ open: true })}>
                + Добавить
              </button>
            )
          }
        >
          {!preg || preg.screenings.length === 0 ? (
            <Empty text="Данных скрининга нет" />
          ) : mobile ? (
            <div className="m-list">
              {preg.screenings.map((s) => (
                <div key={s.id} className="m-card">
                  <div className="m-top">
                    <span className="m-title">
                      {s.trimester ? `${s.trimester === 1 ? 'I' : 'II'} триместр` : 'Скрининг'}
                    </span>
                    <span className="m-code">{fmtDate(s.date)}</span>
                  </div>
                  <div className="m-row">
                    Срок: <b>{fmtGest(s.gestWeeks, s.gestDays)}</b>
                  </div>
                  <div className="m-row">
                    КТР: {s.crl ?? '—'} · ТВП:{' '}
                    <span className={(s.ntMm ?? 0) >= 3 ? 'rh-neg' : ''}>{s.ntMm ?? '—'}</span>
                  </div>
                  <div className="m-row">
                    PAPP-A: {s.pappaMom ?? '—'} · β-ХГЧ: {s.hcgMom ?? '—'}
                  </div>
                  <div className="m-row">
                    Риск Т21:{' '}
                    <span className={(s.riskT21 ?? 9999) <= 250 ? 'rh-neg' : ''}>{fmtRisk(s.riskT21)}</span>
                  </div>
                  <div className="m-row">Программа: {s.riskProgram ?? '—'}</div>
                  <div className="m-row">НИПТ: {s.niptDone ? s.niptResult || 'проведён' : '—'}</div>
                  <div className="m-row">УЗ-находки: {s.usFindings ?? s.malformations ?? '—'}</div>
                  {can('DOCTOR') && (
                    <div className="m-actions">
                      <button className="sm" onClick={() => setScrModal({ open: true, screening: s })}>
                        Изменить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Триместр</th>
                    <th>Дата</th>
                    <th>Срок</th>
                    <th className="num">КТР</th>
                    <th className="num">ТВП</th>
                    <th className="num">PAPP-A</th>
                    <th className="num">β-ХГЧ</th>
                    <th>Риск Т21</th>
                    <th>Программа</th>
                    <th>НИПТ</th>
                    <th>УЗ-находки</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {preg.screenings.map((s) => (
                    <tr key={s.id}>
                      <td>{s.trimester ? `${s.trimester === 1 ? 'I' : 'II'}` : '—'}</td>
                      <td className="nowrap">{fmtDate(s.date)}</td>
                      <td className="nowrap">{fmtGest(s.gestWeeks, s.gestDays)}</td>
                      <td className="num">{s.crl ?? '—'}</td>
                      <td className="num" style={{ color: (s.ntMm ?? 0) >= 3 ? 'var(--danger)' : undefined }}>
                        {s.ntMm ?? '—'}
                      </td>
                      <td className="num">{s.pappaMom ?? '—'}</td>
                      <td className="num">{s.hcgMom ?? '—'}</td>
                      <td className={(s.riskT21 ?? 9999) <= 250 ? 'rh-neg nowrap' : 'nowrap'}>{fmtRisk(s.riskT21)}</td>
                      <td>{s.riskProgram ?? '—'}</td>
                      <td>{s.niptDone ? s.niptResult || 'проведён' : '—'}</td>
                      <td>{s.usFindings ?? s.malformations ?? '—'}</td>
                      <td>
                        {can('DOCTOR') && (
                          <button className="sm" onClick={() => setScrModal({ open: true, screening: s })}>
                            Изменить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'procedures' && (
        <Card title="Инвазивные процедуры">
          {!preg || preg.procedures.length === 0 ? (
            <Empty text="Процедур нет" />
          ) : mobile ? (
            <div className="m-list">
              {preg.procedures.map((pr) => (
                <button key={pr.id} className="m-card" onClick={() => navigate(`/procedures/${pr.id}`)}>
                  <div className="m-top">
                    <span className="m-title">{label('PROCEDURE_TYPE', pr.procedureType)}</span>
                    <span className="m-code">{pr.code}</span>
                  </div>
                  <div className="m-row">
                    <b>{fmtDate(pr.performedAt ?? pr.plannedDate)}</b> · срок {fmtGest(pr.gestWeeks, pr.gestDays)}
                  </div>
                  <div className="m-row">
                    {pr.indications.map((i) => i.dictionary.label).join('; ') || 'показания не указаны'}
                  </div>
                  <div className="m-row">Оператор: {pr.operator?.fullName ?? '—'}</div>
                  <div className="m-tags">
                    <StatusBadge status={pr.status} />
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
                    <th>Дата</th>
                    <th>Вид</th>
                    <th>Срок</th>
                    <th>Показания</th>
                    <th>Оператор</th>
                    <th>Образцы</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {preg.procedures.map((pr) => (
                    <tr key={pr.id} className="clickable" onClick={() => navigate(`/procedures/${pr.id}`)}>
                      <td className="mono nowrap">{pr.code}</td>
                      <td className="nowrap">{fmtDate(pr.performedAt ?? pr.plannedDate)}</td>
                      <td>{label('PROCEDURE_TYPE', pr.procedureType)}</td>
                      <td className="nowrap">{fmtGest(pr.gestWeeks, pr.gestDays)}</td>
                      <td>{pr.indications.map((i) => i.dictionary.label).join('; ') || '—'}</td>
                      <td>{pr.operator?.fullName ?? '—'}</td>
                      <td className="mono">{pr.samples.map((s) => s.code.split('-').pop()).join(', ') || '—'}</td>
                      <td>
                        <StatusBadge status={pr.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'results' && (
        <Card title="Результаты исследований">
          {!preg || preg.procedures.every((p) => p.samples.every((s) => s.results.length === 0)) ? (
            <Empty text="Результатов пока нет" />
          ) : mobile ? (
            <div className="m-list">
              {preg.procedures.flatMap((pr) =>
                pr.samples.flatMap((s) =>
                  s.results.map((r) => (
                    <div key={r.id} className={r.isPathological ? 'm-card pathology' : 'm-card'}>
                      <div className="m-top">
                        <span className="m-title">{s.fetus ? `Плод ${s.fetus.label}` : 'Результат'}</span>
                        <span className="m-code">{s.code}</span>
                      </div>
                      <div className="m-row">
                        {label('METHOD', r.method)} · {fmtDate(r.reportedAt)}
                      </div>
                      <div className="m-row">
                        <b>{label('RESULT_CATEGORY', r.category)}</b>
                      </div>
                      {r.karyotype && <div className="m-row mono">{r.karyotype}</div>}
                      {r.conclusion && <div className="m-row">{r.conclusion}</div>}
                      <div className="m-tags">
                        {r.deliveredAt ? (
                          <span className="badge green">выдан {fmtDate(r.deliveredAt)}</span>
                        ) : (
                          <span className="badge amber">не выдан</span>
                        )}
                      </div>
                    </div>
                  )),
                ),
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Образец</th>
                    <th>Плод</th>
                    <th>Метод</th>
                    <th>Дата</th>
                    <th>Категория</th>
                    <th>Кариотип</th>
                    <th>Заключение</th>
                    <th>Выдан</th>
                  </tr>
                </thead>
                <tbody>
                  {preg.procedures.flatMap((pr) =>
                    pr.samples.flatMap((s) =>
                      s.results.map((r) => (
                        <tr key={r.id} className={r.isPathological ? 'pathology' : ''}>
                          <td className="mono nowrap">{s.code}</td>
                          <td>{s.fetus?.label ?? '—'}</td>
                          <td>{label('METHOD', r.method)}</td>
                          <td className="nowrap">{fmtDate(r.reportedAt)}</td>
                          <td>{label('RESULT_CATEGORY', r.category)}</td>
                          <td className="mono">{r.karyotype ?? '—'}</td>
                          <td>{r.conclusion ?? '—'}</td>
                          <td className="nowrap">
                            {r.deliveredAt ? fmtDate(r.deliveredAt) : <span className="badge amber">не выдан</span>}
                          </td>
                        </tr>
                      )),
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'outcomes' && (
        <Card title="Исход беременности">
          {!preg ? (
            <Empty text="Нет беременности" />
          ) : mobile ? (
            <div className="m-list">
              {preg.fetuses.map((fx) => (
                <div key={fx.id} className="m-card">
                  <div className="m-top">
                    <span className="m-title">Плод {fx.label}</span>
                    <span className="m-code">{fx.sex ? SEX_LABELS[fx.sex] ?? fx.sex : '—'}</span>
                  </div>
                  <div className="m-row">
                    Исход:{' '}
                    {fx.outcome?.outcomeType ? (
                      <b>{label('OUTCOME', fx.outcome.outcomeType)}</b>
                    ) : (
                      <span className="badge amber">не внесён</span>
                    )}
                  </div>
                  <div className="m-row">
                    {fmtDate(fx.outcome?.date)} · срок {fmtGest(fx.outcome?.gestWeeks, fx.outcome?.gestDays)}
                  </div>
                  <div className="m-row">Масса: {fx.outcome?.birthWeight ?? '—'}</div>
                  <div className="m-row">
                    Постнатальная сверка:{' '}
                    {fx.outcome?.postnatalConfirmation
                      ? POSTNATAL_LABELS[fx.outcome.postnatalConfirmation]
                      : '—'}
                  </div>
                  {fx.outcome?.procedureRelatedLoss && (
                    <div className="m-tags">
                      <span className="badge red">потеря связана с процедурой</span>
                    </div>
                  )}
                  {can('DOCTOR') && (
                    <div className="m-actions">
                      <button className="sm" onClick={() => setOutModal(fx)}>
                        {fx.outcome ? 'Изменить' : 'Внести'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Плод</th>
                    <th>Пол</th>
                    <th>Исход</th>
                    <th>Дата</th>
                    <th>Срок</th>
                    <th className="num">Масса</th>
                    <th>Постнатальная сверка</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {preg.fetuses.map((fx) => (
                    <tr key={fx.id}>
                      <td>
                        <b>{fx.label}</b>
                      </td>
                      <td>{fx.sex ? SEX_LABELS[fx.sex] ?? fx.sex : '—'}</td>
                      <td>{fx.outcome?.outcomeType ? label('OUTCOME', fx.outcome.outcomeType) : <span className="badge amber">не внесён</span>}</td>
                      <td className="nowrap">{fmtDate(fx.outcome?.date)}</td>
                      <td className="nowrap">{fmtGest(fx.outcome?.gestWeeks, fx.outcome?.gestDays)}</td>
                      <td className="num">{fx.outcome?.birthWeight ?? '—'}</td>
                      <td>
                        {fx.outcome?.postnatalConfirmation
                          ? POSTNATAL_LABELS[fx.outcome.postnatalConfirmation]
                          : '—'}
                        {fx.outcome?.procedureRelatedLoss && (
                          <div>
                            <span className="badge red">потеря связана с процедурой</span>
                          </div>
                        )}
                      </td>
                      <td>
                        {can('DOCTOR') && (
                          <button className="sm" onClick={() => setOutModal(fx)}>
                            {fx.outcome ? 'Изменить' : 'Внести'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'history' && (
        <Card title="История изменений">
          {!history ? (
            <Loader />
          ) : history.length === 0 ? (
            <Empty text="Записей нет" />
          ) : mobile ? (
            <div className="m-list">
              {history.map((h) => (
                <div key={h.id} className="m-card">
                  <div className="m-top">
                    <span className="m-title">{h.user?.fullName ?? '—'}</span>
                    <span className="m-code">{fmtDateTime(h.createdAt)}</span>
                  </div>
                  <div className="m-row">
                    <b>{AUDIT_ACTION_LABELS[h.action] ?? h.action}</b> · {ENTITY_LABELS[h.entity] ?? h.entity}
                    {h.summary ? ` — ${h.summary}` : ''}
                  </div>
                  {h.changes && (
                    <div className="m-row" style={{ fontSize: 11.5 }}>
                      {Object.entries(h.changes)
                        .slice(0, 6)
                        .map(([k, v]) => `${k}: ${fmtVal(v.from)} → ${fmtVal(v.to)}`)
                        .join('; ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Кто</th>
                    <th>Что</th>
                    <th>Изменения</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="nowrap muted">{fmtDateTime(h.createdAt)}</td>
                      <td className="nowrap">{h.user?.fullName ?? '—'}</td>
                      <td>
                        {AUDIT_ACTION_LABELS[h.action] ?? h.action} · {ENTITY_LABELS[h.entity] ?? h.entity}
                        {h.summary ? ` — ${h.summary}` : ''}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {h.changes
                          ? Object.entries(h.changes)
                              .slice(0, 6)
                              .map(([k, v]) => `${k}: ${fmtVal(v.from)} → ${fmtVal(v.to)}`)
                              .join('; ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {pregModal?.open && (
        <PregnancyForm
          patientId={patient.id}
          pregnancy={pregModal.pregnancy}
          onClose={() => setPregModal(null)}
          onSaved={load}
        />
      )}
      {scrModal?.open && preg && (
        <ScreeningForm
          pregnancyId={preg.id}
          screening={scrModal.screening}
          onClose={() => setScrModal(null)}
          onSaved={load}
        />
      )}
      {outModal && <OutcomeForm fetus={outModal} onClose={() => setOutModal(null)} onSaved={load} />}
    </div>
  )
}

function fmtVal(v: unknown) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'да' : 'нет'
  const s = String(v)
  return s.length > 40 ? s.slice(0, 40) + '…' : s
}
