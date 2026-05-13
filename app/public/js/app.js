function refreshUnitsTable() {
  const searchForm = document.getElementById('search-form');

  if (searchForm) {
    searchForm.requestSubmit();
  }
}

function resetPageToFirst() {
  const pageInput = document.getElementById('page-input');

  if (pageInput) {
    pageInput.value = '1';
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);

  if (!modal) {
    return;
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);

  if (!modal) {
    return;
  }

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

function loadModalForm(button) {
  const modalId = button.dataset.openModal;
  const formUrl = button.dataset.formUrl || '/units/form';
  const unitId = button.dataset.id;
  const modalContent = document.getElementById('unit-modal-content');

  if (!modalContent) {
    return;
  }

  let url = formUrl;

  if (unitId) {
    url = `${formUrl}?id=${encodeURIComponent(unitId)}`;
  }

  openModal(modalId);

  htmx.ajax('GET', url, {
    target: '#unit-modal-content',
    swap: 'innerHTML'
  });
}

function handleSuccessfulUnitSave() {
  closeModal('unit-modal');
  refreshUnitsTable();
}

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const categorySelect = document.getElementById('category-select');
  const sortSelect = document.getElementById('sort-select');
  const pageSizeSelect = document.getElementById('page-size-select');
  const clearButton = document.getElementById('clear-search');

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
      }

      if (categorySelect) {
        categorySelect.value = '';
      }

      if (sortSelect) {
        sortSelect.value = 'newest';
      }

      if (pageSizeSelect) {
        pageSizeSelect.value = '50';
      }

      resetPageToFirst();
      refreshUnitsTable();

      if (searchInput) {
        searchInput.focus();
      }
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      resetPageToFirst();
      refreshUnitsTable();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      resetPageToFirst();
      refreshUnitsTable();
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      resetPageToFirst();
      refreshUnitsTable();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      resetPageToFirst();
    });
  }

  document.body.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-modal]');
    const closeButton = event.target.closest('[data-close-modal]');
    const modalBackdrop = event.target.classList.contains('modal-backdrop')
      ? event.target
      : null;

    if (openButton) {
      loadModalForm(openButton);
      return;
    }

    if (closeButton) {
      closeModal(closeButton.dataset.closeModal);
      return;
    }

    if (modalBackdrop) {
      closeModal(modalBackdrop.id);
    }
  });

  document.body.addEventListener('unit-saved', () => {
    handleSuccessfulUnitSave();
  });

  document.addEventListener('unit-saved', () => {
    handleSuccessfulUnitSave();
  });

  document.body.addEventListener('htmx:beforeRequest', (event) => {
    const form = event.target.closest ? event.target.closest('#unit-form') : null;

    if (!form) {
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent;
      submitButton.textContent = 'Saving...';
    }
  });

  document.body.addEventListener('htmx:afterRequest', (event) => {
    const requestElement = event.detail && event.detail.elt;
    const isUnitFormRequest = requestElement && requestElement.id === 'unit-form';

    if (!isUnitFormRequest) {
      return;
    }

    const status = event.detail.xhr.status;

    if (status >= 200 && status < 300) {
      handleSuccessfulUnitSave();
      return;
    }

    const submitButton = document.querySelector('#unit-form button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = submitButton.dataset.originalText || 'Save';
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal('unit-modal');
    }
  });
});