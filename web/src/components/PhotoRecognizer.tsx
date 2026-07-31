import { useEffect, useRef, useState } from 'react'
import { ErrorBox, Modal } from './ui'

export type RecognitionDocType = 'LAB_REPORT' | 'REFERRAL' | 'ULTRASOUND' | 'NIPT'

interface RecognizedField {
  key: string
  label: string
  value: string
  confidence: number
  source?: string
}

interface RecognitionResult {
  docType: RecognitionDocType | 'UNKNOWN'
  docTypeLabel: string
  confidence: number
  durationMs: number
  rawText: string
  attachmentIds: string[]
  fields: RecognizedField[]
}

interface Shot {
  id: number
  file: File
  url: string
}

/** Ниже этого порога значение считаем ненадёжным: галочка снята, рядом пометка «проверьте». */
const MIN_CONF = 60
const MAX_FILES = 5
const MAX_SIZE = 15 * 1024 * 1024

const EXPECTED_LABELS: Record<RecognitionDocType, string> = {
  LAB_REPORT: 'заключение лаборатории',
  REFERRAL: 'направление',
  ULTRASOUND: 'протокол УЗИ / скрининга',
  NIPT: 'результат НИПТ',
}

const STEPS = ['Снимок', 'Распознавание', 'Проверка']

export interface PhotoRecognizerProps {
  expect?: RecognitionDocType
  onApply: (values: Record<string, string>, attachmentIds: string[]) => void
  buttonLabel?: string
  className?: string
}

