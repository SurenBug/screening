import { useState } from 'react'
import { api } from '../api'
import { Area, Check, ErrorBox, Modal, Select, Text } from './ui'
import PhotoRecognizer, { applyRecognized } from './PhotoRecognizer'
import { int, num, toInputDate } from '../lib/format'
import { NASAL_BONE_LABELS } from '../lib/labels'
import type { Screening } from '../types'

const US_KEYS = [
  'date',
  'gestWeeks',
  'gestDays',
  'crl',
  'ntMm',
  'nasalBone',
  'pappaMom',
  'hcgMom',
  'riskT21',
  'riskT18',
  'riskT13',
  'riskProgram',
  'usFindings',
  'malformations',
] as const

const NIPT_KEYS = ['niptDate', 'niptLab', 'niptResult', 'riskT21', 'riskT18', 'riskT13'] as const

/** Данные скрининга — то, на основании чего женщину направили на инвазивную диагностику. */
export default function ScreeningForm({
  pregnancyId,
  screening,
  onClose,
  onSaved,
}: {
  pregnancyId: string
  screening?: Screening | null
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState({
    trimester: screening?.trimester?.toString() ?? '1',
    date: toInputDate(screening?.date),
    gestWeeks: screening?.gestWeeks?.toString() ?? '',
    gestDays: screening?.gestDays?.toString() ?? '',
    crl: screening?.crl?.toString() ?? '',
    ntMm: screening?.ntMm?.toString() ?? '',
    nasalBone: screening?.nasalBone ?? '',
    ductusVenosus: screening?.ductusVenosus ?? '',
    tricuspidRegurg: screening?.tricuspidRegurg ?? '',
    pappaMom: screening?.pappaMom?.toString() ?? '',
    hcgMom: screening?.hcgMom?.toString() ?? '',
    afpMom: screening?.afpMom?.toString() ?? '',
    riskT21: screening?.riskT21?.toString() ?? '',
    riskT18: screening?.riskT18?.toString() ?? '',
    riskT13: screening?.riskT13?.toString() ?? '',
    riskProgram: screening?.riskProgram ?? '',
    niptDone: !!screening?.niptDone,
    niptDate: toInputDate(screening?.niptDate),
    niptLab: screening?.niptLab ?? '',
    niptResult: screening?.niptResult ?? '',
    usFindings: screening?.usFindings ?? '',
    malformations: screening?.malformations ?? '',
    notes: screening?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }))
  }

  async function save() {
    setBusy(true)
    setError(null)
    const payload = {
      pregnancyId,
      trimester: int(f.trimester),
      date: f.date || null,
      gestWeeks: int(f.gestWeeks),
      gestDays: int(f.gestDays),
      crl: num(f.crl),
      ntMm: num(f.ntMm),
      nasalBone: f.nasalBone || null,
      ductusVenosus: f.ductusVenosus || null,
      tricuspidRegurg: f.tricuspidRegurg || null,
      pappaMom: num(f.pappaMom),
      hcgMom: num(f.hcgMom),
      afpMom: num(f.afpMom),
      riskT21: int(f.riskT21),
      riskT18: int(f.riskT18),
      riskT13: int(f.riskT13),
      riskProgram: f.riskProgram || null,
      niptDone: f.niptDone,
      niptDate: f.niptDate || null,
      niptLab: f.niptLab || null,
      niptResult: f.niptResult || null,
      usFindings: f.usFindings || null,
      malformations: f.malformations || null,
      notes: f.notes || null,
    }
    try {
      if (screening) await api.patch(`/pregnancies/screening/${screening.id}`, payload)
      else await api.post('/pregnancies/screening', payload)
      onSaved()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const ntHigh = num(f.ntMm) != null && num(f.ntMm)! >= 3
  const riskHigh = int(f.riskT21) != null && int(f.riskT21)! <= 250

  return (
    <Modal
      title={screening ? 'Данные скрининга' : 'Добавить данные скрининга'}
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
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <PhotoRecognizer
          expect="ULTRASOUND"
          buttonLabel="📷 Заполнить с протокола УЗИ"
          onApply={(v) => setF((s) => applyRecognized(s, v, US_KEYS))}
        />
        <PhotoRecognizer
          expect="NIPT"
          buttonLabel="📷 Заполнить с результата НИПТ"
          // раз есть результат НИПТ — отмечаем, что он проводился, иначе поля останутся скрытыми
          onApply={(v) =>
            setF((s) => {
              const next = applyRecognized(s, v, NIPT_KEYS)
              return { ...next, niptDone: next.niptDone || !!(next.niptResult || next.niptDate || next.niptLab) }
            })
          }
        />
      </div>

      <ErrorBox error={error} />

      <div className="grid cols-4">
        <Select
          label="Триместр"
          value={f.trimester}
          onChange={(v) => set('trimester', v)}
          empty={null}
          options={[
            { value: '1', label: 'I триместр' },
            { value: '2', label: 'II триместр' },
          ]}
        />
        <Text label="Дата" type="date" value={f.date} onChange={(v) => set('date', v)} />
        <Text label="Срок, недель" type="number" value={f.gestWeeks} onChange={(v) => set('gestWeeks', v)} />
        <Text label="…дней" type="number" value={f.gestDays} onChange={(v) => set('gestDays', v)} />
      </div>

      <fieldset>
        <legend>Ультразвуковые показатели</legend>
        <div className="grid cols-3">
          <Text label="КТР, мм" value={f.crl} onChange={(v) => set('crl', v)} />
          <Text
            label="ТВП, мм"
            value={f.ntMm}
            onChange={(v) => set('ntMm', v)}
            hint={ntHigh ? '⚠ 3,0 мм и более — самостоятельное показание' : undefined}
          />
          <Select
            label="Носовая кость"
            value={f.nasalBone}
            onChange={(v) => set('nasalBone', v)}
            options={Object.entries(NASAL_BONE_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="grid cols-2">
          <Select
            label="Венозный проток"
            value={f.ductusVenosus}
            onChange={(v) => set('ductusVenosus', v)}
            options={[
              { value: 'NORMAL', label: 'кровоток не изменён' },
              { value: 'REVERSED_A_WAVE', label: 'реверсный кровоток в фазу А' },
            ]}
          />
          <Select
            label="Трикуспидальная регургитация"
            value={f.tricuspidRegurg}
            onChange={(v) => set('tricuspidRegurg', v)}
            options={[
              { value: 'NORMAL', label: 'нет' },
              { value: 'PRESENT', label: 'есть' },
            ]}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>Биохимия и расчётный риск</legend>
        <div className="grid cols-3">
          <Text label="PAPP-A, МоМ" value={f.pappaMom} onChange={(v) => set('pappaMom', v)} />
          <Text label="β-ХГЧ, МоМ" value={f.hcgMom} onChange={(v) => set('hcgMom', v)} />
          <Text label="АФП, МоМ" value={f.afpMom} onChange={(v) => set('afpMom', v)} />
        </div>
        <div className="grid cols-4">
          <Text
            label="Риск Т21, 1:"
            type="number"
            value={f.riskT21}
            onChange={(v) => set('riskT21', v)}
            hint={riskHigh ? '⚠ высокий риск' : undefined}
          />
          <Text label="Риск Т18, 1:" type="number" value={f.riskT18} onChange={(v) => set('riskT18', v)} />
          <Text label="Риск Т13, 1:" type="number" value={f.riskT13} onChange={(v) => set('riskT13', v)} />
          <Select
            label="Программа расчёта"
            value={f.riskProgram}
            onChange={(v) => set('riskProgram', v)}
            options={['PRISCA', 'ASTRAIA', 'FMF', 'LifeCycle'].map((v) => ({ value: v, label: v }))}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>НИПТ</legend>
        <Check label="НИПТ проводился" checked={f.niptDone} onChange={(v) => set('niptDone', v)} />
        {f.niptDone && (
          <div className="grid cols-3">
            <Text label="Дата" type="date" value={f.niptDate} onChange={(v) => set('niptDate', v)} />
            <Text label="Лаборатория" value={f.niptLab} onChange={(v) => set('niptLab', v)} />
            <Text label="Результат" value={f.niptResult} onChange={(v) => set('niptResult', v)} />
          </div>
        )}
      </fieldset>

      <Area label="УЗ-маркеры хромосомной патологии" value={f.usFindings} onChange={(v) => set('usFindings', v)} />
      <Area label="Выявленные пороки развития" value={f.malformations} onChange={(v) => set('malformations', v)} />
      <Area label="Примечания" value={f.notes} onChange={(v) => set('notes', v)} />
    </Modal>
  )
}
