/* Zircon Journey — Web Push messaging service worker.
 *
 * This is a MESSAGING worker only: it has NO `fetch` handler, so it never
 * intercepts navigation/asset requests and is safe to register everywhere
 * (including the Lovable preview). It only shows incoming push notifications
 * and focuses the app when one is tapped — even when the app is fully closed.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "إشعار جديد", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "📩 بيانات جديدة واردة";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "zircon-incoming",
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && targetUrl !== "/") {
            try { client.navigate(targetUrl); } catch { /* noop */ }
          }
          return undefined;
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
