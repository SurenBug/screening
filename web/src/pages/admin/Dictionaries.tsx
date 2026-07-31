import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useApp } from '../../store'
import { Check, Empty, ErrorBox, Loader, Modal, Text } from '../../components/ui'
import { int } from '../../lib/format'
import type { DictItem, Dictionaries } from '../../types'

/** Типы, у которых есть дополнительное поле: у METHOD — срок в днях, у RESULT_CATEGORY — признак патологии. */
const NUM_TYPE = 'METHOD'
const FLAG_TYPE = 'RESULT_CATEGORY'

interface DraftForm {
  label: string
  code: string
  sortOrder: string
  numValue: string
  flag: boolean
}

export default function DictionariesPage() {
  const { can, reloadDict } = useApp()
  const [data, setData] = useState<Dictionaries | null>(null)
  const [type, setType] = useState<string>('')
  const [showHidden, setShowHidden] = useState(false)
  const [editing, setEditing] = useState<DictItem | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await api.get<Dictionaries>(`/dictionaries${showHidden ? '?all=1' : ''}`)
    setData(res)
    setType((cur) => cur || Object.keys(res.types)[0] || '')
  }, [showHidden])

  useEffect(() => {
    if (!can('ADMIN')) return
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [load, can])

  if (!can('ADMIN')) {
    return (
      <div className="page">
        <div className="alert-box warn">Раздел доступен только администратору</div>
      </div>
    )
  }

  async function refresh() {
    await load()
    // Справочники в сторе кэшируются — без перезагрузки выпадающие списки останутся старыми
    await reloadDict()
  }

  async function archive(item: DictItem) {
    setError(null)
    try {
      await api.del(`/dictionaries/${item.id}`)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function restore(item: DictItem) {
    setError(null)
    try {
      await api.patch(`/dictionaries/${item.id}`, { isActive: true })
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const items = data?.items[type] ?? []
  const hasNum = type === NUM_TYPE
  const hasFlag = type === FLAG_TYPE

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Справочники</h1>
          <div className="page-sub">Списки, из которых заполняются выпадающие поля во всех формах</div>
        </div>
        <div className="spacer" />
        <label className="check" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
          <span>Показывать скрытые</span>
        </label>
        <button className="primary" onClick={() => setEditing('new')} disabled={!type}>
          + Добавить значение
        </button>
      </div>

      <div className="alert-box info">
        Значения не удаляются, а скрываются: на них ссылаются уже внесённые процедуры, образцы и результаты. Скрытое
        значение перестаёт предлагаться в новых записях, но остаётся видимым в старых.
      </div>

      <ErrorBox error={error} />

      {!data ? (
        <Loader />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)' }}>
          <div className="card tight">
            <nav style={{ padding: 6 }}>
              {Object.entries(data.types).map(([code, name]) => {
                const count = (data.items[code] ?? []).filter((i) => i.isActive).length
                return (
                  <button
                    key={code}
                    className={code === type ? 'primary' : 'ghost'}
                    style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 2 }}
                    onClick={() => setType(code)}
                  >
                    <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'normal' }}>{name}</span>
                    <span className="badge">{count}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="card tight">
            <div className="card-head">
              <h2>{data.types[type] ?? type}</h2>
              <div style={{ flex: 1 }} />
              <span className="muted mono">{type}</span>
            </div>
            {items.length === 0 ? (
              <Empty text="В этом справочнике пока нет значений" />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Код</th>
                      {hasNum && <th className="num">Норматив, дней</th>}
                      {hasFlag && <th>Патологический результат</th>}
                      <th className="num">Порядок</th>
                      <th>Активно</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          {it.label}
                          {it.isSystem && (
                            <span className="badge blue" style={{ marginLeft: 6 }}>
                              системное
                            </span>
                          )}
                        </td>
                        <td className="mono nowrap">{it.code}</td>
                        {hasNum && <td className="num">{it.numValue ?? '—'}</td>}
                        {hasFlag && <td>{it.flag ? <span className="badge red">да</span> : <span className="muted">нет</span>}</td>}
                        <td className="num">{it.sortOrder}</td>
                        <td>
                          {it.isActive ? (
                            <span className="badge green">активно</span>
                          ) : (
                            <span className="badge">скрыто</span>
                          )}
                        </td>
                        <td className="nowrap">
                          <div className="btn-row">
                            <button className="sm" onClick={() => setEditing(it)}>
                              Изменить
                            </button>
                            {it.isActive ? (
                              <button className="sm" onClick={() => archive(it)}>
                                Скрыть
                              </button>
                            ) : (
                              <button className="sm" onClick={() => restore(it)}>
                                Вернуть
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <DictForm
          type={type}
          typeLabel={data?.types[type] ?? type}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

function DictForm({
  type,
  typeLabel,
  item,
  onClose,
  onSaved,
}: {
  type: string
  typeLabel: string
  item: DictItem | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [f, setF] = useState<DraftForm>({
    label: item?.label ?? '',
    code: item?.code ?? '',
    sortOrder: item?.sortOrder != null ? String(item.sortOrder) : '',
    numValue: item?.numValue != null ? String(item.numValue) : '',
    flag: item?.flag ?? false,
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof DraftForm>(k: K, v: DraftForm[K]) {
    setF((s) => ({ ...s, [k]: v }))
  }

  const hasNum = type === NUM_TYPE
  const hasFlag = type === FLAG_TYPE

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const common = {
        label: f.label.trim(),
        sortOrder: int(f.sortOrder) ?? 999,
        numValue: hasNum ? int(f.numValue) : null,
        flag: hasFlag ? f.flag : false,
      }
      if (item) await api.patch(`/dictionaries/${item.id}`, common)
      else await api.post('/dictionaries', { type, code: f.code.trim() || undefined, ...common })
      await onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={item ? `Значение справочника «${typeLabel}»` : `Новое значение: ${typeLabel}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" onClick={save} disabled={busy || !f.label.trim()}>
            Сохранить
          </button>
        </>
      }
    >
      <ErrorBox error={error} />

      <Text label="Название" value={f.label} onChange={(v) => set('label', v)} required />

      <div className="grid cols-2">
        <Text
          label="Код"
          value={f.code}
          onChange={(v) => set('code', v)}
          disabled={item != null}
          hint={
            item
              ? 'Код менять нельзя: на него ссылаются уже внесённые записи'
              : 'Можно не заполнять — сгенерируется автоматически из названия'
          }
        />
        <Text
          label="Порядок сортировки"
          type="number"
          value={f.sortOrder}
          onChange={(v) => set('sortOrder', v)}
          hint="Чем меньше число, тем выше значение в списке"
        />
      </div>

      {hasNum && (
        <Text
          label="Нормативный срок выполнения, дней"
          type="number"
          value={f.numValue}
          onChange={(v) => set('numValue', v)}
          hint="От передачи образца в лабораторию; по нему считается просрочка"
        />
      )}

      {hasFlag && (
        <Check
          label="Считать результат патологическим"
          checked={f.flag}
          onChange={(v) => set('flag', v)}
          hint="Такие результаты попадают в диагностический выход и подсвечиваются в журнале"
        />
      )}
    </Modal>
  )
}
