import { useState } from 'react'
import { api } from '../api'
import { Area, Check, DictSelect, ErrorBox, Modal, Select, Text } from './ui'
import { int, toInputDate } from '../lib/format'
import { POSTNATAL_LABELS } from '../lib/labels'
import type { Fetus } from '../types'

/** Исход заполняется по каждому плоду отдельно — при двойне их два. */
export default function OutcomeForm({
  fetus,
  onClose,
  onSaved,
}: {
  fetus: Fetus
  onClose: () => void
  onSaved: () => void
}) {
  const o = fetus.outcome
  const [f, setF] = useState({
    outcomeType: o?.outcomeType ?? '',
    date: toInputDate(o?.date),
    gestWeeks: o?.gestWeeks?.toString() ?? '',
    gestDays: o?.gestDays?.toString() ?? '',
    birthWeight: o?.birthWeight?.toString() ?? '',
    apgar1: o?.apgar1?.toString() ?? '',
    apgar5: o?.apgar5?.toString() ?? '',
    childCondition: o?.childCondition ?? '',
    postnatalConfirmation: o?.postnatalConfirmation ?? '',
    postnatalDiagnosis: o?.postnatalDiagnosis ?? '',
    procedureRelatedLoss: !!o?.procedureRelatedLoss,
    notes: o?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }))
  }

  const isBirth = ['TERM_BIRTH', 'PRETERM_BIRTH'].includes(f.outcomeType)
  const isLoss = ['MISCARRIAGE', 'ANTENATAL_DEATH', 'TOP'].includes(f.outcomeType)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.put(`/outcomes/fetus/${fetus.id}`, {
        outcomeType: f.outcomeType || null,
        date: f.date || null,
        gestWeeks: int(f.gestWeeks),
        gestDays: int(f.gestDays),
        birthWeight: int(f.birthWeight),
        apgar1: int(f.apgar1),
        apgar5: int(f.apgar5),
        childCondition: f.childCondition || null,
        postnatalConfirmation: f.postnatalConfirmation || null,
        postnatalDiagnosis: f.postnatalDiagnosis || null,
        procedureRelatedLoss: f.procedureRelatedLoss,
        notes: f.notes || null,
      })
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
      title={`Исход беременности — плод ${fetus.label}`}
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

      <div className="grid cols-3">
        <DictSelect label="Исход" type="OUTCOME" value={f.outcomeType} onChange={(v) => set('outcomeType', v)} required />
        <Text label="Дата" type="date" value={f.date} onChange={(v) => set('date', v)} />
        <div className="grid cols-2">
          <Text label="Срок, нед" type="number" value={f.gestWeeks} onChange={(v) => set('gestWeeks', v)} />
          <Text label="дней" type="number" value={f.gestDays} onChange={(v) => set('gestDays', v)} />
        </div>
      </div>

      {isBirth && (
        <fieldset>
          <legend>Ребёнок</legend>
          <div className="grid cols-3">
            <Text label="Масса, г" type="number" value={f.birthWeight} onChange={(v) => set('birthWeight', v)} />
            <Text label="Апгар 1 мин" type="number" value={f.apgar1} onChange={(v) => set('apgar1', v)} />
            <Text label="Апгар 5 мин" type="number" value={f.apgar5} onChange={(v) => set('apgar5', v)} />
          </div>
          <Area label="Состояние ребёнка" value={f.childCondition} onChange={(v) => set('childCondition', v)} />
        </fieldset>
      )}

      <fieldset>
        <legend>Сверка диагноза</legend>
        <div className="hint" style={{ marginBottom: 8 }}>
          Совпадение пренатального и постнатального диагноза — главный показатель качества диагностики.
        </div>
        <div className="grid cols-2">
          <Select
            label="Постнатальное подтверждение"
            value={f.postnatalConfirmation}
            onChange={(v) => set('postnatalConfirmation', v)}
            options={Object.entries(POSTNATAL_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Text label="Постнатальный диагноз" value={f.postnatalDiagnosis} onChange={(v) => set('postnatalDiagnosis', v)} />
        </div>
      </fieldset>

      {isLoss && (
        <Check
          label="Потеря беременности связана с процедурой (в течение 14 дней)"
          checked={f.procedureRelatedLoss}
          onChange={(v) => set('procedureRelatedLoss', v)}
          hint="Влияет на показатель безопасности в отчётах"
        />
      )}

      <Area label="Примечания" value={f.notes} onChange={(v) => set('notes', v)} />
    </Modal>
  )
}
