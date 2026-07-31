import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../store'
import { Area, Check, DictSelect, ErrorBox, KV, Loader, Select, Text } from '../components/ui'
import PhotoRecognizer from '../components/PhotoRecognizer'
import { fmtDate, fmtGest, int, toInputDate } from '../lib/format'
import type { Pregnancy, Procedure } from '../types'

interface SampleDraft {
  fetusId: string
  materialType: string
  volume: string
  containerNumber: string
  quality: string
  methodIds: string[]
  include: boolean
}

const STEPS = ['Показание', 'Протокол процедуры', 'Образцы', 'Проверка']

/** Рекомендуемые сроки — те же, что проверяет сервер. Здесь для подсказки в реальном времени. */
const WINDOWS: Record<string, [number, number]> = {
  CVS: [10, 14],
  AMNIO: [16, 22],
  CORDO: [19, 40],
  PLACENTO: [14, 20],
}

export default function ProcedureWizardPage() {
  const [params] = useSearchParams()
  const pregnancyId = params.get('pregnancyId')
  const navigate = useNavigate()
  const { list, label, users, user } = useApp()

  const [pregnancy, setPregnancy] = useState<(Pregnancy & { patient: any }) | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const draftKey = `procedure-draft:${pregnancyId}`
  const [form, setForm] = useState({
    indicationIds: [] as string[],
    riskValue: '',
    indicationNotes: '',
    performedAt: toInputDate(new Date()),
    planned: false,
    procedureType: '',
    access: 'TRANSABDOMINAL',
    needleGauge: '22G',
    punctureCount: '1',
    placentaLocation: '',
    usDevice: '',
    operatorId: '',
    assistantId: '',
    antibioticProphylaxis: false,
    antiDGiven: false,
    antiDDate: '',
    antiDDose: '',
    technicalNotes: '',
    notes: '',
  })
  const [samples, setSamples] = useState<SampleDraft[]>([])

  useEffect(() => {
    if (!pregnancyId) return
    api.get<Pregnancy & { patient: any }>(`/pregnancies/${pregnancyId}`).then((p) => {
      setPregnancy(p)
      setSamples((cur) =>
        cur.length
          ? cur
          : p.fetuses.map((f) => ({
              fetusId: f.id,
              materialType: '',
              volume: '',
              containerNumber: '',
              quality: 'GOOD',
              methodIds: [],
              include: true,
            })),
      )
    })
  }, [pregnancyId])

  // Черновик сохраняется сам: закрыла вкладку — ничего не потеряла
  useEffect(() => {
    const saved = localStorage.getItem(draftKey)
    if (saved) {
      try {
        const d = JSON.parse(saved)
        setForm((f) => ({ ...f, ...d.form }))
        if (d.samples?.length) setSamples(d.samples)
        if (d.step) setStep(d.step)
      } catch {
        /* повреждённый черновик игнорируем */
      }
    }
  }, [draftKey])

  useEffect(() => {
    if (!pregnancy) return
    localStorage.setItem(draftKey, JSON.stringify({ form, samples, step }))
  }, [form, samples, step, draftKey, pregnancy])

  useEffect(() => {
    if (user && !form.operatorId) setForm((f) => ({ ...f, operatorId: user.id }))
  }, [user, form.operatorId])

  const gest = useMemo(() => {
    if (!pregnancy || !form.performedAt) return null
    const at = new Date(form.performedAt)
    if (pregnancy.usDate && (pregnancy.usGestWeeks != null || pregnancy.usGestDays != null)) {
      const base = (pregnancy.usGestWeeks ?? 0) * 7 + (pregnancy.usGestDays ?? 0)
      const days = base + Math.round((day(at) - day(new Date(pregnancy.usDate))) / 86_400_000)
      return { weeks: Math.floor(days / 7), days: days % 7 }
    }
    if (pregnancy.lmpDate) {
      const days = Math.round((day(at) - day(new Date(pregnancy.lmpDate))) / 86_400_000)
      return { weeks: Math.floor(days / 7), days: days % 7 }
    }
    return null
  }, [pregnancy, form.performedAt])

  const rhNeg = pregnancy?.patient?.rhesus === 'NEG'

  const warnings = useMemo(() => {
    const w: string[] = []
    if (!form.indicationIds.length) w.push('Не указано показание к инвазивной диагностике')
    if (!form.procedureType) w.push('Не выбран вид процедуры')
    const win = WINDOWS[form.procedureType]
    if (win && gest && (gest.weeks < win[0] || gest.weeks > win[1])) {
      w.push(`Срок ${gest.weeks} нед вне рекомендуемого окна для этой процедуры (${win[0]}–${win[1]} нед)`)
    }
    if (rhNeg && !form.antiDGiven) w.push('Резус-отрицательная кровь: не отмечено введение анти-D иммуноглобулина')
    const active = samples.filter((s) => s.include)
    if (!active.length) w.push('Не заведён ни один образец')
    if (active.some((s) => !s.materialType)) w.push('У образца не указан тип материала')
    if (active.some((s) => !s.methodIds.length)) w.push('У образца не назначен ни один метод исследования')
    if (pregnancy?.plurality === 'MULTIPLE' && active.length < pregnancy.fetusCount) {
      w.push('Многоплодная беременность: образец заведён не на каждый плод')
    }
    return w
  }, [form, samples, gest, rhNeg, pregnancy])

  if (!pregnancyId) return <div className="page">Не выбрана беременность</div>
  if (!pregnancy) return <Loader />

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function setSample(i: number, patch: Partial<SampleDraft>) {
    setSamples((s) => s.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<Procedure>('/procedures', {
        pregnancyId,
        status: form.planned ? 'PLANNED' : 'PERFORMED',
        performedAt: form.planned ? null : form.performedAt,
        plannedDate: form.planned ? form.performedAt : null,
        procedureType: form.procedureType || null,
        access: form.access || null,
        needleGauge: form.needleGauge || null,
        punctureCount: int(form.punctureCount),
        placentaLocation: form.placentaLocation || null,
        usDevice: form.usDevice || null,
        operatorId: form.operatorId || null,
        assistantId: form.assistantId || null,
        antibioticProphylaxis: form.antibioticProphylaxis,
        antiDIndicated: rhNeg,
        antiDGiven: form.antiDGiven,
        antiDDate: form.antiDDate || null,
        antiDDose: form.antiDDose || null,
        riskValue: int(form.riskValue),
        indicationNotes: form.indicationNotes || null,
        technicalNotes: form.technicalNotes || null,
        notes: form.notes || null,
        indicationIds: form.indicationIds,
        samples: samples
          .filter((s) => s.include)
          .map((s) => ({
            fetusId: s.fetusId,
            materialType: s.materialType || null,
            volume: s.volume || null,
            containerNumber: s.containerNumber || null,
            quality: s.quality || null,
            methodIds: s.methodIds,
            handedAt: form.planned ? null : form.performedAt,
          })),
      })
      localStorage.removeItem(draftKey)
      navigate(`/procedures/${created.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head">
        <div>
          <h1>Новая процедура</h1>
          <div className="page-sub">
            {pregnancy.patient.lastName} {pregnancy.patient.firstName} {pregnancy.patient.middleName ?? ''} ·{' '}
            <span className="mono">{pregnancy.patient.code}</span> · беременность №{pregnancy.number}
            {rhNeg && <span className="badge red" style={{ marginLeft: 8 }}>Rh отрицательный</span>}
          </div>
        </div>
        <div className="spacer" />
        <button
          onClick={() => {
            localStorage.removeItem(draftKey)
            navigate(-1)
          }}
        >
          Отменить
        </button>
      </div>

      <div className="wizard-steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            onClick={() => setStep(i)}
            style={{ cursor: 'pointer' }}
          >
            <span className="n">{i < step ? '✓' : i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      <ErrorBox error={error} />

      {step === 0 && (
        <div className="card">
          <h3>Показания к инвазивной диагностике</h3>
          <div className="btn-row" style={{ marginBottom: 14 }}>
            <PhotoRecognizer
              expect="REFERRAL"
              buttonLabel="📷 Заполнить с направления"
              onApply={(v) => {
                setForm((f) => {
                  const next = { ...f }
                  if (v.riskT21?.trim()) next.riskValue = v.riskT21.trim()
                  // в справочнике показание ищем по коду — id понадобится для галочки в списке
                  const found = v.indication?.trim()
                    ? list('INDICATION').find((d) => d.code === v.indication.trim())
                    : undefined
                  if (found && !next.indicationIds.includes(found.id)) {
                    next.indicationIds = [...next.indicationIds, found.id]
                  }
                  return next
                })
              }}
            />
          </div>
          <div className="grid cols-2">
            <div>
              {list('INDICATION').map((d) => (
                <Check
                  key={d.id}
                  label={d.label}
                  checked={form.indicationIds.includes(d.id)}
                  onChange={(v) =>
                    set(
                      'indicationIds',
                      v ? [...form.indicationIds, d.id] : form.indicationIds.filter((x) => x !== d.id),
                    )
                  }
                />
              ))}
            </div>
            <div>
              <Text
                label="Расчётный риск, 1:"
                type="number"
                value={form.riskValue}
                onChange={(v) => set('riskValue', v)}
                hint="Риск по скринингу, на основании которого направили"
              />
              {pregnancy.screenings.length > 0 && (
                <div className="alert-box info">
                  <div>
                    <b>Из данных скрининга:</b>
                    <ul>
                      {pregnancy.screenings.map((s) => (
                        <li key={s.id}>
                          {s.trimester === 1 ? 'I' : 'II'} триместр, {fmtDate(s.date)}: ТВП {s.ntMm ?? '—'} мм, риск Т21{' '}
                          {s.riskT21 ? `1:${s.riskT21}` : '—'}
                          {s.niptResult ? `, НИПТ: ${s.niptResult}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <Area
                label="Комментарий к показаниям"
                value={form.indicationNotes}
                onChange={(v) => set('indicationNotes', v)}
              />
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3>Протокол процедуры</h3>
          <div className="grid cols-4">
            <Text label="Дата" type="date" value={form.performedAt} onChange={(v) => set('performedAt', v)} required />
            <div className="field">
              <label>Срок беременности</label>
              <input type="text" value={gest ? fmtGest(gest.weeks, gest.days) : 'не определён'} disabled />
              <div className="hint">Считается автоматически</div>
            </div>
            <DictSelect
              label="Вид процедуры"
              type="PROCEDURE_TYPE"
              value={form.procedureType}
              onChange={(v) => set('procedureType', v)}
              required
              hint={
                WINDOWS[form.procedureType]
                  ? `Рекомендуемый срок: ${WINDOWS[form.procedureType][0]}–${WINDOWS[form.procedureType][1]} нед`
                  : undefined
              }
            />
            <DictSelect label="Доступ" type="ACCESS" value={form.access} onChange={(v) => set('access', v)} />
          </div>

          <div className="grid cols-4">
            <Select
              label="Калибр иглы"
              value={form.needleGauge}
              onChange={(v) => set('needleGauge', v)}
              options={['18G', '19G', '20G', '21G', '22G', '23G'].map((v) => ({ value: v, label: v }))}
            />
            <Text label="Число пункций" type="number" value={form.punctureCount} onChange={(v) => set('punctureCount', v)} />
            <DictSelect
              label="Расположение плаценты"
              type="PLACENTA_LOCATION"
              value={form.placentaLocation}
              onChange={(v) => set('placentaLocation', v)}
            />
            <Text label="УЗ-аппарат" value={form.usDevice} onChange={(v) => set('usDevice', v)} />
          </div>

          <div className="grid cols-2">
            <Select
              label="Оператор"
              value={form.operatorId}
              onChange={(v) => set('operatorId', v)}
              options={users.filter((u) => u.isActive !== false).map((u) => ({ value: u.id, label: u.fullName }))}
            />
            <Select
              label="Ассистент"
              value={form.assistantId}
              onChange={(v) => set('assistantId', v)}
              options={users.filter((u) => u.isActive !== false).map((u) => ({ value: u.id, label: u.fullName }))}
            />
          </div>

          <fieldset style={rhNeg ? { borderColor: '#f3c4c0', background: 'var(--danger-soft)' } : undefined}>
            <legend>Резус-профилактика</legend>
            {rhNeg ? (
              <>
                <div className="alert-box error">
                  У пациентки резус-отрицательная кровь — показано введение анти-D иммуноглобулина.
                </div>
                <Check label="Анти-D иммуноглобулин введён" checked={form.antiDGiven} onChange={(v) => set('antiDGiven', v)} />
                {form.antiDGiven && (
                  <div className="grid cols-2">
                    <Text label="Дата введения" type="date" value={form.antiDDate} onChange={(v) => set('antiDDate', v)} />
                    <Text label="Доза" value={form.antiDDose} onChange={(v) => set('antiDDose', v)} placeholder="1250 МЕ" />
                  </div>
                )}
              </>
            ) : (
              <div className="muted">Резус положительный или не указан — профилактика не требуется.</div>
            )}
          </fieldset>

          <Check
            label="Антибиотикопрофилактика"
            checked={form.antibioticProphylaxis}
            onChange={(v) => set('antibioticProphylaxis', v)}
          />
          <Check
            label="Процедура ещё не выполнена — только запланирована"
            checked={form.planned}
            onChange={(v) => set('planned', v)}
            hint="Тогда дата будет считаться плановой, а образцы заведутся позже"
          />
          <Area
            label="Технические особенности, осложнения при процедуре"
            value={form.technicalNotes}
            onChange={(v) => set('technicalNotes', v)}
          />
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>Полученные образцы</h3>
          {pregnancy.plurality === 'MULTIPLE' && (
            <div className="alert-box info">
              Многоплодная беременность: образец заводится на каждый плод отдельно — у каждого будет свой результат.
            </div>
          )}
          {samples.map((s, i) => {
            const fetus = pregnancy.fetuses.find((f) => f.id === s.fetusId)
            return (
              <fieldset key={s.fetusId}>
                <legend>Плод {fetus?.label}</legend>
                <Check
                  label="Образец получен от этого плода"
                  checked={s.include}
                  onChange={(v) => setSample(i, { include: v })}
                />
                {s.include && (
                  <>
                    <div className="grid cols-4">
                      <DictSelect
                        label="Тип материала"
                        type="MATERIAL_TYPE"
                        value={s.materialType}
                        onChange={(v) => setSample(i, { materialType: v })}
                        required
                      />
                      <Text label="Объём" value={s.volume} onChange={(v) => setSample(i, { volume: v })} placeholder="20 мл" />
                      <Text
                        label="Номер контейнера"
                        value={s.containerNumber}
                        onChange={(v) => setSample(i, { containerNumber: v })}
                      />
                      <Select
                        label="Качество материала"
                        value={s.quality}
                        onChange={(v) => setSample(i, { quality: v })}
                        options={[
                          { value: 'GOOD', label: 'без особенностей' },
                          { value: 'BLOOD_STAINED', label: 'с примесью крови' },
                          { value: 'INSUFFICIENT', label: 'недостаточный объём' },
                        ]}
                      />
                    </div>
                    <div className="field">
                      <label>Назначенные методы исследования</label>
                      <div className="grid cols-3">
                        {list('METHOD').map((m) => (
                          <Check
                            key={m.id}
                            label={m.label}
                            checked={s.methodIds.includes(m.id)}
                            onChange={(v) =>
                              setSample(i, {
                                methodIds: v ? [...s.methodIds, m.id] : s.methodIds.filter((x) => x !== m.id),
                              })
                            }
                            hint={m.numValue ? `норматив ${m.numValue} дн` : undefined}
                          />
                        ))}
                      </div>
                      <div className="hint">Срок готовности рассчитывается по самому длительному методу.</div>
                    </div>
                  </>
                )}
              </fieldset>
            )
          })}
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>Проверьте перед сохранением</h3>
          {warnings.length > 0 && (
            <div className="alert-box warn">
              <div>
                <b>Обратите внимание:</b>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 6 }}>Это предупреждения, а не запрет — сохранить можно.</div>
              </div>
            </div>
          )}
          <div className="grid cols-2">
            <KV
              items={[
                ['Пациентка', `${pregnancy.patient.lastName} ${pregnancy.patient.firstName}`],
                ['Показания', form.indicationIds.map((id) => list('INDICATION').find((d) => d.id === id)?.label).join('; ') || '—'],
                ['Расчётный риск', form.riskValue ? `1:${form.riskValue}` : '—'],
                ['Вид процедуры', label('PROCEDURE_TYPE', form.procedureType)],
                ['Дата', fmtDate(form.performedAt) + (form.planned ? ' (план)' : '')],
                ['Срок', gest ? fmtGest(gest.weeks, gest.days) : '—'],
              ]}
            />
            <KV
              items={[
                ['Доступ', label('ACCESS', form.access)],
                ['Игла / пункций', `${form.needleGauge} / ${form.punctureCount}`],
                ['Оператор', users.find((u) => u.id === form.operatorId)?.fullName ?? '—'],
                ['Анти-D', rhNeg ? (form.antiDGiven ? `введён ${fmtDate(form.antiDDate)}` : 'НЕ введён') : 'не требуется'],
                [
                  'Образцы',
                  samples
                    .filter((s) => s.include)
                    .map((s) => {
                      const f = pregnancy.fetuses.find((x) => x.id === s.fetusId)
                      return `плод ${f?.label}: ${label('MATERIAL_TYPE', s.materialType)}, ${s.methodIds
                        .map((m) => list('METHOD').find((d) => d.id === m)?.code)
                        .join(', ')}`
                    })
                    .join(' | ') || '—',
                ],
              ]}
            />
          </div>
          <Area label="Примечания к процедуре" value={form.notes} onChange={(v) => set('notes', v)} />
        </div>
      )}

      <div className="btn-row">
        {step > 0 && <button onClick={() => setStep(step - 1)}>← Назад</button>}
        {step < 3 && (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Далее →
          </button>
        )}
        {step === 3 && (
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить процедуру'}
          </button>
        )}
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
          Черновик сохраняется автоматически
        </span>
      </div>
    </div>
  )
}

function day(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}
