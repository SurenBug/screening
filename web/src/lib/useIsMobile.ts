import { useEffect, useState } from 'react'

const QUERY = '(max-width: 900px)'

/**
 * Телефон или узкий экран. Ниже этой ширины таблицы заменяются карточками:
 * горизонтальная прокрутка таблицы на телефоне неудобна, а врачи работают
 * в основном с телефона.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return mobile
}
