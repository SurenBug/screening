import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import { useApp } from '../../store'
import { Check, Empty, ErrorBox, Loader, Modal, Select, Text } from '../../components/ui'
import { fmtDate } from '../../lib/format'
import { ROLE_LABELS } from '../../lib/labels'
import type { Role, User } from '../../types'

/** Список пользователей приходит с датой создания — в общем типе User её нет. */
type AdminUser = User & { createdAt?: string | null }

const ROLES: Role[] = ['DOCTOR', 'LAB', 'ADMIN']
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }))
const ROLE_COLORS: Record<string, string> = { ADMIN: 'red', LAB: 'amber', DOCTOR: 'blue' }

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'password'; user: AdminUser }
  | null

export default function UsersPage() {
  const { user: me, can, reloadUsers } = useApp()
  const [rows, setRows] = useState<AdminUser[] | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const allowed = can('ADMIN')

  const load = useCallback(async () => {
    const data = await api.get<AdminUser[]>('/users')
    setRows(data)
    await reloadUsers()
  }, [reloadUsers])

  useEffect(() => {
    if (!allowed) return
    load().catch((e: unknown) => setPageError(e instanceof Error ? e.message : 'Не удалось загрузить список'))
  }, [allowed, load])

  if (!allowed) {
    return (
      <div className="page">
        <div className="page-head">
          <h1>Пользователи</h1>
        </div>
        <div className="card">
          <Empty text="Раздел доступен только администратору" />
        </div>
      </div>
    )
  }

  async function toggleActive(u: AdminUser) {
    setPageError(null)
    try {
      await api.patch(`/users/${u.id}`, { isActive: !(u.isActive ?? true) })
      await load()
    } catch (e: unknown) {
      setPageError(e instanceof Error ? e.message : 'Не удалось изменить статус')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Пользователи</h1>
          <div className="page-sub">Учётные записи сотрудников реестра</div>
        </div>
        <div className="spacer" />
        <button className="primary" onClick={() => setDialog({ kind: 'create' })}>
          + Новый пользователь
        </button>
      </div>

      <div className="alert-box info">
        Учётные записи создаёт только администратор — самостоятельная регистрация в реестре не предусмотрена. Новый
        сотрудник обязан сменить выданный пароль при первом входе.
      </div>

      <ErrorBox error={pageError} />

      <div className="card tight">
        {!rows ? (
          <Loader />
        ) : rows.length === 0 ? (
          <Empty text="Пользователей нет" />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Логин</th>
                  <th>Должность</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Телеграм</th>
                  <th>Создан</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const self = u.id === me?.id
                  const active = u.isActive ?? true
                  return (
                    <tr key={u.id}>
                      <td>
                        <b>{u.fullName}</b>
                        {self && <span className="muted"> — это вы</span>}
                      </td>
                      <td className="mono nowrap">{u.login}</td>
                      <td>{u.position || '—'}</td>
                      <td className="nowrap">
                        <span className={`badge ${ROLE_COLORS[u.role] ?? ''}`}>{ROLE_LABELS[u.role] ?? u.role}</span>
                      </td>
                      <td className="nowrap">
                        <span className={`badge ${active ? 'green' : 'red'}`}>
                          {active ? 'активен' : 'заблокирован'}
                        </span>
                      </td>
                      <td className="nowrap">
                        {u.telegramId ? (
                          <span className="badge blue">привязан</span>
                        ) : (
                          <span className="muted">не привязан</span>
                        )}
                      </td>
                      <td className="nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="nowrap">
                        <button className="sm" onClick={() => setDialog({ kind: 'edit', user: u })}>
                          Изменить
                        </button>{' '}
                        <button className="sm" onClick={() => setDialog({ kind: 'password', user: u })}>
                          Сбросить пароль
                        </button>{' '}
                        <button
                          className={`sm ${active ? 'danger' : ''}`}
                          disabled={self}
                          title={self ? 'Нельзя заблокировать собственную учётную запись' : undefined}
                          onClick={() => toggleActive(u)}
                        >
                          {active ? 'Заблокировать' : 'Разблокировать'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog?.kind === 'create' && <CreateForm onClose={() => setDialog(null)} onSaved={load} />}
      {dialog?.kind === 'edit' && (
        <EditForm user={dialog.user} self={dialog.user.id === me?.id} onClose={() => setDialog(null)} onSaved={load} />
      )}
      {dialog?.kind === 'password' && (
        <PasswordForm user={dialog.user} onClose={() => setDialog(null)} onSaved={load} />
      )}
    </div>
  )
}

function useSubmit(onSaved: () => Promise<void>, onClose: () => void) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(validate: () => string | null, action: () => Promise<unknown>) {
    const problem = validate()
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      await action()
      await onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return { error, busy, run }
}

function CreateForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ fullName: '', login: '', position: '', role: 'DOCTOR' as Role, password: '' })
  const { error, busy, run } = useSubmit(onSaved, onClose)

  function submit() {
    run(
      () => {
        if (form.fullName.trim().length < 3) return 'Укажите фамилию, имя и отчество'
        if (form.login.trim().length < 3) return 'Логин должен быть не короче 3 символов'
        if (form.password.length < 8) return 'Пароль должен быть не короче 8 символов'
        return null
      },
      () =>
        api.post('/users', {
          fullName: form.fullName.trim(),
          login: form.login.trim().toLowerCase(),
          position: form.position.trim() || null,
          role: form.role,
          password: form.password,
        }),
    )
  }

  return (
    <Modal
      title="Новый пользователь"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy} onClick={submit}>
            Создать
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      <Text
        label="ФИО"
        required
        value={form.fullName}
        onChange={(v) => setForm({ ...form, fullName: v })}
        placeholder="Иванова Мария Петровна"
        hint="Фамилия, имя и отчество одной строкой"
      />
      <Text
        label="Логин"
        required
        value={form.login}
        onChange={(v) => setForm({ ...form, login: v })}
        hint="Не короче 3 символов, латиницей"
      />
      <Text label="Должность" value={form.position} onChange={(v) => setForm({ ...form, position: v })} />
      <Select
        label="Роль"
        required
        empty={null}
        value={form.role}
        options={ROLE_OPTIONS}
        onChange={(v) => setForm({ ...form, role: v as Role })}
      />
      <Text
        label="Пароль"
        required
        type="password"
        value={form.password}
        onChange={(v) => setForm({ ...form, password: v })}
        hint="Не короче 8 символов. Сообщите пароль сотруднику лично — при первом входе он обязан сменить его на свой."
      />
    </Modal>
  )
}

