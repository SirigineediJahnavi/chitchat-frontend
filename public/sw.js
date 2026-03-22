// Handle push notifications
self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { 
      title: "New Message", 
      body: event.data.text() 
    };
  }

  const options = {
    body: data.body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "chat-notification", // Prevent duplicate notifications
    requireInteraction: true // Keep notification until user interacts
  };

  self.registration.showNotification(data.title, options);
});

// Handle notification click
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        // Focus existing app window
        return clientList[0].focus();
      }
      // Open new window if none exists
      return clients.openWindow("/");
    })
  );
});
