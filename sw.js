/* Chatter service worker.
 *
 * Deliberately does NOT cache anything — the app shell must always load fresh
 * (vercel.json already sends no-cache headers).
 *
 * Its only job is to let a background page raise a notification for a
 * scheduled message, and to bring the app to the front when that
 * notification is tapped.
 */

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
    })
  );
});
