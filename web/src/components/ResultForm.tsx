import { useState } from 'react'
import { api } from '../api'
import { useApp } from '../store'
import { Area, DictSelect, ErrorBox, Modal, Select, Text } from './ui'
import PhotoRecognizer, { applyRecognized } from './PhotoRecognizer'
import { int, toInputDate } from '../lib/format'
import { SEX_LABELS } from '../lib/labels'
import type { Sample } from '../types'

const OCR_KEYS = ['method', 'reportedAt', 'metaphases', 'bandingLevel', 'category', 'karyotype', 'sex', 'conclusion'] as const

/**
 * Форма результата. Набор полей зависит от метода:
 * у кариотипирования спрашиваем число метафаз и уровень разрешения,
 * у QF-PCR и ХМА — нет.
 */
export default function ResultForm({
  sample,
  onClose,
  onSaved,
}: {
  sample: Sample
  onClose: () => void
  onSaved: () => void
}) {
  const { list, users } = useApp()
  const existing = sample.results[0]
  const [f, setF] = useState({
    method: existing?.method ?? sample.methods[0]?.dictionary.code ?? '',
    reportedAt: toInputDate(existing?.reportedAt ?? new Date()),
    metaphases: existing?.metaphases?.toString() ?? '',
    bandingLevel: existing?.bandingLevel ?? '',
    quality: existing?.quality ?? '',
    category: existing?.category ?? '',
    karyotype: existing?.karyotype ?? '',
    sex: existing?.sex ?? '',
    conclusion: existing?.conclusion ?? '',
    verifiedById: existing?.verifiedBy?.id ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((s) => ({ ...s, [k]: v }))
  }

  const isKaryotype = ['KARYOTYPE', 'FISH'].includes(f.method)
  const category = list('RESULT_CATEGORY').find((c) => c.code === f.category)
  const isPathological = category?.flag ?? false

  // Подсказка формата ISCN — частая причина разнобоя в записях
  const karyotypeLooksValid = !f.karyotype || /^\d{2},[XY]{1,3}/.test(f.karyotype.trim())

  async function save() {
    setBusy(true)
    setError(null)
    const payload = {
      sampleId: sample.id,
      method: f.method,
      reportedAt: f.reportedAt || null,
      metaphases: int(f.metaphases),
      bandingLevel: f.bandingLevel || null,
      quality: f.quality || null,
      category: f.category || null,
      karyotype: f.karyotype || null,
      sex: f.sex || null,
      conclusion: f.conclusion || null,
      verifiedById: f.verifiedById || null,
    }
    try {
      if (existing) await api.patch(`/lab/results/${existing.id}`, payload)
      else await api.post('/lab/results', payload)
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
      title={`Результат по образцу ${sample.code}${sample.fetus ? ` (плод ${sample.fetus.label})` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" onClick={save} disabled={busy || !f.method}>
            Сохранить результат
          </button>
        </>
      }
    >
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <PhotoRecognizer
          expect="LAB_REPORT"
          buttonLabel="📷 Заполнить с фото заключения"
          onApply={(v) => setF((s) => applyRecognized(s, v, OCR_KEYS))}
        />
      </div>

      <ErrorBox error={error} />

      <div className="grid cols-2">
        <Select
          label="Метод"
          value={f.method}
          onChange={(v) => set('method', v)}
          required
          empty={null}
          options={
            sample.methods.length
              ? sample.methods.map((m) => ({ value: m.dictionary.code, label: m.dictionary.label }))
              : list('METHOD').map((m) => ({ value: m.code, label: m.label }))
          }
        />
        <Text label="Дата готовности" type="date" value={f.reportedAt} onChange={(v) => set('reportedAt', v)} />
      </div>

      {isKaryotype && (
        <div className="grid cols-3">
          <Text label="Проанализировано метафаз" type="number" value={f.metaphases} onChange={(v) => set('metaphases', v)} />
          <Text label="Уровень разрешения" value={f.bandingLevel} onChange={(v) => set('bandingLevel', v)} placeholder="550 GTG" />
          <Select
            label="Качество препарата"
            value={f.quality}
            onChange={(v) => set('quality', v)}
            options={[
              { value: 'GOOD', label: 'хорошее' },
              { value: 'SATISFACTORY', label: 'удовлетворительное' },
              { value: 'POOR', label: 'плохое' },
            ]}
          />
        </div>
      )}

      <DictSelect
        label="Категория результата"
        type="RESULT_CATEGORY"
        value={f.category}
        onChange={(v) => set('category', v)}
        required
        hint="Именно это поле считается в отчётах — свободный текст в статистику не попадает"
      />

      {isPathological && (
        <div className="alert-box error">
          Патологический результат. После сохранения система создаст задачу «сообщить врачу и пациентке» и покажет
          запись на дашборде.
        </div>
      )}

      <div className="grid cols-2">
        <Text
          label="Кариотип по ISCN"
          value={f.karyotype}
          onChange={(v) => set('karyotype', v)}
          placeholder="47,XY,+21"
          hint={karyotypeLooksValid ? 'Например: 46,XX · 47,XY,+21 · 45,X · 46,XX,t(2;7)(q31;p15)' : '⚠ Формат не похож на ISCN — проверьте запись'}
        />
        <Select
          label="Пол плода"
          value={f.sex}
          onChange={(v) => set('sex', v)}
          options={Object.entries(SEX_LABELS).map(([value, label]) => ({ value, label }))}
          hint="Проставится в карточку плода"
        />
      </div>

      <Area label="Заключение" value={f.conclusion} onChange={(v) => set('conclusion', v)} rows={3} />

      <Select
        label="Проверил (двойной контроль)"
        value={f.verifiedById}
        onChange={(v) => set('verifiedById', v)}
        options={users.map((u) => ({ value: u.id, label: u.fullName }))}
        hint={isPathological ? 'Для патологических результатов двойной контроль обязателен' : undefined}
      />
    </Modal>
  )
}
