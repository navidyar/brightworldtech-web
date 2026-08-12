(function () {
  function formatExpiry(date) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return date.toLocaleString();
    }
  }

  function refreshStatus(element) {
    const expiresAtRaw = element.getAttribute('data-password-link-expires-at');
    const currentStatus = element.getAttribute('data-password-link-status') || '';
    const linkType = element.getAttribute('data-password-link-type') === 'password_reset' ? 'Reset link' : 'Setup link';
    const expiryDisplay = element.getAttribute('data-password-link-expiry-display') || '';
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return;
    }

    if (currentStatus === 'used') {
      element.textContent = `${linkType} used`;
      element.classList.remove('is-active', 'is-expired');
      return;
    }

    if (currentStatus === 'revoked') {
      element.textContent = `${linkType} revoked`;
      element.classList.remove('is-active', 'is-expired');
      return;
    }

    if (Date.now() >= expiresAt.getTime()) {
      element.textContent = `${linkType} expired ${expiryDisplay || formatExpiry(expiresAt)}`;
      element.setAttribute('data-password-link-status', 'expired');
      element.classList.remove('is-active');
      element.classList.add('is-expired');
      return;
    }

    element.textContent = `${linkType} expires ${expiryDisplay || formatExpiry(expiresAt)}`;
    element.setAttribute('data-password-link-status', 'active');
    element.classList.remove('is-expired');
    element.classList.add('is-active');
  }

  function refreshAll() {
    document.querySelectorAll('[data-password-link-expires-at]').forEach(refreshStatus);
  }

  document.addEventListener('DOMContentLoaded', refreshAll);
  window.setInterval(refreshAll, 30000);
})();
