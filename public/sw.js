// Avenize Service Worker - Advanced Offline Support & Caching
// Release version is intentionally bumped when auth/runtime contracts change.
// v11: never retain a stale HTML shell that can reference removed hashed bundles.
const CACHE_VERSION = 'v11'
const CACHE_PREFIX = `avenize-${CACHE_VERSION}`
const STATIC_CACHE = `${CACHE_PREFIX}-static`
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic`
const IMAGE_CACHE = `${CACHE_PREFIX}-images`

const STATIC_ASSETS = ['/index.html', '/manifest.json', '/favicon.svg']
const MAX_CACHE_ITEMS = 100
const MAX_IMAGE_CACHE_ITEMS = 50

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames
        .filter((name) => name.startsWith('avenize-') && !name.startsWith(CACHE_PREFIX))
        .map((name) => caches.delete(name)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET') return
  if (url.origin !== location.origin && !url.hostname.includes('cdn')) return

  const isApiPath = url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/rest/v1/')
    || url.pathname.startsWith('/auth/v1/')
    || url.pathname.startsWith('/functions/v1/')
    || url.pathname.startsWith('/storage/v1/')
    || url.hostname.includes('supabase')
  if (isApiPath) {
    event.respondWith(networkFirstWithOfflineIndicator(request))
    return
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirstForImages(request))
    return
  }

  // Hashed application assets must always be network-first. If a bundle was
  // removed by a later deployment, never substitute index.html for it.
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(networkFirstForStaticAsset(request))
    return
  }
  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/)) {
    event.respondWith(networkFirstForStaticAsset(request))
    return
  }

  // HTML is the version manifest for the whole SPA. Do not keep a dynamic
  // navigation cache: an old HTML shell can reference hashed files that no
  // longer exist in the active deployment and trigger strict MIME failures.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE))
})

async function networkFirstNavigation(request) {
  try {
    return await fetch(request, { cache: 'no-cache' })
  } catch {
    // Offline fallback is intentionally limited to the current versioned
    // static shell; old dynamic navigation entries are never used.
    const cached = await caches.match('/index.html')
    return cached || new Response('Avenize is offline. Please reconnect and retry.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function networkFirstForStaticAsset(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' })
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      await cache.put(request, response.clone())
      return response
    }
    throw new Error(`Static asset request failed: ${response.status}`)
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return new Response('', { status: 404 })
  }
}

async function cacheFirstForImages(request) {
  const cache = await caches.open(IMAGE_CACHE)
  const cachedResponse = await cache.match(request)
  if (cachedResponse) return cachedResponse
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone())
      await trimCache(cache, MAX_IMAGE_CACHE_ITEMS)
    }
    return networkResponse
  } catch {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f3f4f6" width="100" height="100"/></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } },
    )
  }
}

async function networkFirstWithOfflineIndicator(request) {
  try {
    return await fetch(request, { cache: 'no-cache' })
  } catch {
    return new Response(
      JSON.stringify({ error: 'You are offline', offline: true, message: 'Please check your connection and try again.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)
  fetch(request, { cache: 'no-cache' }).then(async (networkResponse) => {
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone())
      await trimCache(cache, MAX_CACHE_ITEMS)
    }
  }).catch(() => null)
  return cachedResponse || fetch(request, { cache: 'no-cache' }).catch(() => caches.match('/index.html'))
}

async function trimCache(cache, maxItems) {
  const keys = await cache.keys()
  const excess = keys.length - maxItems
  if (excess <= 0) return
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-actions') event.waitUntil(syncOfflineActions())
})

async function syncOfflineActions() {
  const db = await openDB()
  const actions = await getPendingActions(db)
  for (const action of actions) {
    try {
      await fetch(action.url, { method: action.method, headers: action.headers, body: action.body })
      await removeAction(db, action.id)
    } catch (error) {
      console.error('Failed to sync action:', error)
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('avenize-offline', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('pending-actions')) db.createObjectStore('pending-actions', { keyPath: 'id', autoIncrement: true })
    }
  })
}

function getPendingActions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending-actions'], 'readonly')
    const request = transaction.objectStore('pending-actions').getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function removeAction(db, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(['pending-actions'], 'readwrite').objectStore('pending-actions').delete(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(self.registration.showNotification(data.title || 'Avenize', {
    body: data.body || 'You have a new notification', icon: '/favicon.svg', badge: '/favicon.svg', vibrate: [100, 50, 100],
    data: { url: data.url || '/', dateOfArrival: Date.now() }, actions: data.actions || [],
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) if (client.url === event.notification.data.url && 'focus' in client) return client.focus()
    if (clients.openWindow) return clients.openWindow(event.notification.data.url)
  }))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CLEAR_CACHE') event.waitUntil(caches.keys().then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name)))))
})
