(function () {
  function closeModal() {
    const modalRoot = document.getElementById('modal-root');

    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) {
      closeModal();
      return;
    }

    const backdrop = event.target.closest('[data-modal-backdrop]');

    if (backdrop && event.target === backdrop) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });

  document.body.addEventListener('unit-saved', () => {
    closeModal();
  });
})();