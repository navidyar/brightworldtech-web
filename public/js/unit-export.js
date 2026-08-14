(function () {
  'use strict';

  function getUnitExportModal(source) {
    return source && typeof source.closest === 'function'
      ? source.closest('[data-unit-export-modal]')
      : null;
  }

  function getSelectedUnitExportColumnKeys(modal) {
    return Array.from(modal ? modal.querySelectorAll('[data-unit-export-column]:checked') : [])
      .map((checkbox) => String(checkbox.value || '').trim())
      .filter(Boolean);
  }

  function buildUnitExportSelectionUrl(baseUrl, selectedKeys) {
    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set('columns', selectedKeys.join(','));
    return `${url.pathname}${url.search}${url.hash}`;
  }

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

  function initializeUnitExportTableScroll(modal) {
    if (!modal) {
      return;
    }

    const topScroll = modal.querySelector('[data-unit-export-top-scroll]');
    const topScrollTrack = modal.querySelector('[data-unit-export-top-scroll-track]');
    const topScrollThumb = modal.querySelector('[data-unit-export-top-scroll-thumb]');
    const tableScroll = modal.querySelector('[data-unit-export-table-scroll]');
    const scrollRow = modal.querySelector('[data-unit-export-top-scroll-row]');

    if (!topScroll || !topScrollTrack || !topScrollThumb || !tableScroll || !scrollRow) {
      return;
    }

    const refresh = () => {
      const table = tableScroll.querySelector('table');
      const contentWidth = Math.max(
        tableScroll.scrollWidth,
        table ? table.scrollWidth : 0
      );
      const viewportWidth = tableScroll.clientWidth;
      const hasHorizontalOverflow = contentWidth > viewportWidth + 1;

      topScroll.style.width = `${viewportWidth}px`;
      scrollRow.hidden = !hasHorizontalOverflow;
      topScroll.hidden = !hasHorizontalOverflow;

      if (!hasHorizontalOverflow) {
        tableScroll.scrollLeft = 0;
        topScroll.setAttribute('aria-valuemax', '0');
        topScroll.setAttribute('aria-valuenow', '0');
        topScrollThumb.style.width = '100%';
        topScrollThumb.style.transform = 'translateX(0px)';
        modal.__unitExportTableScrollSync.geometry = null;
        return;
      }

      const maxScrollLeft = Math.max(0, contentWidth - viewportWidth);
      const trackWidth = Math.max(0, topScrollTrack.clientWidth);
      const proportionalThumbWidth = contentWidth > 0
        ? Math.round(trackWidth * (viewportWidth / contentWidth))
        : trackWidth;
      const thumbWidth = Math.min(
        trackWidth,
        Math.max(Math.min(56, trackWidth), proportionalThumbWidth)
      );
      const thumbTravel = Math.max(0, trackWidth - thumbWidth);
      const scrollLeft = Math.min(maxScrollLeft, Math.max(0, tableScroll.scrollLeft));
      const thumbOffset = maxScrollLeft > 0
        ? (scrollLeft / maxScrollLeft) * thumbTravel
        : 0;

      topScrollThumb.style.width = `${thumbWidth}px`;
      topScrollThumb.style.transform = `translateX(${thumbOffset}px)`;
      topScroll.setAttribute('aria-valuemax', String(Math.round(maxScrollLeft)));
      topScroll.setAttribute('aria-valuenow', String(Math.round(scrollLeft)));
      modal.__unitExportTableScrollSync.geometry = {
        maxScrollLeft,
        thumbTravel,
        thumbWidth,
        trackWidth
      };
    };

    if (!modal.__unitExportTableScrollSync) {
      const state = {
        refresh,
        geometry: null,
        drag: null
      };

      const scrollFromThumbOffset = (thumbOffset) => {
        const geometry = state.geometry;

        if (!geometry || geometry.maxScrollLeft <= 0 || geometry.thumbTravel <= 0) {
          return;
        }

        const clampedOffset = Math.min(geometry.thumbTravel, Math.max(0, thumbOffset));
        tableScroll.scrollLeft = (clampedOffset / geometry.thumbTravel) * geometry.maxScrollLeft;
      };

      const finishPointerDrag = (event) => {
        if (!state.drag || state.drag.pointerId !== event.pointerId) {
          return;
        }

        if (
          typeof topScroll.releasePointerCapture === 'function'
          && typeof topScroll.hasPointerCapture === 'function'
          && topScroll.hasPointerCapture(event.pointerId)
        ) {
          topScroll.releasePointerCapture(event.pointerId);
        }

        state.drag = null;
        topScroll.classList.remove('is-dragging');
      };

      tableScroll.addEventListener('scroll', refresh, { passive: true });

      topScroll.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }

        refresh();
        const geometry = state.geometry;

        if (!geometry || geometry.maxScrollLeft <= 0) {
          return;
        }

        event.preventDefault();
        const trackRect = topScrollTrack.getBoundingClientRect();
        const thumbRect = topScrollThumb.getBoundingClientRect();
        const startedOnThumb = event.target === topScrollThumb;

        if (!startedOnThumb) {
          scrollFromThumbOffset(event.clientX - trackRect.left - (geometry.thumbWidth / 2));
          refresh();
        }

        state.drag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScrollLeft: tableScroll.scrollLeft,
          pixelsPerScrollUnit: geometry.maxScrollLeft > 0
            ? geometry.thumbTravel / geometry.maxScrollLeft
            : 0,
          thumbPointerOffset: startedOnThumb ? event.clientX - thumbRect.left : geometry.thumbWidth / 2
        };

        topScroll.classList.add('is-dragging');

        if (typeof topScroll.setPointerCapture === 'function') {
          topScroll.setPointerCapture(event.pointerId);
        }
      });

      topScroll.addEventListener('pointermove', (event) => {
        const drag = state.drag;

        if (!drag || drag.pointerId !== event.pointerId || drag.pixelsPerScrollUnit <= 0) {
          return;
        }

        event.preventDefault();
        const scrollDelta = (event.clientX - drag.startX) / drag.pixelsPerScrollUnit;
        tableScroll.scrollLeft = drag.startScrollLeft + scrollDelta;
      });

      topScroll.addEventListener('pointerup', finishPointerDrag);
      topScroll.addEventListener('pointercancel', finishPointerDrag);
      topScroll.addEventListener('lostpointercapture', (event) => {
        if (state.drag && state.drag.pointerId === event.pointerId) {
          state.drag = null;
          topScroll.classList.remove('is-dragging');
        }
      });

      topScroll.addEventListener('keydown', (event) => {
        const maxScrollLeft = state.geometry ? state.geometry.maxScrollLeft : 0;
        const lineStep = 48;
        const pageStep = Math.max(lineStep, Math.round(tableScroll.clientWidth * 0.8));
        let nextScrollLeft = null;

        if (event.key === 'ArrowLeft') {
          nextScrollLeft = tableScroll.scrollLeft - lineStep;
        } else if (event.key === 'ArrowRight') {
          nextScrollLeft = tableScroll.scrollLeft + lineStep;
        } else if (event.key === 'PageUp') {
          nextScrollLeft = tableScroll.scrollLeft - pageStep;
        } else if (event.key === 'PageDown') {
          nextScrollLeft = tableScroll.scrollLeft + pageStep;
        } else if (event.key === 'Home') {
          nextScrollLeft = 0;
        } else if (event.key === 'End') {
          nextScrollLeft = maxScrollLeft;
        }

        if (nextScrollLeft === null) {
          return;
        }

        event.preventDefault();
        tableScroll.scrollLeft = Math.min(maxScrollLeft, Math.max(0, nextScrollLeft));
      });

      modal.__unitExportTableScrollSync = state;
    } else {
      modal.__unitExportTableScrollSync.refresh = refresh;
    }

    modal.__unitExportTableScrollSync.refresh();
  }

  function updateUnitExportSelection(modal) {
    if (!modal) {
      return;
    }

    const checkboxes = Array.from(modal.querySelectorAll('[data-unit-export-column]'));
    const selectedKeys = getSelectedUnitExportColumnKeys(modal);
    const selectedKeySet = new Set(selectedKeys);
    const selectedCount = modal.querySelector('[data-unit-export-selected-count]');
    const message = modal.querySelector('[data-unit-export-selection-message]');
    const hasSelection = selectedKeys.length > 0;

    modal.querySelectorAll('[data-export-column-key]').forEach((cell) => {
      cell.hidden = !selectedKeySet.has(cell.getAttribute('data-export-column-key'));
    });

    if (selectedCount) {
      selectedCount.textContent = `${selectedKeys.length} of ${checkboxes.length} selected`;
    }

    if (message) {
      message.textContent = hasSelection ? '' : 'Select at least one column before downloading an export.';
      message.classList.toggle('is-error', !hasSelection);
    }

    modal.querySelectorAll('[data-unit-export-download]').forEach((link) => {
      const baseUrl = link.getAttribute('data-unit-export-base-url') || '';

      if (!hasSelection || !baseUrl) {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
        link.setAttribute('tabindex', '-1');
        link.classList.add('is-disabled');
        return;
      }

      link.setAttribute('href', buildUnitExportSelectionUrl(baseUrl, selectedKeys));
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
      link.classList.remove('is-disabled');
    });

    window.requestAnimationFrame(() => {
      initializeUnitExportTableScroll(modal);
    });
  }

  function setAllUnitExportColumns(modal, checked) {
    if (!modal) {
      return;
    }

    modal.querySelectorAll('[data-unit-export-column]').forEach((checkbox) => {
      checkbox.checked = checked;
    });
    updateUnitExportSelection(modal);
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
