/* Service worker: รับ push แล้วแสดง notification, กดแล้วเปิดหน้าที่เกี่ยวข้อง */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "CBooking", body: "", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch { data.body = event.data ? event.data.text() : ""; }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/apple-icon.png",
      badge: "/apple-icon.png",
      tag: data.tag || "cbooking",
      renotify: true,
      requireInteraction: data.tag === "pay",
      data: { url: data.url || "/" },
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});
