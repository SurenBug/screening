import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, api } from './api'
import type { DictItem, Dictionaries, User } from './types'

interface AppState {
  user: User | null
  loading: boolean
  /** Сервер недоступен — это не то же самое, что «не авторизован». */
  offline: boolean
  retry: () => void
  dict: Dictionaries | null
  users: User[]
  login: (login: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reloadDict: () => Promise<void>
  reloadUsers: () => Promise<void>
  setUser: (u: User | null) => void
  /** Название значения справочника по коду. */
  label: (type: string, code?: string | null) => string
  list: (type: string) => DictItem[]
  can: (...roles: string[]) => boolean
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [dict, setDict] = useState<Dictionaries | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const reloadDict = useCallback(async () => {
    setDict(await api.get<Dictionaries>('/dictionaries'))
  }, [])

  const reloadUsers = useCallback(async () => {
    setUsers(await api.get<User[]>('/users'))
  }, [])

  useEffect(() => {
    setLoading(true)
    api
      .get<User>('/auth/me')
      .then((u) => {
        setUser(u)
        setOffline(false)
      })
      .catch((err) => {
        setUser(null)
        // 401 — обычный «не вошёл». Всё остальное означает, что сервер не ответил,
        // и показывать в этом случае форму входа нельзя: врач решит, что его разлогинило,
        // и будет впустую вводить пароль
        setOffline(!(err instanceof ApiError && err.status === 401))
      })
      .finally(() => setLoading(false))
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // Сеть вернулась — пробуем восстановить сеанс сами
  useEffect(() => {
    const onOnline = () => setAttempt((n) => n + 1)
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  useEffect(() => {
    if (!user) {
      setDict(null)
      setUsers([])
      return
    }
    reloadDict().catch(() => {})
    reloadUsers().catch(() => {})
  }, [user, reloadDict, reloadUsers])

  const login = useCallback(async (login: string, password: string) => {
    const u = await api.post<User>('/auth/login', { login, password })
    setUser(u)
    setOffline(false)
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout')
    setUser(null)
  }, [])

  const label = useCallback(
    (type: string, code?: string | null) => {
      if (!code) return '—'
      const found = dict?.items[type]?.find((d) => d.code === code)
      return found?.label ?? code
    },
    [dict],
  )

  const list = useCallback((type: string) => dict?.items[type] ?? [], [dict])

  const can = useCallback(
    (...roles: string[]) => {
      if (!user) return false
      if (user.role === 'ADMIN') return true
      return roles.includes(user.role)
    },
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, offline, retry, dict, users, login, logout, reloadDict, reloadUsers, setUser, label, list, can }),
    [user, loading, offline, retry, dict, users, login, logout, reloadDict, reloadUsers, label, list, can],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp вне AppProvider')
  return ctx
}
