// Avenize Service Worker - Advanced Offline Support & Caching
// Release version is intentionally bumped when auth/runtime contracts change.
const CACHE_VERSION = 'v5'
const CACHE_PREFIX = `avenize-${CACHE_VERSION}`
const STATIC_CACHE = `${CACHE_PREFIX}-static`
const DYNAMIC_CACHE = `${CACHE_PREFIX}-dynamic`
const IMAGE_CACHE = `${CACHE_PREFIX}-images`

const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg']
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

  // Never cache Supabase/auth/API traffic.
  if (url.origin !== location.origin && !url.hostname.includes('cdn')) return
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    event.respondWith(networkFirstWithOfflineIndicator(request))
    return
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirstForImages(request))
    return
  }

  // Content-hashed build assets (/assets/<name>-<hash>.js) are immutable by
  // construction: a new deploy produces new filenames, so a cached copy can
  // never go stale. Serve cache-first for instant repeat loads.
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstForHashedAsset(request))
    return
  }

  // JS/CSS are deployment-sensitive. Network-first prevents an old service
  // worker from serving a stale auth bundle after a production deployment.
  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/)) {
    event.respondWith(networkFirstForStaticAsset(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE))
})

async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      await cache.put(request, networkResponse.clone())
      await trimCache(cache, MAX_CACHE_ITEMS)
    }
    return networkResponse
  } catch {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) return cachedResponse
    return caches.match('/index.html')
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
    return fetch(request)
  }
}

async function cacheFirstForHashedAsset(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirstWithOfflineIndicator(request) {
  try {
    return await fetch(request)
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
  fetch(request).then(async (networkResponse) => {
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone())
      await trimCache(cache, MAX_CACHE_ITEMS)
    }
  }).catch(() => null)
  return cachedResponse || fetch(request).catch(() => caches.match('/index.html'))
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
      if (!db.objectStoreNames.contains('pending-actions')) {
        db.createObjectStore('pending-actions', { keyPath: 'id', autoIncrement: true })
      }
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
    body: data.body || 'You have a new notification',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/', dateOfArrival: Date.now() },
    actions: data.actions || [],
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url === event.notification.data.url && 'focus' in client) return client.focus()
    }
    if (clients.openWindow) return clients.openWindow(event.notification.data.url)
  }))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(caches.keys().then((cacheNames) => Promise.all(cacheNames.map((name) => caches.delete(name)))))
  }
})
