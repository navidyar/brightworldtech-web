(() => {
  'use strict';

  const EVENT_URL = '/application/events';
  const EVENT_NAME = 'application-change';
  const REFRESH_DELAY_MS = 450;
  const MUTATION_SETTLE_MS = 1500;
  const dirtyForms = new Set();

  let source = null;
  let pendingRefresh = false;
  let refreshTimer = null;
  let mutationSettlesAt = 0;
  let activeTransientEdit = null;

  function getFormMethod(form) {
    return String(form?.method || 'get').trim().toLowerCase();
  }

  function isEditableElement(element) {
    return element instanceof HTMLElement && (
      element.matches('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select')
      || element.isContentEditable
    );
  }

  function getOwningForm(element) {
    return element instanceof HTMLElement ? element.closest('form') : null;
  }

  function pruneDirtyForms() {
    for (const form of dirtyForms) {
      if (!form.isConnected) dirtyForms.delete(form);
    }
  }

  function hasUnsavedMutationForm() {
    pruneDirtyForms();
    return dirtyForms.size > 0;
  }

  function mutationIsSettling() {
    return Date.now() < mutationSettlesAt;
  }

  function hasProtectedInteraction() {
    const modalRoot = document.getElementById('modal-root');
    const hasOpenModal = Boolean(
      (modalRoot && modalRoot.childElementCount > 0)
      || document.querySelector('[data-modal-backdrop]')
    );

    return hasOpenModal
      || Boolean(document.querySelector('[data-virtual-huddle-layer]'))
      || Boolean(document.querySelector('[data-application-unsaved-work="true"]'));
  }

  function canRefreshNow() {
    if (document.visibilityState === 'hidden') return false;
    if (mutationIsSettling()) return false;
    if (hasProtectedInteraction()) return false;
    if (hasUnsavedMutationForm()) return false;
    if (activeTransientEdit?.isConnected) return false;
    return true;
  }

  function clearRefreshTimer() {
    if (!refreshTimer) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function schedulePendingRefresh(delay = REFRESH_DELAY_MS) {
    if (!pendingRefresh || refreshTimer) return;

    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;

      if (!pendingRefresh) return;
      if (!canRefreshNow()) {
        schedulePendingRefresh(MUTATION_SETTLE_MS);
        return;
      }

      pendingRefresh = false;
      window.location.reload();
    }, delay);
  }

  function normalizePositiveUnitId(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function getCurrentUnitPageId() {
    const match = window.location.pathname.match(/^\/tech\/units\/(\d+)(?:\/|$)/);
    return match ? normalizePositiveUnitId(match[1]) : null;
  }

  function unitEventTargetsCurrentPage(scope, unitId) {
    if (scope !== 'units') return true;

    const currentUnitId = getCurrentUnitPageId();
    if (!currentUnitId) return true;

    return normalizePositiveUnitId(unitId) === currentUnitId;
  }

  function hasDedicatedRefreshForScope(scope) {
    if (scope === 'units') {
      return Boolean(document.querySelector('[data-tech-units-refresh-url], [data-tech-unit-detail-refresh-url], [data-tech-qc-summary-refresh-url]'));
    }

    if (scope === 'printers') {
      return Boolean(document.querySelector('#management-printers-live, #tech-printers-live'));
    }

    return false;
  }

  function queueRefresh(event) {
    let payload = {};

    try {
      payload = JSON.parse(event?.data || '{}');
    } catch (_error) {
      // A malformed event should fail safe by refreshing rather than staying stale.
    }

    const scope = payload.scope || 'application';

    if (!unitEventTargetsCurrentPage(scope, payload.unitId)) return;
    if (hasDedicatedRefreshForScope(scope)) return;

    pendingRefresh = true;
    schedulePendingRefresh();
  }

  function markMutationSettling() {
    mutationSettlesAt = Math.max(mutationSettlesAt, Date.now() + MUTATION_SETTLE_MS);
    if (pendingRefresh) {
      clearRefreshTimer();
      schedulePendingRefresh(MUTATION_SETTLE_MS);
    }
  }

  function handleEditableInput(event) {
    const element = event.target;
    if (!isEditableElement(element)) return;

    const form = getOwningForm(element);
    if (form && getFormMethod(form) !== 'get') {
      dirtyForms.add(form);
      return;
    }

    activeTransientEdit = element;
  }

  function handleFocusOut(event) {
    if (event.target === activeTransientEdit) {
      activeTransientEdit = null;
      if (pendingRefresh) schedulePendingRefresh();
    }
  }

  function handleFormSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || getFormMethod(form) === 'get') return;

    dirtyForms.delete(form);
    markMutationSettling();
  }

  function handleHtmxBeforeRequest(event) {
    const method = String(event.detail?.requestConfig?.verb || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      markMutationSettling();
    }
  }

  function handleFormReset(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    dirtyForms.delete(form);
    if (pendingRefresh) schedulePendingRefresh();
  }

  function installFetchMutationTracking() {
    if (typeof window.fetch !== 'function') return;

    const trackedFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const options = args[1] || {};
      const method = String(options.method || (args[0] instanceof Request ? args[0].method : 'GET')).toUpperCase();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        markMutationSettling();
      }

      return trackedFetch(...args);
    };
  }

  function connect() {
    if (!('EventSource' in window) || source) return;

    source = new EventSource(EVENT_URL);
    source.addEventListener(EVENT_NAME, queueRefresh);
  }

  document.addEventListener('input', handleEditableInput, true);
  document.addEventListener('change', handleEditableInput, true);
  document.addEventListener('focusout', handleFocusOut, true);
  document.addEventListener('submit', handleFormSubmit, true);
  document.addEventListener('reset', handleFormReset, true);
  document.addEventListener('htmx:beforeRequest', handleHtmxBeforeRequest);
  document.addEventListener('htmx:afterRequest', () => {
    if (pendingRefresh) schedulePendingRefresh(MUTATION_SETTLE_MS);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pendingRefresh) {
      schedulePendingRefresh();
    }
  });

  window.addEventListener('pagehide', () => {
    source?.close();
    source = null;
  }, { once: true });

  installFetchMutationTracking();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect, { once: true });
  } else {
    connect();
  }
})();
