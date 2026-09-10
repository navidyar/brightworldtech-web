(() => {
  'use strict';

  const EVENT_NAME = 'label-printer-registry-changed';

  function connect() {
    if (!window.EventSource || !document.body) return;

    const source = new EventSource('/label-printers/events');
    source.addEventListener(EVENT_NAME, () => {
      document.body.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { remote: true } }));
    });

    window.addEventListener('pagehide', () => source.close(), { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect, { once: true });
  } else {
    connect();
  }
})();
