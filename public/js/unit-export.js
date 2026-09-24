(function () {
  'use strict';

  const {
    getUnitExportModal,
    getSelectedUnitExportColumnKeys,
    initializeUnitExportTableScroll,
    updateUnitExportSelection,
    setAllUnitExportColumns
  } = window.BWTUnitExport;

  function getSelectedLotExportScopeIds(modal) {
    return Array.from(modal ? modal.querySelectorAll('[data-lot-export-scope-option]:checked') : [])
      .map((checkbox) => Number(checkbox.value))
      .filter((lotId) => Number.isSafeInteger(lotId) && lotId > 0);
  }

  function refreshLotExportScope(modal, changedCheckbox) {
    if (!modal) {
      return;
    }

    const scopeContainer = modal.querySelector('[data-lot-export-scope-options]');
    const message = modal.querySelector('[data-lot-export-scope-message]');
    let selectedLotIds = getSelectedLotExportScopeIds(modal);

    if (selectedLotIds.length === 0 && changedCheckbox) {
      changedCheckbox.checked = true;
      selectedLotIds = getSelectedLotExportScopeIds(modal);

      if (message) {
        message.textContent = 'Select at least one Lot or child branch for the export.';
        message.classList.add('is-error');
      }

      return;
    }

    if (message) {
      message.textContent = '';
      message.classList.remove('is-error');
    }

    const previewUrl = String(scopeContainer?.getAttribute('data-preview-url') || '').trim();

    if (!previewUrl || !window.htmx || typeof window.htmx.ajax !== 'function') {
      return;
    }

    const url = new URL(previewUrl, window.location.href);
    url.searchParams.delete('lotIds');
    selectedLotIds.forEach((lotId) => url.searchParams.append('lotIds', String(lotId)));

    const selectedColumnKeys = getSelectedUnitExportColumnKeys(modal);
    if (selectedColumnKeys.length > 0) {
      url.searchParams.set('columns', selectedColumnKeys.join(','));
    }

    window.htmx.ajax('GET', `${url.pathname}${url.search}`, {
      target: '#modal-root',
      swap: 'innerHTML'
    });
  }

  document.addEventListener('change', (event) => {
    const lotExportScopeOption = event.target.closest('[data-lot-export-scope-option]');

    if (lotExportScopeOption) {
      refreshLotExportScope(getUnitExportModal(lotExportScopeOption), lotExportScopeOption);
      return;
    }

    const exportColumn = event.target.closest('[data-unit-export-column]');

    if (!exportColumn) {
      return;
    }

    updateUnitExportSelection(getUnitExportModal(exportColumn));
  });

  document.addEventListener('click', (event) => {
    const selectAllExportColumns = event.target.closest('[data-unit-export-select-all]');

    if (selectAllExportColumns) {
      event.preventDefault();
      setAllUnitExportColumns(getUnitExportModal(selectAllExportColumns), true);
      return;
    }

    const clearAllExportColumns = event.target.closest('[data-unit-export-clear-all]');

    if (clearAllExportColumns) {
      event.preventDefault();
      setAllUnitExportColumns(getUnitExportModal(clearAllExportColumns), false);
      return;
    }

    const disabledExportDownload = event.target.closest('[data-unit-export-download][aria-disabled="true"]');

    if (disabledExportDownload) {
      event.preventDefault();
    }
  });

  document.body.addEventListener('htmx:afterSwap', (event) => {
    const target = event.detail && event.detail.target ? event.detail.target : null;
    const exportModal = target && typeof target.querySelector === 'function'
      ? target.querySelector('[data-unit-export-modal]')
      : null;

    if (exportModal) {
      updateUnitExportSelection(exportModal);
    }
  });

  window.addEventListener('resize', () => {
    initializeUnitExportTableScroll(document.querySelector('[data-unit-export-modal]'));
  });

  updateUnitExportSelection(document.querySelector('[data-unit-export-modal]'));
})();
