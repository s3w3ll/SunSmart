self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : { title: '☀️ UV Alert', body: 'UV has risen above 3.' };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'uv-alert',
      renotify: true,
    })
  );
});
