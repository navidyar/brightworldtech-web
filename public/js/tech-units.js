(function () {
  function setPanel(detailRow, panelName) {
    if (!detailRow) {
      return;
    }

    const normalizedPanelName = panelName === 'history' ? 'history' : 'details';

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

  document.addEventListener('click', (event) => {
    const panelButton = event.target.closest('[data-unit-panel-button]');

    if (panelButton) {
      const targetId = panelButton.getAttribute('data-target');
      const detailRow = targetId ? document.getElementById(targetId) : panelButton.closest('.tech-detail-row');
      const panelName = panelButton.getAttribute('data-panel');

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

  document.body.addEventListener('unit-saved', () => {
    closeOtherRows(null);
  });

  document.body.addEventListener('unit-deleted', () => {
    closeModalRoot();
    closeOtherRows(null);
  });
})();
