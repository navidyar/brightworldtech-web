(() => {
  'use strict';

  let eventSource = null;
  let returnState = null;
  let refreshInFlight = false;
  let refreshQueued = false;
  let recipientMutationInFlight = false;
  let huddleChangeQueued = false;

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

  function captureReturnState() {
    if (returnState) return;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selectionStart = activeElement && 'selectionStart' in activeElement ? activeElement.selectionStart : null;
    const selectionEnd = activeElement && 'selectionEnd' in activeElement ? activeElement.selectionEnd : null;
    returnState = {
      activeElement,
      selectionStart,
      selectionEnd,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  }

  function restoreReturnState() {
    if (!returnState) return;
    const state = returnState;
    returnState = null;

    window.requestAnimationFrame(() => {
      window.scrollTo(state.scrollX, state.scrollY);
      if (!state.activeElement?.isConnected || typeof state.activeElement.focus !== 'function') return;
      state.activeElement.focus({ preventScroll: true });
      if (state.selectionStart !== null && typeof state.activeElement.setSelectionRange === 'function') {
        state.activeElement.setSelectionRange(state.selectionStart, state.selectionEnd ?? state.selectionStart);
      }
    });
  }

  function syncPageState() {
    const layer = getLayer();
    const blocking = isBlockingLayer(layer);
    document.documentElement.classList.toggle('virtual-huddle-blocked', blocking);
    document.body?.classList.toggle('virtual-huddle-blocked', blocking);

    if (layer) {
      captureReturnState();
      focusDialog();
      return;
    }

    restoreReturnState();
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

  function handleHuddleChange() {
    if (recipientMutationInFlight) {
      huddleChangeQueued = true;
      return;
    }
    void refreshPresentation();
  }

  async function acknowledge(form) {
    const recipientId = form.dataset.recipientId;
    if (!recipientId) return;
    showFormError(form, '');

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    recipientMutationInFlight = true;
    let saved = false;
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
      saved = true;
    } catch (error) {
      showFormError(form, 'The acknowledgment could not be saved. Check the connection and try again.');
    } finally {
      recipientMutationInFlight = false;
      if (button?.isConnected) button.disabled = false;
    }

    if (saved) {
      huddleChangeQueued = false;
      await refreshPresentation();
    } else if (huddleChangeQueued) {
      huddleChangeQueued = false;
      void refreshPresentation();
    }
  }

  async function dismiss(recipientId) {
    if (!recipientId) return;
    recipientMutationInFlight = true;
    let dismissed = false;
    try {
      const response = await fetch(`/virtual-huddle/recipients/${encodeURIComponent(recipientId)}/dismiss`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      dismissed = response.ok;
    } catch (error) {
      // Leave the dialog visible when dismissal cannot be persisted.
    } finally {
      recipientMutationInFlight = false;
    }

    if (dismissed) {
      huddleChangeQueued = false;
      await refreshPresentation();
    } else if (huddleChangeQueued) {
      huddleChangeQueued = false;
      void refreshPresentation();
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
    eventSource.addEventListener('virtual-huddle-change', handleHuddleChange);
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
