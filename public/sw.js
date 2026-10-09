const CACHE_NAME = 'task-manager-xp-v6';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/apple-icon.png',
];

// Dynamic cache for Next.js chunks and other assets
const DYNAMIC_CACHE = 'task-manager-dynamic-xp-v6';

// Oldest entry first: the dynamic cache grows with every route ever visited,
// so it is trimmed rather than kept forever.
const DYNAMIC_CACHE_LIMIT = 80;

/** Drop the oldest entries once the dynamic cache passes its limit. */
async function trimDynamicCache() {
  const cache = await caches.open(DYNAMIC_CACHE);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - DYNAMIC_CACHE_LIMIT))) {
    await cache.delete(key);
  }
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== DYNAMIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// Fetch event - offline-first strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Never cache authenticated or third-party responses (for example Firebase APIs).
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip API requests - always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    event.respondWith(fetch(request));
    return;
  }

  // For navigation requests (HTML pages), use network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If offline, try to serve from cache
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
    return;
  }

  // For Next.js chunks and static assets, use cache-first with network fallback
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|eot|ico|png|jpg|jpeg|svg|gif|webp)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached version and update cache in background
          fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(DYNAMIC_CACHE).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        // Not in cache, fetch from network
        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // For other requests, network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone).then(trimDynamicCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// --- Web Push ---------------------------------------------------------------
// This is what makes alarms work when the app is closed. In-page setTimeout is
// killed as soon as iOS suspends the web app, so the alarm has to arrive from
// the push service instead.

const DEFAULT_NOTIFICATION = {
  title: '🔔 ALARM',
  body: 'You have a task due.',
  tag: 'task-alarm',
  url: '/',
};

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || DEFAULT_NOTIFICATION.title;
  const url = payload.url || DEFAULT_NOTIFICATION.url;

  // iOS requires every push to show a notification, otherwise it revokes the
  // push subscription after repeated silent pushes.
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || DEFAULT_NOTIFICATION.body,
      tag: payload.tag || DEFAULT_NOTIFICATION.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      requireInteraction: true,
      renotify: true,
      timestamp: payload.fireAt || Date.now(),
      data: { url, taskId: payload.taskId || null },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin
  ).href;

  const taskId = (event.notification.data && event.notification.data.taskId) || null;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          // Tell the running app which task to open instead of navigating,
          // which would reload it and throw away its state.
          if (taskId) client.postMessage({ type: 'open-task', taskId });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Push endpoints rotate. Re-subscribe with the same server key and let the app
// re-persist the new endpoint the next time it is opened.
self.addEventListener('pushsubscriptionchange', (event) => {
  const applicationServerKey =
    (event.oldSubscription && event.oldSubscription.options
      ? event.oldSubscription.options.applicationServerKey
      : null);

  if (!applicationServerKey) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then((subscription) =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: 'pushsubscriptionchange',
              subscription: subscription.toJSON(),
            });
          }
        })
      )
      .catch(() => {})
  );
});
