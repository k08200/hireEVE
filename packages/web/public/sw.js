// EVE Service Worker — offline caching + push notification support
const CACHE_NAME = "eve-v4";
const PRECACHE_URLS = ["/", "/chat", "/briefing", "/manifest.json"];

// Install: precache shell
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API requests from caching
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  // For navigation requests, try network first then cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // Static assets: network-first for _next (hashed, changes on rebuild), cache-first for others
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (url.pathname.match(/\.(js|css|svg|png|jpg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return res;
          }),
      ),
    );
    return;
  }
});

// Push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push event received!", event.data ? "has data" : "no data");
  // Forward to all open tabs so user can see in browser console
  self.clients.matchAll({ type: "window" }).then((clients) => {
    for (const c of clients) {
      c.postMessage({
        type: "PUSH_DEBUG",
        msg: "Push event fired!",
        data: event.data ? event.data.text() : null,
      });
    }
  });
  let title = "EVE";
  let options = {
    body: "You have a new notification",
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    data: { url: "/chat" },
  };
  try {
    const data = event.data ? event.data.json() : {};
    console.log("[SW] Push data parsed:", JSON.stringify(data));
    title = data.title || "EVE";
    options = {
      body: data.body || "You have a new notification",
      icon: "/icon-192.svg",
      badge: "/icon-192.svg",
      data: { url: data.url || "/chat" },
    };
  } catch (err) {
    console.error("[SW] Push data parse error:", err);
    // Show fallback notification even if parsing fails
    title = "EVE — New notification";
    options.body = event.data ? event.data.text() : "Check EVE for details";
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click → open app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
