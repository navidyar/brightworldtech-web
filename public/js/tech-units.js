(function () {
  function normalizePanelName(panelName) {
    return ['history', 'my-weight'].includes(panelName) ? panelName : 'details';
  }

  function setPanel(detailRow, panelName) {
    if (!detailRow) {
      return;
    }

    const normalizedPanelName = normalizePanelName(panelName);

    detailRow.querySelectorAll('[data-unit-panel-content]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-unit-panel-content') !== normalizedPanelName;
    });

    detailRow.querySelectorAll('[data-unit-panel-button]').forEach((button) => {
      const isActive = button.getAttribute('data-panel') === normalizedPanelName;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setSummaryToggleExpanded(targetId, isExpanded) {
    if (!targetId) {
      return;
    }

    document.querySelectorAll('[data-unit-detail-toggle]').forEach((button) => {
      if (button.getAttribute('data-target') === targetId) {
        button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      }
    });
  }

  function closeOtherRows(currentRow) {
    document.querySelectorAll('.tech-detail-row:not([hidden])').forEach((row) => {
      if (row !== currentRow) {
        row.hidden = true;
        setPanel(row, 'details');
      }
    });

    document.querySelectorAll('[data-unit-detail-toggle][aria-expanded="true"]').forEach((button) => {
      const targetId = button.getAttribute('data-target');

      if (!currentRow || targetId !== currentRow.id) {
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function isPanelOpen(detailRow, panelName) {
    if (!detailRow || detailRow.hidden) {
      return false;
    }

    const normalizedPanelName = normalizePanelName(panelName);
    const activePanel = detailRow.querySelector(`[data-unit-panel-content="${normalizedPanelName}"]`);

    return Boolean(activePanel && !activePanel.hidden);
  }

  function hideDetailRow(detailRow) {
    if (!detailRow) {
      return;
    }

    detailRow.hidden = true;
    setSummaryToggleExpanded(detailRow.id, false);
    setPanel(detailRow, 'details');
  }

  function showDetailRow(detailRow, panelName) {
    if (!detailRow) {
      return;
    }

    closeOtherRows(detailRow);
    detailRow.hidden = false;
    setSummaryToggleExpanded(detailRow.id, true);
    setPanel(detailRow, panelName || 'details');
  }

  function toggleDetailRow(toggle) {
    if (!toggle) {
      return;
    }

    const targetId = toggle.getAttribute('data-target');
    const targetRow = document.getElementById(targetId);

    if (!targetRow) {
      return;
    }

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      targetRow.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      setPanel(targetRow, 'details');
      return;
    }

    closeOtherRows(targetRow);
    targetRow.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    setPanel(targetRow, 'details');
  }

  function shouldIgnoreSummaryRowClick(event) {
    return Boolean(
      event.target.closest(
        'a, button, input, select, textarea, label, summary, [role="button"], [data-no-row-toggle]'
      )
    );
  }

  function closeModalRoot() {
    const modalRoot = document.getElementById('modal-root');

    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
  }


  function showModalRequestError(message) {
    const modalRoot = document.getElementById('modal-root');

    if (!modalRoot) {
      return;
    }

    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="tech-modal-request-error-title">
          <div class="modal-header">
            <div>
              <p class="eyebrow">Unit Action</p>
              <h2 id="tech-modal-request-error-title">Action could not be opened</h2>
            </div>
            <button type="button" class="modal-close" data-modal-close aria-label="Close modal">×</button>
          </div>
          <div class="modal-body">
            <div class="message error">
              <p>${message}</p>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function openTechModal(trigger) {
    const url = trigger.getAttribute('href');

    if (!url) {
      return;
    }

    if (window.htmx && typeof window.htmx.ajax === 'function') {
      window.htmx.ajax('GET', url, {
        target: '#modal-root',
        swap: 'innerHTML'
      });
      return;
    }

    window.location.assign(url);
  }

  document.addEventListener('input', (event) => {
    const confirmationInput = event.target.closest('[data-permanent-delete-confirmation]');

    if (!confirmationInput) {
      return;
    }

    const confirmationForm = confirmationInput.closest('[data-permanent-delete-form]');

    if (!confirmationForm) {
      return;
    }

    const submitButton = confirmationForm.querySelector('[data-permanent-delete-submit]');

    if (!submitButton) {
      return;
    }

    submitButton.disabled = confirmationInput.value.trim() !== 'DELETE';
  });

  document.addEventListener('click', (event) => {
    const modalTrigger = event.target.closest('[data-tech-modal-trigger]');

    if (modalTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openTechModal(modalTrigger);
      return;
    }

    const panelButton = event.target.closest('[data-unit-panel-button]');

    if (panelButton) {
      const targetId = panelButton.getAttribute('data-target');
      const detailRow = targetId ? document.getElementById(targetId) : panelButton.closest('.tech-detail-row');
      const panelName = panelButton.getAttribute('data-panel');

      if (isPanelOpen(detailRow, panelName)) {
        event.preventDefault();
        event.stopPropagation();
        hideDetailRow(detailRow);
        return;
      }

      showDetailRow(detailRow, panelName);
      return;
    }

    const toggle = event.target.closest('[data-unit-detail-toggle]');

    if (toggle) {
      toggleDetailRow(toggle);
      return;
    }

    const summaryRow = event.target.closest('[data-unit-summary-row]');

    if (!summaryRow || shouldIgnoreSummaryRowClick(event)) {
      return;
    }

    toggleDetailRow(summaryRow.querySelector('[data-unit-detail-toggle]'));
  });

  function submitAutoFilterControl(control) {
    const filterForm = control.closest('.tech-filter-form');

    if (!filterForm || filterForm.dataset.autoFilterSubmitting === 'true') {
      return;
    }

    filterForm.dataset.autoFilterSubmitting = 'true';

    if (typeof filterForm.requestSubmit === 'function') {
      filterForm.requestSubmit();
      return;
    }

    filterForm.submit();
  }

  document.body.addEventListener('change', (event) => {
    const autoFilterControl = event.target.closest('[data-tech-filter-auto-submit]');

    if (!autoFilterControl) {
      return;
    }

    submitAutoFilterControl(autoFilterControl);
  });

  document.body.addEventListener('unit-saved', () => {
    closeOtherRows(null);
  });

  document.body.addEventListener('unit-parked', () => {
    closeModalRoot();
    closeOtherRows(null);
  });

  document.body.addEventListener('unit-returned-active', () => {
    closeModalRoot();
    closeOtherRows(null);
  });

  document.body.addEventListener('unit-permanently-deleted', () => {
    closeModalRoot();
    closeOtherRows(null);
  });

  document.body.addEventListener('unit-work-completed', () => {
    closeOtherRows(null);
  });

  document.body.addEventListener('htmx:responseError', (event) => {
    const sourceElement = event.detail && event.detail.elt ? event.detail.elt : null;

    if (!sourceElement || !sourceElement.closest('[data-tech-modal-trigger]')) {
      return;
    }

    showModalRequestError('The requested unit action could not be opened. Please try again.');
  });

  document.body.addEventListener('htmx:sendError', (event) => {
    const sourceElement = event.detail && event.detail.elt ? event.detail.elt : null;

    if (!sourceElement || !sourceElement.closest('[data-tech-modal-trigger]')) {
      return;
    }

    showModalRequestError('The server could not be reached. Please try again.');
  });
})();
