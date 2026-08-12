(function () {
  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';

    document.body.append(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      return true;
    } finally {
      textarea.remove();
    }
  }

  async function copyText(text) {
    if (!text) {
      return false;
    }

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    return fallbackCopy(text);
  }

  function setButtonState(button, state) {
    const label = button.querySelector('[data-copy-button-label]');

    if (!label) {
      return;
    }

    if (state === 'copied') {
      label.textContent = 'Copied';
      button.classList.add('is-copied');
      return;
    }

    if (state === 'error') {
      label.textContent = 'Copy Failed';
      button.classList.add('is-error');
      return;
    }

    if (button.disabled) {
      label.textContent = 'Expired';
      return;
    }

    label.textContent = 'Copy';
    button.classList.remove('is-copied', 'is-error');
  }

  function refreshGeneratedLinkExpiry() {
    const expiryPanel = document.querySelector('[data-generated-link-expiry]');

    if (!expiryPanel) {
      return;
    }

    const expiresAtRaw = expiryPanel.getAttribute('data-expires-at');
    const expiryDisplay = expiryPanel.getAttribute('data-expiry-display') || '';
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || Date.now() < expiresAt.getTime()) {
      return;
    }

    const label = expiryPanel.querySelector('[data-generated-link-expiry-label]');
    const note = document.querySelector('[data-generated-link-expiry-note]');
    const copyButton = document.querySelector('[data-copy-button]');

    expiryPanel.classList.add('is-expired');

    if (label) {
      label.textContent = 'Expired';
    }

    if (note) {
      note.innerHTML = `This link expired at <strong>${expiryDisplay || expiresAt.toLocaleString()}</strong>. Generate a new link before sharing it.`;
    }

    if (copyButton) {
      copyButton.disabled = true;
      copyButton.setAttribute('aria-disabled', 'true');
      setButtonState(copyButton, 'default');
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-button]');

    if (!button || button.disabled) {
      return;
    }

    const text = button.getAttribute('data-copy-text') || '';

    try {
      const copied = await copyText(text);

      setButtonState(button, copied ? 'copied' : 'error');
    } catch (error) {
      console.error('Copy failed:', error);
      setButtonState(button, 'error');
    }

    window.setTimeout(() => {
      setButtonState(button, 'default');
    }, 1800);
  });

  document.addEventListener('DOMContentLoaded', refreshGeneratedLinkExpiry);
  window.setInterval(refreshGeneratedLinkExpiry, 30000);
})();
