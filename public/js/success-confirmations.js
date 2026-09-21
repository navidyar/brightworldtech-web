(() => {
  'use strict';

  const DISMISS_MS = 10000;
  const SELECTOR = '[data-auto-dismiss-success]';
  const initialized = new WeakSet();

  function dismiss(message) {
    if (!message || message.hidden) return;
    message.classList.add('site-success-confirmation--dismissing');
    window.setTimeout(() => {
      message.hidden = true;
      message.classList.remove('site-success-confirmation--dismissing');
    }, 160);
  }

  function initialize(message) {
    if (!message || initialized.has(message)) return;
    initialized.add(message);
    message.classList.add('site-success-confirmation');
    message.setAttribute('title', 'Click to dismiss');
    const timer = window.setTimeout(() => dismiss(message), DISMISS_MS);
    message.addEventListener('click', () => {
      window.clearTimeout(timer);
      dismiss(message);
    }, { once: true });
  }

  function scan(root = document) {
    if (root.matches?.(SELECTOR)) initialize(root);
    root.querySelectorAll?.(SELECTOR).forEach(initialize);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  } else {
    scan();
  }

  document.body && new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scan(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
})();
