(function () {
  const modalRoot = document.getElementById('modal-root');
  const focusableSelector = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'details > summary:first-of-type',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  let lastFocusedElement = null;
  let lastFocusedReference = null;
  let modalWasOpen = false;
  let pendingFocusFrame = null;

  function getActiveBackdrop() {
    return modalRoot ? modalRoot.querySelector('[data-modal-backdrop]') : null;
  }

  function getActiveDialog() {
    const backdrop = getActiveBackdrop();
    return backdrop ? backdrop.querySelector('[role="dialog"], [role="alertdialog"]') : null;
  }

  function isFocusable(element) {
    if (!element || typeof element.focus !== 'function') {
      return false;
    }

    if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    return !element.closest('[hidden], [aria-hidden="true"]');
  }

  function getFocusableElements(dialog) {
    return dialog
      ? Array.from(dialog.querySelectorAll(focusableSelector)).filter(isFocusable)
      : [];
  }

  function makeFocusReference(element) {
    if (!element || !(element instanceof Element)) {
      return null;
    }

    return {
      id: element.id || '',
      href: element.getAttribute('href') || '',
      hxGet: element.getAttribute('hx-get') || '',
      modalTrigger: element.hasAttribute('data-tech-modal-trigger')
    };
  }

  function rememberModalOpener(element) {
    if (!element || !(element instanceof Element) || (modalRoot && modalRoot.contains(element))) {
      return;
    }

    lastFocusedElement = element;
    lastFocusedReference = makeFocusReference(element);
  }

  function findReplacementOpener() {
    const reference = lastFocusedReference;

    if (!reference) {
      return null;
    }

    if (reference.id) {
      const byId = document.getElementById(reference.id);
      if (byId) {
        return byId;
      }
    }

    return Array.from(document.querySelectorAll('[data-tech-modal-trigger], [hx-target="#modal-root"]'))
      .find((candidate) => {
        if (reference.href && candidate.getAttribute('href') === reference.href) {
          return true;
        }

        return Boolean(reference.hxGet && candidate.getAttribute('hx-get') === reference.hxGet);
      }) || null;
  }

  function restoreModalFocus() {
    const focusTarget = lastFocusedElement && lastFocusedElement.isConnected
      ? lastFocusedElement
      : findReplacementOpener();

    lastFocusedElement = null;
    lastFocusedReference = null;

    if (focusTarget && typeof focusTarget.focus === 'function') {
      window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  }

  function focusActiveModal() {
    if (pendingFocusFrame) {
      window.cancelAnimationFrame(pendingFocusFrame);
    }

    pendingFocusFrame = window.requestAnimationFrame(() => {
      pendingFocusFrame = null;
      const dialog = getActiveDialog();

      if (!dialog) {
        return;
      }

      if (!dialog.hasAttribute('tabindex')) {
        dialog.setAttribute('tabindex', '-1');
      }

      const initialFocus = dialog.querySelector('[data-modal-initial-focus], [autofocus]');
      const focusTarget = isFocusable(initialFocus)
        ? initialFocus
        : (getFocusableElements(dialog)[0] || dialog);

      focusTarget.focus({ preventScroll: true });
    });
  }

  function syncModalPageState() {
    const hasOpenModal = Boolean(getActiveBackdrop());

    document.documentElement.classList.toggle('modal-open', hasOpenModal);
    document.body.classList.toggle('modal-open', hasOpenModal);

    if (hasOpenModal) {
      focusActiveModal();
    } else if (modalWasOpen) {
      restoreModalFocus();
    }

    modalWasOpen = hasOpenModal;
  }

  function closeModal() {
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }

    syncModalPageState();
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab') {
      return false;
    }

    const dialog = getActiveDialog();

    if (!dialog) {
      return false;
    }

    const focusableElements = getFocusableElements(dialog);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return true;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return true;
    }

    if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
      return true;
    }

    return false;
  }

  if (modalRoot) {
    const modalRootObserver = new MutationObserver(syncModalPageState);
    modalRootObserver.observe(modalRoot, { childList: true });
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-tech-modal-trigger], [data-modal-trigger], [hx-target="#modal-root"]');

    if (opener && !(modalRoot && modalRoot.contains(opener))) {
      rememberModalOpener(opener);
    }
  }, true);

  document.addEventListener('htmx:afterSwap', (event) => {
    if (event.target === modalRoot) {
      syncModalPageState();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
      return;
    }

    const backdrop = event.target.closest('[data-modal-backdrop]');

    if (backdrop && event.target === backdrop && !backdrop.hasAttribute('data-modal-explicit-close')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (trapModalFocus(event)) {
      return;
    }

    if (event.key !== 'Escape') {
      return;
    }

    const explicitCloseModal = modalRoot ? modalRoot.querySelector('[data-modal-explicit-close]') : null;
    const escapeCloseModal = modalRoot
      ? modalRoot.querySelector('[data-modal-explicit-close][data-modal-escape-close]')
      : null;

    if (explicitCloseModal) {
      if (!escapeCloseModal) {
        return;
      }

      const unitFormEscapeEvent = new CustomEvent('tech-unit-form-escape', {
        cancelable: true,
        detail: { modal: escapeCloseModal }
      });

      document.dispatchEvent(unitFormEscapeEvent);

      if (unitFormEscapeEvent.defaultPrevented) {
        return;
      }
    }

    closeModal();
  });

  document.body.addEventListener('unit-saved', () => {
    closeModal();
  });

  syncModalPageState();
})();
