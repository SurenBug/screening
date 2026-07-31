import { useState } from 'react'
import { api } from '../api'
import { Check, ErrorBox, Modal, Select, Text } from './ui'
import { int, toInputDate } from '../lib/format'
import { AMNIONICITY_LABELS, CHORIONICITY_LABELS, CONCEPTION_LABELS } from '../lib/labels'
import type { Pregnancy } from '../types'

export default function PregnancyForm({
  patientId,
  pregnancy,
  onClose,
  onSaved,
}: {
  patientId: string
  pregnancy?: Pregnancy | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    lmpDate: toInputDate(pregnancy?.lmpDate),
    usDate: toInputDate(pregnancy?.usDate),
    usGestWeeks: pregnancy?.usGestWeeks?.toString() ?? '',
    usGestDays: pregnancy?.usGestDays?.toString() ?? '',
    multiple: pregnancy?.plurality === 'MULTIPLE',
    fetusCount: pregnancy?.fetusCount?.toString() ?? '2',
    chorionicity: pregnancy?.chorionicity ?? '',
    amnionicity: pregnancy?.amnionicity ?? '',
    conception: pregnancy?.conception ?? '',
    notes: pregnancy?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    setBusy(true)
    setError(null)
    const payload = {
      patientId,
      lmpDate: form.lmpDate || null,
      usDate: form.usDate || null,
      usGestWeeks: int(form.usGestWeeks),
      usGestDays: int(form.usGestDays),
      plurality: form.multiple ? 'MULTIPLE' : 'SINGLE',
      fetusCount: form.multiple ? Math.max(int(form.fetusCount) ?? 2, 2) : 1,
      chorionicity: form.multiple ? form.chorionicity || null : null,
      amnionicity: form.multiple ? form.amnionicity || null : null,
      conception: form.conception || null,
      notes: form.notes || null,
    }
    try {
      if (pregnancy) await api.patch(`/pregnancies/${pregnancy.id}`, payload)
      else await api.post('/pregnancies', payload)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={pregnancy ? `Беременность №${pregnancy.number}` : 'Новая беременность'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" onClick={save} disabled={busy}>
            Сохранить
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="alert-box info">
        Срок беременности во всех формах считается автоматически. Приоритет — датировка по УЗИ, она точнее.
      </div>

      <div className="grid cols-2">
        <Text label="Первый день последней менструации" type="date" value={form.lmpDate} onChange={(v) => set('lmpDate', v)} />
        <Text label="Дата УЗИ для датировки" type="date" value={form.usDate} onChange={(v) => set('usDate', v)} />
      </div>
      <div className="grid cols-2">
        <Text label="Срок по этому УЗИ, недель" type="number" value={form.usGestWeeks} onChange={(v) => set('usGestWeeks', v)} />
        <Text label="…и дней" type="number" value={form.usGestDays} onChange={(v) => set('usGestDays', v)} />
      </div>

      <Select
        label="Наступление беременности"
        value={form.conception}
        onChange={(v) => set('conception', v)}
        options={Object.entries(CONCEPTION_LABELS).map(([value, label]) => ({ value, label }))}
      />

      <fieldset>
        <legend>Плодность</legend>
        <Check
          label="Многоплодная беременность"
          checked={form.multiple}
          onChange={(v) => set('multiple', v)}
          hint="Каждый плод ведётся отдельно: свой образец, свой результат, свой исход"
        />
        {form.multiple && (
          <div className="grid cols-3">
            <Text label="Число плодов" type="number" value={form.fetusCount} onChange={(v) => set('fetusCount', v)} />
            <Select
              label="Хориальность"
              value={form.chorionicity}
              onChange={(v) => set('chorionicity', v)}
              options={Object.entries(CHORIONICITY_LABELS).map(([value, label]) => ({ value, label }))}
            />
            <Select
              label="Амниальность"
              value={form.amnionicity}
              onChange={(v) => set('amnionicity', v)}
              options={Object.entries(AMNIONICITY_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
        )}
        {pregnancy && form.multiple && (
          <div className="hint">Уменьшить число плодов нельзя — к плоду могут быть привязаны образцы и результаты.</div>
        )}
      </fieldset>

      <Text label="Примечания" value={form.notes} onChange={(v) => set('notes', v)} />
    </Modal>
  )
}
