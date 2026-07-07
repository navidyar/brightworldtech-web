(function () {
  const modalRoot = document.getElementById('modal-root');

  function syncModalPageState() {
    const hasOpenModal = Boolean(modalRoot && modalRoot.querySelector('[data-modal-backdrop]'));

    document.documentElement.classList.toggle('modal-open', hasOpenModal);
    document.body.classList.toggle('modal-open', hasOpenModal);
  }

  function closeModal() {
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }

    syncModalPageState();
  }

  if (modalRoot) {
    const modalRootObserver = new MutationObserver(syncModalPageState);
    modalRootObserver.observe(modalRoot, { childList: true });
  }

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
