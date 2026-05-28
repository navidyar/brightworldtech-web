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

    label.textContent = 'Copy';
    button.classList.remove('is-copied', 'is-error');
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy-button]');

    if (!button) {
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
})();