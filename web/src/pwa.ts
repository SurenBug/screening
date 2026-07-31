/**
 * Установка приложения на телефон и обновление уже установленного.
 *
 * Обновление показывается явной кнопкой, а не применяется молча:
 * если врач заполняет форму, перезагрузка страницы посреди работы
 * потеряла бы введённое.
 */

type Listener = () => void

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null
let updateReady: ServiceWorkerRegistration | null = null
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((l) => l())
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function canInstall(): boolean {
  return deferredPrompt !== null
}

export function hasUpdate(): boolean {
  return updateReady !== null
}

/** Приложение уже открыто как отдельное — предлагать установку незачем. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari на iOS сообщает об этом по-своему
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  notify()
  return outcome === 'accepted'
}

export function applyUpdate() {
  if (!updateReady?.waiting) {
    window.location.reload()
    return
  }
  updateReady.waiting.postMessage('skip-waiting')
}

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Браузерное окно установки перехватываем, чтобы показать своё предложение в нужный момент
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })

  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

      if (reg.waiting) {
        updateReady = reg
        notify()
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          // Появилась новая версия, а старая ещё управляет страницей
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            updateReady = reg
            notify()
          }
        })
      })

      // Проверяем обновления при возвращении к приложению — врач держит его открытым сутками
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })

      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return
        reloading = true
        window.location.reload()
      })
    } catch {
      // Без сервис-воркера приложение работает как обычный сайт — это не повод падать
    }
  })
}