export default function PhotoRecognizer({
  expect,
  onApply,
  buttonLabel = '📷 Заполнить с фото',
  className,
}: PhotoRecognizerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
      {/* Окно монтируется заново при каждом открытии — так состояние мастера всегда чистое */}
      {open && <RecognizerModal expect={expect} onApply={onApply} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Переносит распознанные значения в состояние формы.
 * Пустое значение не затирает уже заполненное поле.
 */
export function applyRecognized<T extends Record<string, unknown>>(
  state: T,
  values: Record<string, string>,
  keys: readonly (keyof T & string)[],
): T {
  const next = { ...state }
  for (const k of keys) {
    const v = values[k]?.trim()
    if (v) next[k] = v as T[typeof k]
  }
  return next
}

function RecognizerModal({
  expect,
  onApply,
  onClose,
}: {
  expect?: RecognitionDocType
  onApply: (values: Record<string, string>, attachmentIds: string[]) => void
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState<string | null>(null)

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // Ссылки на превью живут дольше рендера — освобождаем их при закрытии окна
  const urlsRef = useRef<string[]>([])
  useEffect(
    () => () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u)
      urlsRef.current = []
    },
    [],
  )

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    const incoming = Array.from(fileList)
    const free = MAX_FILES - shots.length
    if (free <= 0) {
      setError(`Больше ${MAX_FILES} снимков за раз загрузить нельзя`)
      return
    }
    const tooBig = incoming.find((f) => f.size > MAX_SIZE)
    if (tooBig) {
      setError(`Файл «${tooBig.name}» больше 15 МБ — сфотографируйте с меньшим разрешением`)
      return
    }
    setError(null)
    const added = incoming.slice(0, free).map((file) => {
      const url = URL.createObjectURL(file)
      urlsRef.current.push(url)
      return { id: Date.now() + Math.random(), file, url }
    })
    setShots((s) => [...s, ...added])
    if (incoming.length > free) setError(`Взяли только первые ${free} снимк(а/ов): максимум ${MAX_FILES}`)
  }

  function removeShot(id: number) {
    setShots((s) => {
      const gone = s.find((x) => x.id === id)
      if (gone) {
        URL.revokeObjectURL(gone.url)
        urlsRef.current = urlsRef.current.filter((u) => u !== gone.url)
      }
      return s.filter((x) => x.id !== id)
    })
  }

  async function recognize() {
    if (!shots.length) return
    setBusy(true)
    setError(null)
    const fd = new FormData()
    for (const s of shots) fd.append('files', s.file)
    if (expect) fd.append('hint', expect)
    try {
      // api.ts умеет только JSON, поэтому multipart отправляем напрямую
      const res = await fetch('/api/recognition', { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) {
        let msg = `Ошибка ${res.status}`
        try {
          const data = await res.json()
          if (data?.error) msg = data.error
        } catch {
          /* ответ без тела */
        }
        throw new Error(msg)
      }
      const data = (await res.json()) as RecognitionResult
      setResult(data)
      setValues(Object.fromEntries(data.fields.map((f) => [f.key, f.value])))
      setPicked(Object.fromEntries(data.fields.map((f) => [f.key, f.confidence >= MIN_CONF])))
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось распознать снимок')
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!result) return
    const out: Record<string, string> = {}
    for (const f of result.fields) {
      const v = values[f.key]?.trim()
      if (picked[f.key] && v) out[f.key] = v
    }
    onApply(out, result.attachmentIds)
    onClose()
  }

  const pickedCount = result ? result.fields.filter((f) => picked[f.key]).length : 0
  const lowOverall = !!result && result.confidence < MIN_CONF
  const mismatch = !!result && !!expect && result.docType !== expect

  return (
    <Modal
      title="Заполнение с фотографии"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          {step === 0 && (
            <button type="button" className="primary" disabled={!shots.length} onClick={() => setStep(1)}>
              Далее →
            </button>
          )}
          {step === 1 && (
            <button type="button" className="primary" disabled={busy} onClick={recognize}>
              {busy ? 'Распознаём…' : 'Распознать'}
            </button>
          )}
          {step === 2 && (
            <button type="button" className="primary" disabled={!pickedCount} onClick={apply}>
              Применить{pickedCount ? ` (${pickedCount})` : ''}
            </button>
          )}
        </>
      }
    >
      <div className="wizard-steps rec-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
            <span className="n">{i < step ? '✓' : i + 1}</span>
            {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="alert-box info">
            <div>
              Снимайте при хорошем свете, лист целиком, без бликов и наклона — от этого напрямую зависит качество
              распознавания. Можно сделать до {MAX_FILES} снимков (например, обе стороны бланка).
            </div>
          </div>

          <ErrorBox error={error} />

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <div className="btn-row rec-pick">
            <button type="button" className="primary" onClick={() => cameraRef.current?.click()}>
              📷 Сфотографировать
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()}>
              🖼 Выбрать из галереи
            </button>
          </div>

          {shots.length > 0 ? (
            <div className="rec-shots">
              {shots.map((s) => (
                <div key={s.id} className="rec-shot">
                  <img src={s.url} alt="" onClick={() => setZoom(s.url)} />
                  <button type="button" className="rec-shot-del" onClick={() => removeShot(s.id)} title="Удалить снимок">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>
              Пока не выбрано ни одного снимка.
            </div>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div className="rec-shots">
            {shots.map((s) => (
              <div key={s.id} className="rec-shot">
                <img src={s.url} alt="" onClick={() => setZoom(s.url)} />
              </div>
            ))}
          </div>

          {busy && (
            <div className="spinner">
              <div className="rec-progress">
                <span />
              </div>
              Распознаём… это занимает несколько секунд
            </div>
          )}

          {!busy && error && (
            <>
              <ErrorBox error={error} />
              <div className="btn-row">
                <button type="button" onClick={recognize}>
                  Попробовать ещё раз
                </button>
                <button type="button" onClick={() => setStep(0)}>
                  ← Переснять
                </button>
              </div>
            </>
          )}

          {!busy && !error && (
            <div className="muted" style={{ fontSize: 13 }}>
              Снимков: {shots.length}. Текст разбирается на сервере клиники — наружу ничего не уходит.
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button type="button" onClick={() => setStep(0)}>
                  ← Переснять
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 2 && result && (
        <>
          <div className="rec-summary">
            <b>{result.docTypeLabel}</b>
            <span className={`badge ${result.confidence >= 80 ? 'green' : lowOverall ? 'red' : 'amber'}`}>
              уверенность {result.confidence}%
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {(result.durationMs / 1000).toFixed(1)} с
            </span>
          </div>

          {lowOverall && (
            <div className="alert-box warn">
              <div>
                Распознано плохо — часть значений почти наверняка неверна. Лучше переснять лист при хорошем свете или
                ввести данные руками.
              </div>
            </div>
          )}

          {mismatch && (
            <div className="alert-box warn">
              <div>
                Похоже, это {result.docTypeLabel.toLowerCase()}, а ожидалось {EXPECTED_LABELS[expect!]}. Проверьте, тот
                ли снимок.
              </div>
            </div>
          )}

          <div className="rec-review">
            <div className="rec-fields">
              {result.fields.length === 0 && <div className="muted">Ни одного поля распознать не удалось.</div>}
              {result.fields.map((f) => {
                const low = f.confidence < MIN_CONF
                const long = (values[f.key] ?? '').length > 60
                return (
                  <div key={f.key} className={`rec-field ${low ? 'low' : ''}`}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!picked[f.key]}
                        onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.checked }))}
                      />
                      <span>
                        {f.label}{' '}
                        {low ? (
                          <span className="badge amber">проверьте</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 11.5 }}>
                            {f.confidence}%
                          </span>
                        )}
                      </span>
                    </label>
                    {long ? (
                      <textarea
                        rows={3}
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        type="text"
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    )}
                    {f.source && <div className="rec-source mono">{f.source}</div>}
                  </div>
                )
              })}
            </div>

            {shots.length > 0 && (
              <div className="rec-aside">
                <div className="rec-aside-title muted">Снимок</div>
                {shots.map((s) => (
                  <img key={s.id} src={s.url} alt="" className="rec-thumb" onClick={() => setZoom(s.url)} />
                ))}
                <div className="hint">Нажмите, чтобы открыть на весь экран</div>
              </div>
            )}
          </div>

          <details className="rec-raw">
            <summary>Показать распознанный текст</summary>
            <pre className="mono">{result.rawText}</pre>
          </details>
        </>
      )}

      {zoom && (
        <div className="rec-lightbox" onClick={() => setZoom(null)}>
          <button type="button" className="rec-lightbox-close" onClick={() => setZoom(null)}>
            ✕
          </button>
          <img src={zoom} alt="" />
        </div>
      )}
    </Modal>
  )
}
