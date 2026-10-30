// Service worker of Meu Finan (doc 01 §10): shows Web Push notifications and
// keeps the number on the app icon. The server sends a PushMessage
// (src/lib/push/subscription.ts) as JSON. No fetch handler: offline caching
// is not here yet, so every request still goes to the network as before.
//
// Served from /sw.js with no-cache (next.config.ts) and registered with
// updateViaCache "none", so a new version takes over on the next page load.

const FALLBACK = {
  title: "Meu Finan",
  body: "Você tem um aviso novo.",
  url: "/inicio",
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** A path inside the app, never another origin. Same rule as isAppPath. */
function isAppPath(path) {
  return typeof path === "string" && /^\/(?![/\\])/.test(path);
}

function readMessage(data) {
  try {
    const message = data ? data.json() : null;
    if (message && typeof message.title === "string") return message;
  } catch {
    // Not JSON: show the fallback rather than nothing.
  }
  return null;
}

async function setBadge(count) {
  const worker = self.navigator;
  if (typeof count !== "number" || !("setAppBadge" in worker)) return;
  try {
    if (count > 0) await worker.setAppBadge(count);
    else await worker.clearAppBadge();
  } catch {
    // Badges are a nicety: never lose the notification over one.
  }
}

self.addEventListener("push", (event) => {
  // Every push must show a notification: Safari stops delivering to sites
  // whose pushes show nothing.
  const message = readMessage(event.data) ?? FALLBACK;
  const options = {
    body: typeof message.body === "string" ? message.body : "",
    icon: "/icons/192.png",
    data: { url: isAppPath(message.url) ? message.url : FALLBACK.url },
  };
  if (typeof message.tag === "string" && message.tag) {
    options.tag = message.tag;
    options.renotify = true;
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(message.title, options),
      setBadge(message.badge),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const url = new URL(isAppPath(path) ? path : FALLBACK.url, self.location)
    .href;
  event.waitUntil(openApp(url));
});

/** Brings an open window of the app forward on that page, or opens one. */
async function openApp(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of windows) {
    try {
      const focused = await client.focus();
      await focused.navigate(url);
      return;
    } catch {
      // Not controlled by this worker yet: open a new window below.
    }
  }
  await self.clients.openWindow(url);
}
