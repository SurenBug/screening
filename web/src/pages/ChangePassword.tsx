import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../store'
import { ErrorBox } from '../components/ui'

export default function ChangePasswordPage({ forced }: { forced?: boolean }) {
  const { user, setUser, logout } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', repeat: '' })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.newPassword.length < 8) return setError('Новый пароль должен быть не короче 8 символов')
    if (form.newPassword !== form.repeat) return setError('Пароли не совпадают')

    setBusy(true)
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      })
      if (forced) {
        setUser({ ...user!, mustChangePassword: false })
      } else {
        setDone(true)
        setForm({ currentPassword: '', newPassword: '', repeat: '' })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <>
      <ErrorBox error={error} />
      {done && <div className="alert-box ok">Пароль изменён</div>}
      <div className="field">
        <label>Текущий пароль</label>
        <input
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
        />
      </div>
      <div className="field">
        <label>Новый пароль</label>
        <input
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        />
        <div className="hint">Не короче 8 символов</div>
      </div>
      <div className="field">
        <label>Повторите новый пароль</label>
        <input
          type="password"
          autoComplete="new-password"
          value={form.repeat}
          onChange={(e) => setForm({ ...form, repeat: e.target.value })}
        />
      </div>
    </>
  )

  if (forced) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={submit}>
          <h1>Смените пароль</h1>
          <p className="sub">Пароль выдан администратором. Задайте свой — он известен только вам.</p>
          {body}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy}>
              Сохранить
            </button>
            <button type="button" onClick={() => logout()}>
              Выйти
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <div className="page-head">
        <h1>Смена пароля</h1>
      </div>
      <form className="card" onSubmit={submit}>
        {body}
        <div className="btn-row">
          <button className="primary" disabled={busy}>
            Сохранить
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Назад
          </button>
        </div>
      </form>
    </div>
  )
}