function EditForm({
  user,
  self,
  onClose,
  onSaved,
}: {
  user: AdminUser
  self: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState({
    fullName: user.fullName,
    position: user.position ?? '',
    role: user.role,
    isActive: user.isActive ?? true,
  })
  const { error, busy, run } = useSubmit(onSaved, onClose)

  function submit() {
    run(
      () => (form.fullName.trim().length < 3 ? 'Укажите фамилию, имя и отчество' : null),
      () =>
        api.patch(`/users/${user.id}`, {
          fullName: form.fullName.trim(),
          position: form.position.trim() || null,
          // Свою роль и свой доступ администратор менять не может — иначе рискует запереть себя снаружи
          role: self ? user.role : form.role,
          isActive: self ? true : form.isActive,
        }),
    )
  }

  return (
    <Modal
      title={`Изменить: ${user.login}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy} onClick={submit}>
            Сохранить
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      {self && (
        <div className="alert-box warn">
          Это ваша учётная запись: понизить собственную роль и заблокировать себя нельзя.
        </div>
      )}
      <Text label="ФИО" required value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
      <Text label="Должность" value={form.position} onChange={(v) => setForm({ ...form, position: v })} />
      <Select
        label="Роль"
        required
        empty={null}
        disabled={self}
        value={form.role}
        options={ROLE_OPTIONS}
        onChange={(v) => setForm({ ...form, role: v as Role })}
        hint={self ? 'Роль своей учётной записи изменить нельзя' : undefined}
      />
      {self ? (
        <div className="hint">Статус: активен (собственную запись заблокировать нельзя)</div>
      ) : (
        <Check
          label="Учётная запись активна"
          checked={form.isActive}
          onChange={(v) => setForm({ ...form, isActive: v })}
          hint="Заблокированный сотрудник не сможет войти в реестр"
        />
      )}
    </Modal>
  )
}

function PasswordForm({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const { error, busy, run } = useSubmit(onSaved, onClose)

  function submit() {
    run(
      () => (password.length < 8 ? 'Пароль должен быть не короче 8 символов' : null),
      () => api.patch(`/users/${user.id}`, { password }),
    )
  }

  return (
    <Modal
      title={`Сброс пароля: ${user.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" disabled={busy} onClick={submit}>
            Сбросить пароль
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="alert-box warn">
        Все активные сессии этого сотрудника будут закрыты. При следующем входе он обязан задать свой пароль.
      </div>
      <Text
        label="Новый пароль"
        required
        type="password"
        value={password}
        onChange={setPassword}
        hint="Не короче 8 символов. Передайте его сотруднику лично."
      />
    </Modal>
  )
}
