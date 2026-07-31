import { useState, type FormEvent } from 'react'
import { useApp } from '../store'
import { ErrorBox } from '../components/ui'

export default function LoginPage() {
  const { login } = useApp()
  const [form, setForm] = useState({ login: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(form.login, form.password)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Реестр пренатальной диагностики</h1>
        <p className="sub">Вход для сотрудников отделения</p>
        <ErrorBox error={error} />
        <div className="field">
          <label>Логин</label>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Пароль</label>
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <button className="primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Проверяем…' : 'Войти'}
        </button>
      </form>
    </div>
  )
}
