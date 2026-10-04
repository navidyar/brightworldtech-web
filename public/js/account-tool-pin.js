(() => {
  'use strict';

  const root = document.getElementById('account-modal-root');
  if (!root) return;

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  let opener = null;

  function getDialog() {
    return root.querySelector('[role="dialog"], [role="alertdialog"]');
  }

  function isOpen() {
    return Boolean(root.querySelector('[data-account-tool-pin-backdrop]'));
  }

  function syncState() {
    const open = isOpen();
    const pageModalOpen = Boolean(document.getElementById('modal-root')?.querySelector('[data-modal-backdrop]'));
    document.documentElement.classList.toggle('account-tool-pin-open', open);
    document.body.classList.toggle('account-tool-pin-open', open);
    document.documentElement.classList.toggle('modal-open', open || pageModalOpen);
    document.body.classList.toggle('modal-open', open || pageModalOpen);
    if (!open) return;
    window.requestAnimationFrame(() => {
      const dialog = getDialog();
      const initial = dialog?.querySelector('[data-account-tool-pin-initial-focus]');
      if (initial && typeof initial.focus === 'function') initial.focus({ preventScroll: true });
      else if (dialog && typeof dialog.focus === 'function') {
        if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
        dialog.focus({ preventScroll: true });
      }
    });
  }

  function close() {
    root.innerHTML = '';
    syncState();
    if (opener?.isConnected && typeof opener.focus === 'function') {
      window.requestAnimationFrame(() => opener.focus({ preventScroll: true }));
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = getDialog();
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll(focusableSelector)]
      .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-account-tool-pin-trigger]');
    if (trigger) opener = trigger;

    if (event.target.closest('[data-account-tool-pin-close]')) {
      close();
      return;
    }

    const backdrop = event.target.closest('[data-account-tool-pin-backdrop]');
    if (backdrop && event.target === backdrop) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    trapFocus(event);
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    if (event.target === root) syncState();
  });

  new MutationObserver(syncState).observe(root, { childList: true });
})();
