// Avenize Service Worker - Advanced Offline Support & Caching
const CACHE_NAME = 'avenize-v2'
const STATIC_CACHE = 'avenize-static-v2'
const DYNAMIC_CACHE = 'avenize-dynamic-v2'
const IMAGE_CACHE = 'avenize-images-v2'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
]

const MAX_CACHE_ITEMS = 100
const MAX_IMAGE_CACHE_ITEMS = 50

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !['avenize-v2', 'avenize-static-v2', 'avenize-dynamic-v2', 'avenize-images-v2'].includes(name))
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // Skip cross-origin except CDN
  if (url.origin !== location.origin && !url.hostname.includes('cdn')) {
    return
  }

  // API requests - network first with offline indicator
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) {
    event.respondWith(networkFirstWithOfflineIndicator(request))
    return
  }

  // Images - cache first
  if (request.destination === 'image') {
    event.respondWith(cacheFirstForImages(request))
    return
  }

  // Static assets - stale while revalidate
  if (url.pathname.match(/\.(js|css|woff2?|ttf|eot)$/)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
    return
  }

  // HTML pages - network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // Default - stale while revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE))
})

async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) return cachedResponse
    return caches.match('/index.html')
  }
}

async function networkFirstWithOfflineIndicator(request) {
  try {
    return await fetch(request)
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'You are offline',
        offline: true,
        message: 'Please check your connection and try again.'
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cachedResponse = await cache.match(request)

  fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
      trimCache(cache, MAX_CACHE_ITEMS)
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
      cache.put(request, networkResponse.clone())
      trimCache(cache, MAX_IMAGE_CACHE_ITEMS)
    }
    return networkResponse
  } catch (error) {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f3f4f6" width="100" height="100"/></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    )
  }
}

async function trimCache(cache, maxItems) {
  const keys = await cache.keys()
  if (keys.length > maxItems) {
    await cache.delete(keys[0])
  }
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-actions') {
    event.waitUntil(syncOfflineActions())
  }
})

async function syncOfflineActions() {
  const db = await openDB()
  const actions = await getPendingActions(db)
  
  for (const action of actions) {
    try {
      await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body
      })
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
    const store = transaction.objectStore('pending-actions')
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function removeAction(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pending-actions'], 'readwrite')
    const store = transaction.objectStore('pending-actions')
    const request = store.delete(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: data.actions || []
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Avenize', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url)
      }
    })
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((name) => caches.delete(name)))
      })
    )
  }
})
