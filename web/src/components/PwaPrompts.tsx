import { useEffect, useState } from 'react'
import {
  applyUpdate,
  canInstall,
  hasUpdate,
  isIOS,
  isStandalone,
  promptInstall,
  subscribe,
} from '../pwa'
import { Modal } from './ui'

const DISMISSED_KEY = 'install-prompt-dismissed'

/**
 * Две ненавязчивые полосы внизу экрана: предложение установить приложение
 * и сообщение о вышедшем обновлении. Обе закрываются и никогда не перекрывают работу.
 */
export default function PwaPrompts() {
  const [, force] = useState(0)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1')
  const [iosHelp, setIosHelp] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => subscribe(() => force((n) => n + 1)), [])

  // Пропавшая связь должна быть видна сразу: иначе врач не поймёт,
  // почему запись не сохраняется
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const standalone = isStandalone()
  const showUpdate = hasUpdate()
  // На iOS браузерного окна установки нет — показываем короткую подсказку, как это делается вручную
  const showInstall = !standalone && !dismissed && (canInstall() || isIOS())

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  return (
    <>
      {!online && (
        <div className="pwa-bar offline">
          <span>Нет связи. Внесённое сейчас не сохранится — дождитесь восстановления сети.</span>
        </div>
      )}

      {online && showUpdate && (
        <div className="pwa-bar update">
          <span>Вышло обновление сервиса</span>
          <div className="pwa-actions">
            <button className="sm" onClick={() => applyUpdate()}>
              Обновить
            </button>
          </div>
        </div>
      )}

      {online && !showUpdate && showInstall && (
        <div className="pwa-bar">
          <span>Установить на телефон — открывается как обычное приложение</span>
          <div className="pwa-actions">
            <button
              className="sm primary"
              onClick={async () => {
                if (isIOS() && !canInstall()) setIosHelp(true)
                else if (await promptInstall()) dismiss()
              }}
            >
              Установить
            </button>
            <button className="sm" onClick={dismiss}>
              Не сейчас
            </button>
          </div>
        </div>
      )}

      {iosHelp && (
        <Modal
          title="Установка на iPhone"
          onClose={() => setIosHelp(false)}
          footer={
            <button
              className="primary"
              onClick={() => {
                dismiss()
                setIosHelp(false)
              }}
            >
              Понятно
            </button>
          }
        >
          <p style={{ marginTop: 0 }}>
            Safari не умеет устанавливать приложения одной кнопкой, поэтому три шага вручную:
          </p>
          <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li>
              Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх, внизу экрана
            </li>
            <li>
              Пролистайте список и выберите <b>«На экран „Домой“»</b>
            </li>
            <li>
              Нажмите <b>«Добавить»</b>
            </li>
          </ol>
          <p className="muted" style={{ marginBottom: 0 }}>
            Значок появится на домашнем экране. Открываться будет во весь экран, без адресной
            строки браузера.
          </p>
        </Modal>
      )}
    </>
  )
}
