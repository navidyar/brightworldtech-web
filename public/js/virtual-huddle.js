(() => {
  'use strict';

  let eventSource = null;
  let lastFocusedElement = null;
  let refreshInFlight = false;
  let refreshQueued = false;

  function getRoot() {
    let root = document.getElementById('virtual-huddle-root');
    if (!root && document.body) {
      root = document.createElement('div');
      root.id = 'virtual-huddle-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function getLayer() {
    return getRoot()?.querySelector('[data-virtual-huddle-layer]') || null;
  }

  function isBlockingLayer(layer = getLayer()) {
    return Boolean(layer && layer.dataset.blocking === 'true');
  }

  function focusDialog() {
    const layer = getLayer();
    if (!layer) return;
    const dialog = layer.querySelector('[role="dialog"], [role="alertdialog"]');
    if (!dialog) return;
    const target = dialog.querySelector('input:not([type="hidden"]), textarea, button, a[href]') || dialog;
    window.requestAnimationFrame(() => target.focus?.({ preventScroll: true }));
  }

  function syncPageState() {
    const layer = getLayer();
    const blocking = isBlockingLayer(layer);
    document.documentElement.classList.toggle('virtual-huddle-blocked', blocking);
    document.body?.classList.toggle('virtual-huddle-blocked', blocking);

    if (layer) {
      if (!lastFocusedElement || !lastFocusedElement.isConnected) lastFocusedElement = document.activeElement;
      focusDialog();
      return;
    }

    if (lastFocusedElement?.isConnected && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus({ preventScroll: true });
    }
    lastFocusedElement = null;
  }

  async function refreshPresentation() {
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }
    refreshInFlight = true;
    try {
      const response = await fetch('/virtual-huddle/current', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Requested-With': 'VirtualHuddle' }
      });

      const root = getRoot();
      if (!root) return;

      if (response.status === 204) {
        root.innerHTML = '';
        syncPageState();
        if (window.location.pathname === '/virtual-huddle/required') {
          window.location.replace('/');
        }
        return;
      }

      if (!response.ok) return;
      root.innerHTML = await response.text();
      syncPageState();
    } catch (error) {
      // A disconnected browser will retry through the EventSource and the next page request.
    } finally {
      refreshInFlight = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refreshPresentation();
      }
    }
  }

  function showFormError(form, message) {
    const box = form.querySelector('[data-huddle-error]');
    if (!box) return;
    box.textContent = message;
    box.hidden = !message;
  }

  async function acknowledge(form) {
    const recipientId = form.dataset.recipientId;
    if (!recipientId) return;
    showFormError(form, '');

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const payload = new URLSearchParams(new FormData(form));
      const response = await fetch(`/virtual-huddle/recipients/${encodeURIComponent(recipientId)}/acknowledge`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: payload.toString()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        showFormError(form, data.error || 'The acknowledgment could not be saved.');
        return;
      }
      await refreshPresentation();
    } catch (error) {
      showFormError(form, 'The acknowledgment could not be saved. Check the connection and try again.');
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function dismiss(recipientId) {
    if (!recipientId) return;
    try {
      const response = await fetch(`/virtual-huddle/recipients/${encodeURIComponent(recipientId)}/dismiss`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (response.ok) await refreshPresentation();
    } catch (error) {
      // Leave the dialog visible when dismissal cannot be persisted.
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const layer = getLayer();
    if (!layer) return;
    const dialog = layer.querySelector('[role="dialog"], [role="alertdialog"]');
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.closest('[hidden]'));
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  function connectEvents() {
    if (!('EventSource' in window) || eventSource) return;
    eventSource = new EventSource('/virtual-huddle/events');
    eventSource.addEventListener('virtual-huddle-change', refreshPresentation);
    window.addEventListener('beforeunload', () => {
      eventSource?.close();
      eventSource = null;
    }, { once: true });
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest?.('[data-huddle-ack-form]');
    if (form) {
      event.preventDefault();
      acknowledge(form);
      return;
    }

  });

  document.addEventListener('click', (event) => {
    const dismissButton = event.target.closest?.('[data-huddle-dismiss]');
    if (!dismissButton) return;
    event.preventDefault();
    dismiss(dismissButton.dataset.huddleDismiss);
  });

  document.addEventListener('keydown', (event) => {
    trapFocus(event);
    if (event.key === 'Escape' && getLayer()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  function start() {
    getRoot();
    syncPageState();
    refreshPresentation();
    connectEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
