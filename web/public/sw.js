/**
 * Сервис-воркер реестра пренатальной диагностики.
 *
 * Главное правило: медицинские данные никогда не берутся из кэша.
 * Показать врачу вчерашний результат анализа как сегодняшний — опаснее,
 * чем честно сказать «нет сети». Поэтому кэшируется только сама оболочка
 * приложения (разметка, скрипты, стили, значки), а всё, что идёт в /api,
 * работает исключительно по сети.
 */

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon-192.png']))
      // Первая установка не должна падать целиком, если один файл недоступен
      .catch(() => undefined),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((n) => n !== SHELL && n !== ASSETS).map((n) => caches.delete(n)))
      await self.clients.claim()
    })(),
  )
})

/** Обновление применяется сразу, когда врач нажал «Обновить» в интерфейсе. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Данные пациенток и выгрузки — только по сети, без кэша ни при каких условиях
  if (url.pathname.startsWith('/api/')) return

  // Переходы по страницам: сначала сеть, при её отсутствии — сохранённая оболочка.
  // Приложение одностраничное, поэтому любой адрес открывается из сохранённого «/».
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(async () => {
          const cached = await caches.match('/', { ignoreSearch: true })
          return cached ?? offlineResponse()
        }),
    )
    return
  }

  // Скрипты, стили и значки: имя файла содержит хэш содержимого,
  // поэтому старая версия не может «прилипнуть» — отдаём из кэша сразу.
  if (isAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(ASSETS).then((cache) => cache.put(request, copy))
          }
          return response
        })
      }),
    )
  }
})

function isAsset(pathname) {
  return (
    pathname.startsWith('/assets/') ||
    /\.(png|svg|ico|webmanifest|woff2?)$/.test(pathname)
  )
}

function offlineResponse() {
  return new Response(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width, initial-scale=1">
     <title>Нет связи</title>
     <style>
       body{margin:0;height:100vh;display:grid;place-items:center;background:#f4f6f8;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#16202a}
       .box{max-width:340px;padding:28px;text-align:center}
       h1{font-size:18px;margin:0 0 8px}
       p{color:#5b6b7a;font-size:14px;line-height:1.5;margin:0}
     </style></head>
     <body><div class="box">
       <h1>Нет связи с сервером</h1>
       <p>Данные пациенток намеренно не сохраняются на устройстве, поэтому без сети
       открыть их нельзя. Проверьте подключение и обновите страницу.</p>
     </div></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
