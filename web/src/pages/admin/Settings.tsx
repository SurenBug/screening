import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useApp } from '../../store'
import { Empty, ErrorBox, Loader, Text } from '../../components/ui'
import { plural } from '../../lib/format'

type Settings = Record<string, string>

/** Известные настройки. Неизвестные ключи с сервера показываем как есть, чтобы не терять их при сохранении. */
const FIELDS: { key: string; label: string; hint?: string; type?: string }[] = [
  { key: 'institutionName', label: 'Название учреждения', hint: 'Подставляется в шапку печатных форм и выгрузок' },
  {
    key: 'sessionTimeoutMinutes',
    label: 'Автовыход при бездействии, минут',
    type: 'number',
    hint: 'Через столько минут без действий сеанс закрывается — требование к работе с врачебной тайной',
  },
  {
    key: 'outcomeReminderDaysAfterEdd',
    label: 'Через сколько дней после ПДР напоминать внести исход',
    type: 'number',
    hint: 'Задача на внесение исхода беременности создаётся автоматически',
  },
]

export default function SettingsPage() {
  const { can, list } = useApp()
  const [values, setValues] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!can('ADMIN')) return
    api
      .get<Settings>('/users/settings')
      .then(setValues)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [can])

  if (!can('ADMIN')) {
    return (
      <div className="page">
        <div className="alert-box warn">Раздел доступен только администратору</div>
      </div>
    )
  }

  function set(key: string, v: string) {
    setValues((s) => ({ ...(s ?? {}), [key]: v }))
    setSaved(false)
  }

  async function save() {
    if (!values) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await api.put('/users/settings', values)
      setSaved(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const methods = list('METHOD')
  const extraKeys = values ? Object.keys(values).filter((k) => !FIELDS.some((f) => f.key === k)) : []

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <div className="page-sub">Общие параметры системы, действуют для всех пользователей</div>
        </div>
      </div>

      <ErrorBox error={error} />
      {saved && <div className="alert-box ok">Настройки сохранены</div>}

      {!values ? (
        <Loader />
      ) : (
        <>
          <div className="card">
            <h2>Основные</h2>
            {FIELDS.map((f) => (
              <Text
                key={f.key}
                label={f.label}
                type={f.type}
                hint={f.hint}
                value={values[f.key] ?? ''}
                onChange={(v) => set(f.key, v)}
              />
            ))}

            {extraKeys.map((k) => (
              <Text key={k} label={k} value={values[k] ?? ''} onChange={(v) => set(k, v)} />
            ))}

            <div className="btn-row">
              <button className="primary" onClick={save} disabled={busy}>
                Сохранить
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Нормативные сроки выполнения анализов</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              По этим срокам считается дата готовности образца и просрочка в лаборатории. Значения меняются в разделе{' '}
              <Link to="/admin/dictionaries">Справочники</Link>, справочник «Методы исследования».
            </p>
            {methods.length === 0 ? (
              <Empty text="Методы исследования не заведены" />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Метод</th>
                    <th>Код</th>
                    <th className="num">Норматив</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m.id}>
                      <td>{m.label}</td>
                      <td className="mono nowrap">{m.code}</td>
                      <td className="num nowrap">
                        {m.numValue != null ? plural(m.numValue, 'день', 'дня', 'дней') : <span className="muted">не задан</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
