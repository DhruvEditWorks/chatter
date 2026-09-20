/*
 * Chatter — scheduled-message alarm bridge.
 *
 * This is the single place that talks to the OS scheduler.
 *
 *  - Inside the Android APK  -> Capacitor plugin `ChatterScheduler`
 *                               (AlarmManager + BroadcastReceiver + Notification).
 *                               Works even when the app is on the home screen or killed.
 *  - In a normal browser      -> best effort page timer + Service Worker notification.
 *                               Works while the tab / browser is alive.
 *
 * Everything here is defensive: if the bridge is missing the app must keep working
 * exactly like it did before (in-page 1 second tick).
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ native */

  function nativePlugin() {
    try {
      var C = window.Capacitor;
      if (!C || typeof C.isNativePlatform !== "function" || !C.isNativePlatform()) return null;
      return (C.Plugins && C.Plugins.ChatterScheduler) || null;
    } catch (e) {
      return null;
    }
  }

  function isNative() {
    return nativePlugin() !== null;
  }

  /* --------------------------------------------------------------------- web */

  var webTimers = Object.create(null);
  var webQueue = Object.create(null);

  function showPlain(title, body) {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body: body, tag: "chatter-web" });
      }
    } catch (e) {
      /* Android Chrome rejects `new Notification()`; the SW path covers it. */
    }
  }

  function fireWeb(entry) {
    delete webTimers[entry.id];
    delete webQueue[entry.id];
    var title = entry.title || "Chatter";
    var body = entry.body || "";
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready
          .then(function (reg) {
            return reg.showNotification(title, {
              body: body,
              tag: "chatter-" + entry.id,
              renotify: true
            });
          })
          .catch(function () {
            showPlain(title, body);
          });
        return;
      }
    } catch (e) {
      /* fall through */
    }
    showPlain(title, body);
  }

  function cancelWeb(id) {
    if (webTimers[id]) {
      clearTimeout(webTimers[id]);
      delete webTimers[id];
    }
    delete webQueue[id];
  }

  function scheduleWeb(entry) {
    cancelWeb(entry.id);
    webQueue[entry.id] = entry;
    var delay = Math.max(0, Number(entry.fireAt) - Date.now());
    webTimers[entry.id] = setTimeout(function () {
      fireWeb(entry);
    }, delay);
  }

  function registerServiceWorker() {
    try {
      if (isNative()) return;
      if (!("serviceWorker" in navigator)) return;
      var secure = location.protocol === "https:" || location.hostname === "localhost";
      if (!secure) return;
      navigator.serviceWorker.register("sw.js").catch(function () {});
    } catch (e) {
      /* not fatal */
    }
  }

  /* --------------------------------------------------------------- web grants */

  function webAskPermission() {
    try {
      if (typeof Notification === "undefined") return Promise.resolve(false);
      if (Notification.permission === "granted") return Promise.resolve(true);
      if (Notification.permission === "denied") return Promise.resolve(false);
      return Notification.requestPermission().then(function (p) {
        return p === "granted";
      });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  /* ----------------------------------------------------------------- facade */

  var api = {
    /** "android" when running inside the APK, "web" otherwise. */
    platform: function () {
      return isNative() ? "android" : "web";
    },

    /** Ask the OS for notification permission. Resolves to true when granted. */
    askPermission: function () {
      var n = nativePlugin();
      if (n && n.askPermission) {
        return Promise.resolve(n.askPermission())
          .then(function (r) {
            return !!(r && r.granted);
          })
          .catch(function () {
            return false;
          });
      }
      return webAskPermission();
    },

    /** Full picture of what the OS will actually let us do. */
    status: function () {
      var n = nativePlugin();
      if (n && n.status) {
        return Promise.resolve(n.status()).catch(function () {
          return { native: false, notifications: false, exactAlarms: false };
        });
      }
      return Promise.resolve({
        native: false,
        notifications: typeof Notification !== "undefined" && Notification.permission === "granted",
        exactAlarms: true
      });
    },

    /** Deep link into the "alarm & reminders" settings screen (Android 12+). */
    openAlarmSettings: function () {
      var n = nativePlugin();
      if (n && n.openAlarmSettings) {
        Promise.resolve(n.openAlarmSettings()).catch(function () {});
      }
    },

    /** Register one scheduled message with the OS scheduler. */
    register: function (entry) {
      if (!entry || !entry.id) return;
      var n = nativePlugin();
      if (n && n.schedule) {
        Promise.resolve(n.schedule({ entry: entry })).catch(function () {
          scheduleWeb(entry);
        });
        return;
      }
      scheduleWeb(entry);
    },

    /** Drop one scheduled message from the OS scheduler. */
    cancel: function (id) {
      if (!id) return;
      cancelWeb(id);
      var n = nativePlugin();
      if (n && n.cancel) {
        Promise.resolve(n.cancel({ id: String(id) })).catch(function () {});
      }
    },

    /** Replace the whole native queue with `entries` (idempotent re-sync on boot). */
    syncPending: function (entries) {
      var list = (Array.isArray(entries) ? entries : []).filter(function (e) {
        return e && e.id;
      });
      var n = nativePlugin();
      if (n && n.sync) {
        Promise.resolve(n.sync({ entries: list })).catch(function () {});
        return;
      }
      var keep = Object.create(null);
      list.forEach(function (e) {
        keep[e.id] = true;
        scheduleWeb(e);
      });
      Object.keys(webQueue).forEach(function (id) {
        if (!keep[id]) cancelWeb(id);
      });
    },

    /**
     * Tell the native side "the web app already delivered this one".
     * Prevents a double delivery when the app happens to be open at fire time.
     */
    markApplied: function (id) {
      if (!id) return;
      var n = nativePlugin();
      if (n && n.markApplied) {
        Promise.resolve(n.markApplied({ id: String(id) })).catch(function () {});
      }
    },

    /**
     * Native path: mark the given due entries as fired exactly once (posting a
     * notification) and return everything that has been fired but not yet
     * applied to the chat. Resolves to an array of entries.
     */
    fireAndDrain: function (entries) {
      var n = nativePlugin();
      if (n && n.fireAndDrain) {
        return Promise.resolve(n.fireAndDrain({ entries: entries || [] }))
          .then(function (r) {
            var list = r && r.entries ? r.entries : [];
            return Array.isArray(list) ? list : [];
          })
          .catch(function () {
            return [];
          });
      }
      return Promise.resolve([]);
    },

    /** Messages that fired while the app was closed. Drained (read + cleared) in one call. */
    takeDelivered: function () {
      var n = nativePlugin();
      if (n && n.takeDelivered) {
        return Promise.resolve(n.takeDelivered())
          .then(function (r) {
            var list = r && r.entries ? r.entries : [];
            return Array.isArray(list) ? list : [];
          })
          .catch(function () {
            return [];
          });
      }
      return Promise.resolve([]);
    }
  };

  window.ChatterAlarms = api;

  if (typeof window.addEventListener === "function") {
    window.addEventListener("load", registerServiceWorker, { once: true });
  }
})();
