/* ============================================================
   Loveway — service worker (sirf push notifications ke liye)
   ------------------------------------------------------------
   Ye file JAAN-BOOJH KAR kuch cache nahi karti.

   Offline caching add karna lubhavna lagta hai, par is site par wo
   ulta padta: 29 alag HTML page hain aur sab ek hi lw-core/lw-app par
   chalte hain. Ek bhi purani file cache me atak gayi to user ko aisa
   mila-jula version milta hai jo kahin test hi nahi hua — aur usse
   nikalne ka koi aasan tarika nahi hota (ctrl-refresh se bhi nahi).
   Cache-busting pehle se ?v=N query se hota hai; service worker usme
   sirf gadbad karega.

   Isliye yahan sirf do event hain: push aana, aur push par click.
   ============================================================ */

// Naya SW turant chaalu ho — purana wala intezaar na karwaye
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // payload JSON na ho to bhi kuch to dikhao — chup rehna sabse bura
    data = { title: 'Loveway', body: event.data ? event.data.text() : '' };
  }

  var title = data.title || 'Loveway';
  var opts = {
    body: data.body || '',
    icon: data.icon || 'logo.png',
    badge: data.icon || 'logo.png',
    // tag se ek hi notification do baar nahi dikhti (do device/tab par bhi)
    tag: data.tag || ('lw-' + (data.id || Date.now())),
    data: { link: data.link || 'notifications.html' },
    renotify: false
  };

  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var link = (event.notification.data && event.notification.data.link) || 'notifications.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      // Loveway pehle se kisi tab me khula ho to wahi tab use karo —
      // har notification par nayi tab kholna user ko pareshaan karta hai
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
          c.navigate(new URL(link, self.registration.scope).href);
          return c.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL(link, self.registration.scope).href);
      }
    })
  );
});
