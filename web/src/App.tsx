import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from './store'
import { api } from './api'
import { Loader } from './components/ui'
import PwaPrompts from './components/PwaPrompts'
import { ROLE_LABELS } from './lib/labels'

import LoginPage from './pages/Login'
import ChangePasswordPage from './pages/ChangePassword'
import DashboardPage from './pages/Dashboard'
import PatientsPage from './pages/Patients'
import PatientPage from './pages/Patient'
import PatientFormPage from './pages/PatientForm'
import JournalPage from './pages/Journal'
import ProcedureWizardPage from './pages/ProcedureWizard'
import ProcedurePage from './pages/Procedure'
import LabPage from './pages/Lab'
import ReportsPage from './pages/Reports'
import DictionariesPage from './pages/admin/Dictionaries'
import UsersPage from './pages/admin/Users'
import AuditPage from './pages/admin/Audit'
import SettingsPage from './pages/admin/Settings'

/** Заголовок в верхней панели телефона — чтобы было видно, где находишься. */
const TITLES: [RegExp, string][] = [
  [/^\/$/, 'Мой день'],
  [/^\/patients\/new/, 'Новая пациентка'],
  [/^\/patients\/[^/]+\/edit/, 'Изменение данных'],
  [/^\/patients\/[^/]+$/, 'Карточка пациентки'],
  [/^\/patients/, 'Пациентки'],
  [/^\/journal/, 'Журнал процедур'],
  [/^\/procedures\/new/, 'Новая процедура'],
  [/^\/procedures/, 'Процедура'],
  [/^\/lab/, 'Лаборатория'],
  [/^\/reports/, 'Отчёты'],
  [/^\/password/, 'Смена пароля'],
  [/^\/admin\/dictionaries/, 'Справочники'],
  [/^\/admin\/users/, 'Пользователи'],
  [/^\/admin\/audit/, 'Журнал доступа'],
  [/^\/admin\/settings/, 'Настройки'],
]

export default function App() {
  const { user, loading, offline, retry } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // Переход по ссылке закрывает выдвижное меню
  useEffect(() => setMenuOpen(false), [location.pathname])

  if (loading) return <Loader />
  // Сервер не ответил: показывать форму входа нельзя — врач подумает, что его разлогинило
  if (!user && offline) return <OfflineScreen onRetry={retry} />
  if (!user)
    return (
      <>
        <LoginPage />
        <PwaPrompts />
      </>
    )
  if (user.mustChangePassword) return <ChangePasswordPage forced />

  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'Реестр'

  return (
    <div className="app">
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <Sidebar open={menuOpen} />
      <div className="main">
        <div className="mobile-topbar">
          <button className="burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Меню">
            ☰
          </button>
          <div className="title">
            {title}
            <span>{user.fullName}</span>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/new" element={<PatientFormPage />} />
          <Route path="/patients/:id" element={<PatientPage />} />
          <Route path="/patients/:id/edit" element={<PatientFormPage />} />
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/procedures/new" element={<ProcedureWizardPage />} />
          <Route path="/procedures/:id" element={<ProcedurePage />} />
          <Route path="/lab" element={<LabPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/password" element={<ChangePasswordPage />} />
          <Route path="/admin/dictionaries" element={<DictionariesPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/audit" element={<AuditPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <BottomNav onMore={() => setMenuOpen(true)} />
        <PwaPrompts />
      </div>
    </div>
  )
}

function Sidebar({ open }: { open: boolean }) {
  const { user, logout, can } = useApp()
  const navigate = useNavigate()
  const [counts, setCounts] = useState<{ awaiting: number; overdue: number } | null>(null)

  // Счётчики в меню обновляются сами — чтобы просроченное было видно, не заходя в раздел
  useEffect(() => {
    let alive = true
    const load = () => {
      api
        .get<any>('/dashboard')
        .then((d) => {
          if (!alive) return
          setCounts({ awaiting: d.tiles.awaiting, overdue: d.tiles.overdue })
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand">
        <strong>Пренатальная диагностика</strong>
        <span>реестр инвазивных процедур</span>
      </div>
      <nav>
        <NavLink to="/" end>
          Мой день
        </NavLink>
        <NavLink to="/patients">Пациентки</NavLink>
        <NavLink to="/journal">Журнал процедур</NavLink>
        <NavLink to="/lab">
          Лаборатория
          {counts?.overdue ? (
            <span className="badge red">{counts.overdue}</span>
          ) : counts?.awaiting ? (
            <span className="badge">{counts.awaiting}</span>
          ) : null}
        </NavLink>
        <NavLink to="/reports">Отчёты</NavLink>
        {can('ADMIN') && (
          <>
            <div className="nav-sep" />
            <NavLink to="/admin/dictionaries">Справочники</NavLink>
            <NavLink to="/admin/users">Пользователи</NavLink>
            <NavLink to="/admin/audit">Журнал доступа</NavLink>
            <NavLink to="/admin/settings">Настройки</NavLink>
          </>
        )}
      </nav>
      <div className="sidebar-user">
        <b>{user!.fullName}</b>
        <span className="role">{ROLE_LABELS[user!.role]}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => navigate('/password')}>Пароль</button>
          <button onClick={() => logout()}>Выйти</button>
        </div>
      </div>
    </aside>
  )
}

/** Сервер недоступен: сеанс не потерян, данные просто негде взять. */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Нет связи с сервером</h1>
        <p className="sub">
          Из системы вас не выкинуло — сеанс сохранён. Данные пациенток намеренно не хранятся
          на телефоне, поэтому без связи их не открыть.
        </p>
        <button
          className="primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy}
          onClick={() => {
            setBusy(true)
            onRetry()
            setTimeout(() => setBusy(false), 1500)
          }}
        >
          {busy ? 'Пробуем…' : 'Попробовать снова'}
        </button>
      </div>
    </div>
  )
}

/** Нижняя панель на телефоне: четыре основных раздела плюс «Ещё». */
function BottomNav({ onMore }: { onMore: () => void }) {
  const [overdue, setOverdue] = useState(0)

  useEffect(() => {
    api
      .get<any>('/dashboard')
      .then((d) => setOverdue(d.tiles.overdue))
      .catch(() => {})
  }, [])

  return (
    <nav className="bottom-nav">
      <NavLink to="/" end>
        <b>◉</b>
        Мой день
      </NavLink>
      <NavLink to="/patients">
        <b>☰</b>
        Пациентки
      </NavLink>
      <NavLink to="/journal">
        <b>▤</b>
        Журнал
      </NavLink>
      <NavLink to="/lab">
        <b>⚗</b>
        Лаборатория
        {overdue > 0 && <span className="dot">{overdue}</span>}
      </NavLink>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault()
          onMore()
        }}
      >
        <b>⋯</b>
        Ещё
      </a>
    </nav>
  )
}
