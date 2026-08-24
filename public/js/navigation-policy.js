(() => {
  'use strict';

  const GUARD_KEY = '__bwtdallasNavigationGuard';
  const APP_STATE_KEY = '__bwtdallasAppPage';
  const SESSION_EXPIRES_HEADER = 'X-BWTDallas-Session-Expires-At';
  const SESSION_ENDED_URL = '/login?session=expired';
  const SESSION_EXPIRY_GRACE_MS = 250;
  const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  const scriptElement = document.currentScript;
  let restoringGuard = false;
  let sessionExpiryTimer = null;
  let sessionEnding = false;

  function sameOriginUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.origin === window.location.origin ? url : null;
    } catch (error) {
      return null;
    }
  }

  function isModifiedClick(event) {
    return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  }

  function hasHtmxNavigation(element) {
    if (!(element instanceof Element)) return false;
    return Array.from(element.attributes || []).some((attribute) => attribute.name.startsWith('hx-'));
  }

  function isApplicationHandledAnchor(anchor) {
    return Boolean(anchor && (
      anchor.hasAttribute('data-tech-modal-trigger')
      || anchor.hasAttribute('data-modal-trigger')
      || anchor.hasAttribute('data-processor-catalog-modal-url')
      || anchor.hasAttribute('data-unit-request-detail-link')
    ));
  }

  function shouldReplaceAnchorNavigation(anchor, event) {
    if (!anchor || isModifiedClick(event) || event.defaultPrevented) return false;
    if (anchor.hasAttribute('download') || anchor.dataset.historyAllow === 'true') return false;
    if (anchor.target && anchor.target.toLowerCase() !== '_self') return false;
    if (hasHtmxNavigation(anchor) || isApplicationHandledAnchor(anchor)) return false;

    const url = sameOriginUrl(anchor.href);
    if (!url || !['http:', 'https:'].includes(url.protocol)) return false;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;

    return true;
  }

  function replaceAnchorNavigation(event) {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!shouldReplaceAnchorNavigation(anchor, event)) return;

    const url = sameOriginUrl(anchor.href);
    if (!url) return;

    event.preventDefault();
    window.location.replace(url.href);
  }

  function shouldReplaceGetForm(form) {
    if (!(form instanceof HTMLFormElement) || form.dataset.historyAllow === 'true') return false;
    if ((form.target || '').toLowerCase() && (form.target || '').toLowerCase() !== '_self') return false;
    if (hasHtmxNavigation(form)) return false;

    const method = String(form.method || 'get').toLowerCase();
    if (method !== 'get') return false;

    return Boolean(sameOriginUrl(form.action || window.location.href));
  }

  function replaceGetFormNavigation(event) {
    const form = event.target;
    if (event.defaultPrevented || !shouldReplaceGetForm(form)) return;

    const action = sameOriginUrl(form.action || window.location.href);
    if (!action) return;

    const formData = new FormData(form, event.submitter || undefined);
    const params = new URLSearchParams();
    for (const [name, value] of formData.entries()) {
      if (typeof value === 'string') params.append(name, value);
    }

    action.search = params.toString();
    event.preventDefault();
    window.location.replace(action.href);
  }

  function installHistoryGuard() {
    const currentState = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...currentState, [APP_STATE_KEY]: true }, '', window.location.href);
    history.pushState({ [GUARD_KEY]: true, [APP_STATE_KEY]: true }, '', window.location.href);
  }

  function restoreHistoryGuard() {
    if (restoringGuard || sessionEnding) return;
    restoringGuard = true;

    history.pushState({ [GUARD_KEY]: true, [APP_STATE_KEY]: true }, '', window.location.href);

    window.setTimeout(() => {
      restoringGuard = false;
    }, 0);
  }

  function isLoginResponseUrl(value) {
    const url = sameOriginUrl(value);
    return Boolean(url && url.pathname === '/login');
  }

  function endExpiredSession() {
    if (sessionEnding) return;
    sessionEnding = true;

    if (sessionExpiryTimer) {
      window.clearTimeout(sessionExpiryTimer);
      sessionExpiryTimer = null;
    }

    const redirectToLogin = () => window.location.replace(SESSION_ENDED_URL);

    if (!nativeFetch) {
      redirectToLogin();
      return;
    }

    nativeFetch('/logout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true
    }).catch(() => {}).finally(redirectToLogin);
  }

  function scheduleSessionExpiry(value) {
    const expiresAt = Number(value);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0 || sessionEnding) return;

    if (sessionExpiryTimer) {
      window.clearTimeout(sessionExpiryTimer);
    }

    const delay = Math.max(0, expiresAt - Date.now() + SESSION_EXPIRY_GRACE_MS);
    sessionExpiryTimer = window.setTimeout(endExpiredSession, delay);
  }

  function refreshSessionExpiryFromHeader(getHeader) {
    if (typeof getHeader !== 'function') return;
    const value = getHeader(SESSION_EXPIRES_HEADER);
    if (value) scheduleSessionExpiry(value);
  }

  function handleFetchResponse(response) {
    if (!response) return;

    refreshSessionExpiryFromHeader((name) => response.headers?.get(name));

    if (response.redirected && isLoginResponseUrl(response.url)) {
      endExpiredSession();
    }
  }

  function installFetchSessionTracking() {
    if (!nativeFetch) return;

    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      handleFetchResponse(response);
      return response;
    };
  }

  function getHtmxXhr(event) {
    return event?.detail?.xhr || null;
  }

  function handleHtmxBeforeSwap(event) {
    const xhr = getHtmxXhr(event);
    if (!xhr || !isLoginResponseUrl(xhr.responseURL)) return;

    if (event.detail) {
      event.detail.shouldSwap = false;
    }

    endExpiredSession();
  }

  function handleHtmxAfterRequest(event) {
    const xhr = getHtmxXhr(event);
    if (!xhr) return;

    refreshSessionExpiryFromHeader((name) => xhr.getResponseHeader(name));

    if (isLoginResponseUrl(xhr.responseURL)) {
      endExpiredSession();
    }
  }

  window.addEventListener('popstate', restoreHistoryGuard);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      window.location.reload();
    }
  });

  document.addEventListener('click', replaceAnchorNavigation);
  document.addEventListener('submit', replaceGetFormNavigation);
  document.addEventListener('htmx:beforeSwap', handleHtmxBeforeSwap);
  document.addEventListener('htmx:afterRequest', handleHtmxAfterRequest);

  installFetchSessionTracking();
  installHistoryGuard();
  scheduleSessionExpiry(scriptElement?.dataset?.sessionExpiresAt);
})();
