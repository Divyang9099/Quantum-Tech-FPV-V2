// Live updates over Socket.IO. Falls back to polling every 20 s if the socket is not available.
(function () {
  window.live = function (handlers, { poll } = {}) {
    let connected = false;
    if (window.io) {
      const s = io(QT.API, { transports: ['websocket', 'polling'] });
      s.on('connect', () => { connected = true; handlers.onConnect && handlers.onConnect(s); });
      s.on('disconnect', () => { connected = false; });
      Object.entries(handlers).forEach(([ev, fn]) => { if (ev.includes('.')) s.on(ev, fn); });
    }
    if (poll) setInterval(() => { if (!connected) poll(); }, 20000);
  };
})();
