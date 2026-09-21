'use strict';

(() => {
  const timers = new WeakMap();
  const requests = new WeakMap();
  const focusStorageKey = 'bwtdallas:auto-submit-filter-focus';

  function getForm(control) {
    return control?.closest?.('[data-auto-submit-filter-form]') || null;
  }

  function rememberTextFocus(control) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return;
    if (control instanceof HTMLInputElement && !['search', 'text'].includes(control.type)) return;
    try {
      sessionStorage.setItem(focusStorageKey, JSON.stringify({
        path: window.location.pathname,
        id: control.id || '',
        name: control.name || '',
        start: Number.isInteger(control.selectionStart) ? control.selectionStart : null,
        end: Number.isInteger(control.selectionEnd) ? control.selectionEnd : null
      }));
    } catch (_error) {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  function restoreTextFocus() {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(focusStorageKey) || 'null');
      sessionStorage.removeItem(focusStorageKey);
    } catch (_error) {
      return;
    }
    if (!saved || saved.path !== window.location.pathname) return;
    const form = document.querySelector('[data-auto-submit-filter-form]');
    if (!form) return;
    const control = saved.id
      ? document.getElementById(saved.id)
      : (saved.name ? form.elements.namedItem(saved.name) : null);
    if (!control || !control.matches?.('[data-auto-submit-filter="debounced"]')) return;
    control.focus({ preventScroll: true });
    if (typeof control.setSelectionRange === 'function' && Number.isInteger(saved.start) && Number.isInteger(saved.end)) {
      const max = String(control.value || '').length;
      control.setSelectionRange(Math.min(saved.start, max), Math.min(saved.end, max));
    }
  }

  function buildGetUrl(form) {
    const url = new URL(form.action || window.location.href, window.location.origin);
    const params = new URLSearchParams(new FormData(form));
    url.search = params.toString();
    return url;
  }

  function copySyncedNode(selector, documentSource) {
    if (!selector) return;
    const current = document.querySelector(selector);
    const incoming = documentSource.querySelector(selector);
    if (!current || !incoming) return;
    current.replaceWith(incoming);
  }

  async function submitFragmentForm(form) {
    const targetSelector = String(form.dataset.autoSubmitFilterTarget || '').trim();
    if (!targetSelector) return false;

    requests.get(form)?.abort();
    const controller = new AbortController();
    requests.set(form, controller);
    const url = buildGetUrl(form);
    form.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Filter results could not be refreshed.');
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const currentTarget = document.querySelector(targetSelector);
      const incomingTarget = parsed.querySelector(targetSelector);
      if (!currentTarget || !incomingTarget) throw new Error('Filter results could not be refreshed.');
      currentTarget.replaceWith(incomingTarget);
      window.htmx?.process?.(incomingTarget);

      const syncSelector = String(form.dataset.autoSubmitFilterSync || '').trim();
      if (syncSelector) copySyncedNode(syncSelector, parsed);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${window.location.hash || ''}`);
      document.dispatchEvent(new CustomEvent('bwtdallas:filter-fragment-updated', {
        detail: { form, target: incomingTarget, url: url.toString() }
      }));
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return true;
      // Fall back to a normal GET only if the in-place refresh itself failed.
      rememberTextFocus(form.querySelector('[data-auto-submit-filter="debounced"]:focus'));
      window.location.assign(url.toString());
      return true;
    } finally {
      if (requests.get(form) === controller) requests.delete(form);
      form.removeAttribute('aria-busy');
    }
  }

  function submitForm(form, sourceControl = null) {
    if (!form) return;
    if (form.dataset.autoSubmitFilterTarget) {
      void submitFragmentForm(form);
      return;
    }
    if (form.dataset.autoSubmitFilterSubmitting === 'true') return;
    if (sourceControl?.matches?.('[data-auto-submit-filter="debounced"]')) rememberTextFocus(sourceControl);
    form.dataset.autoSubmitFilterSubmitting = 'true';
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

  function queueSubmit(control) {
    const form = getForm(control);
    if (!form) return;
    const priorTimer = timers.get(form);
    if (priorTimer) window.clearTimeout(priorTimer);
    const configuredDelay = Number(control.dataset.autoSubmitDelay || form.dataset.autoSubmitDelay || 300);
    const delay = Number.isFinite(configuredDelay) ? Math.max(100, Math.min(1500, configuredDelay)) : 300;
    timers.set(form, window.setTimeout(() => {
      timers.delete(form);
      submitForm(form, control);
    }, delay));
  }

  document.addEventListener('input', (event) => {
    const control = event.target.closest?.('[data-auto-submit-filter="debounced"]');
    if (!control) return;
    queueSubmit(control);
  });

  document.addEventListener('change', (event) => {
    const control = event.target.closest?.('[data-auto-submit-filter="immediate"]');
    if (!control) return;
    const form = getForm(control);
    if (!form) return;
    const priorTimer = timers.get(form);
    if (priorTimer) {
      window.clearTimeout(priorTimer);
      timers.delete(form);
    }
    submitForm(form, control);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest?.('[data-auto-submit-filter-form]');
    if (!form) return;
    const priorTimer = timers.get(form);
    if (priorTimer) {
      window.clearTimeout(priorTimer);
      timers.delete(form);
    }
    if (form.dataset.autoSubmitFilterTarget) {
      event.preventDefault();
      void submitFragmentForm(form);
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreTextFocus, { once: true });
  else restoreTextFocus();
})();
