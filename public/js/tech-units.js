(function () {
  const TECH_UNIT_REFRESH_INTERVAL_MS = 30000;
  const UNIT_SAVE_CONFIRMATION_TIMEOUT_MS = 30000;
  let techUnitSaveConfirmationTimer = null;
  let techUnitRefreshInFlight = false;
  let techUnitRefreshQueued = false;
  let techUnitRefreshQueueTimer = null;
  let techUnitEventSource = null;

  function normalizeUnitSaveConfirmationValue(value) {
    return String(value || '').trim();
  }

  function buildUnitSaveConfirmationMessage(detail) {
    if (!detail || detail.source !== 'tech-unit-form' || !['create', 'edit'].includes(detail.operation)) {
      return '';
    }

    const identifiers = [
      ['Asset Tag', normalizeUnitSaveConfirmationValue(detail.assetTag)],
      ['Unit Serial', normalizeUnitSaveConfirmationValue(detail.unitSerialNumber)],
      ['BIOS Serial', normalizeUnitSaveConfirmationValue(detail.biosSerialNumber)]
    ]
      .filter(([, value]) => Boolean(value))
      .map(([label, value]) => `${label}: ${value}`);
    const actionLabel = detail.operation === 'edit' ? 'updated' : 'created';
    const identifierSummary = identifiers.length > 0 ? ` — ${identifiers.join(' · ')}` : '';

    return `Unit ${actionLabel} successfully${identifierSummary}.`;
  }

  function hideUnitSaveConfirmation() {
    const notification = document.getElementById('tech-unit-save-notification');

    if (!notification) {
      return;
    }

    notification.hidden = true;
    notification.textContent = '';
  }

  function showUnitSaveConfirmation(detail) {
    const notification = document.getElementById('tech-unit-save-notification');
    const message = buildUnitSaveConfirmationMessage(detail);

    if (!notification || !message) {
      return;
    }

    window.clearTimeout(techUnitSaveConfirmationTimer);
    notification.textContent = message;
    notification.hidden = false;
    techUnitSaveConfirmationTimer = window.setTimeout(() => {
      hideUnitSaveConfirmation();
      techUnitSaveConfirmationTimer = null;
    }, UNIT_SAVE_CONFIRMATION_TIMEOUT_MS);
  }

  function showTechUnitWorkflowConfirmation(message) {
    const notification = document.getElementById('tech-unit-save-notification');
    const normalizedMessage = String(message || '').trim();

    if (!notification || !normalizedMessage) {
      return;
    }

    window.clearTimeout(techUnitSaveConfirmationTimer);
    notification.textContent = normalizedMessage;
    notification.hidden = false;
    techUnitSaveConfirmationTimer = window.setTimeout(() => {
      hideUnitSaveConfirmation();
      techUnitSaveConfirmationTimer = null;
    }, UNIT_SAVE_CONFIRMATION_TIMEOUT_MS);
  }

  function normalizePanelName(panelName) {
    return ['history', 'my-weight'].includes(panelName) ? panelName : 'details';
  }

  function setPanel(detailRow, panelName) {
    if (!detailRow) {
      return;
    }

    const normalizedPanelName = normalizePanelName(panelName);
    const activeHeaderName = normalizedPanelName === 'history' ? 'history' : 'details';

    detailRow.querySelectorAll('[data-unit-panel-header]').forEach((header) => {
      header.hidden = header.getAttribute('data-unit-panel-header') !== activeHeaderName;
    });

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

  function closeLotHierarchyHelp() {
    document.querySelectorAll('[data-lot-hierarchy-help-popup]').forEach((popup) => popup.remove());
  }

  function openLotHierarchyHelp(trigger) {
    const fullPath = String(trigger && trigger.getAttribute('data-lot-hierarchy-path') || '').trim();
    if (!fullPath) return;

    closeLotHierarchyHelp();
    const popup = document.createElement('div');
    popup.className = 'tech-lot-hierarchy-help-popup';
    popup.setAttribute('data-lot-hierarchy-help-popup', '');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Lot Hierarchy');

    const heading = document.createElement('strong');
    heading.textContent = 'Lot Hierarchy';
    const path = document.createElement('p');
    path.textContent = fullPath;
    const note = document.createElement('small');
    note.textContent = 'This shows where the selected lot sits within the Lot hierarchy.';
    popup.append(heading, path, note);
    document.body.appendChild(popup);

    const rect = trigger.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    const viewportPadding = 10;
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      Math.max(window.innerWidth - popupRect.width - viewportPadding, viewportPadding)
    );
    const preferredTop = rect.bottom + 6;
    const top = preferredTop + popupRect.height <= window.innerHeight - viewportPadding
      ? preferredTop
      : Math.max(rect.top - popupRect.height - 6, viewportPadding);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
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
        <section class="modal-panel site-clean-modal tech-qc-review-modal" role="alertdialog" aria-modal="true" aria-labelledby="tech-modal-request-error-title" aria-describedby="tech-modal-request-error-description" tabindex="-1">
          <header class="modal-header">
            <div>
              <p class="eyebrow">Unit Action</p>
              <h2 id="tech-modal-request-error-title">Action could not be opened</h2>
              <p id="tech-modal-request-error-description" class="modal-description">The requested Unit action did not load.</p>
            </div>
            <button type="button" class="modal-close-button" data-modal-close data-modal-initial-focus aria-label="Close Unit action error">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" /></svg>
            </button>
          </header>
          <div class="modal-body">
            <div class="message error" role="alert">
              <p>${escapeHtml(message)}</p>
            </div>
            <div class="action-row tech-qc-modal-actions">
              <button type="button" class="secondary-button" data-modal-close>Close</button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function openUnitHistoryFromQcModal(trigger) {
    const unitId = Number(trigger && trigger.getAttribute('data-unit-id'));

    if (!Number.isSafeInteger(unitId) || unitId <= 0) {
      return;
    }

    const record = document.querySelector(`[data-unit-record][data-unit-id="${unitId}"]`);
    const historyButton = record
      ? record.querySelector('[data-unit-panel-button][data-panel="history"]')
      : null;

    closeModalRoot();

    if (!historyButton) {
      window.location.assign(`/tech/units/${unitId}`);
      return;
    }

    window.setTimeout(() => {
      if (!historyButton.isConnected) {
        return;
      }

      historyButton.click();
      window.setTimeout(() => {
        if (historyButton.isConnected) {
          historyButton.focus({ preventScroll: true });
          historyButton.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    }, 0);
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


  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

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

  function renderQcReviewSubmissionError(message, title = 'Decision not saved') {
    const modalRoot = document.getElementById('modal-root');

    if (!modalRoot) {
      return;
    }

    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal-panel site-clean-modal tech-qc-review-modal" role="alertdialog" aria-modal="true" aria-labelledby="tech-qc-review-submit-error-title" aria-describedby="tech-qc-review-submit-error-description" tabindex="-1">
          <header class="modal-header">
            <div>
              <p class="eyebrow">Quality Control</p>
              <h2 id="tech-qc-review-submit-error-title">${escapeHtml(title)}</h2>
              <p id="tech-qc-review-submit-error-description" class="modal-description">No Quality Control workflow change was recorded.</p>
            </div>
            <button type="button" class="modal-close-button" data-modal-close data-modal-initial-focus aria-label="Close Quality Control error">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" /></svg>
            </button>
          </header>
          <div class="modal-body">
            <div class="message error" role="alert"><p>${escapeHtml(message)}</p></div>
            <div class="action-row tech-qc-modal-actions">
              <button type="button" class="secondary-button" data-modal-close>Close</button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function replaceQcReviewModal(markup) {
    const modalRoot = document.getElementById('modal-root');

    if (!modalRoot) {
      return;
    }

    modalRoot.innerHTML = markup;
  }

  function dispatchQcReviewEvent(eventName, detail) {
    if (!eventName || !document.body) {
      return;
    }

    document.body.dispatchEvent(new CustomEvent(eventName, {
      bubbles: true,
      detail
    }));
  }

  function dispatchHxTriggerHeader(headerValue) {
    const value = String(headerValue || '').trim();

    if (!value) {
      return false;
    }

    try {
      const parsed = JSON.parse(value);

      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([eventName, detail]) => {
          dispatchQcReviewEvent(eventName, detail);
        });
        return true;
      }
    } catch (error) {
      // Simple HX-Trigger values such as "unit-saved" are valid too.
    }

    value.split(',').map((eventName) => eventName.trim()).filter(Boolean).forEach((eventName) => {
      dispatchQcReviewEvent(eventName, true);
    });
    return true;
  }

  async function submitQcReviewForm(form, submitter) {
    if (!form || form.dataset.qcReviewSubmitting === 'true') {
      return;
    }

    form.dataset.qcReviewSubmitting = 'true';
    const isCorrectionForm = form.matches('[data-qc-correction-form]');
    const isReversionForm = form.matches('[data-qc-reversion-form]');
    const isReversionRequestForm = form.matches('[data-qc-reversion-request-form]');
    const failureTitle = isReversionRequestForm
      ? 'Reversion request not submitted'
      : (isReversionForm ? 'Reversion not saved' : (isCorrectionForm ? 'Correction not saved' : 'Decision not saved'));
    const failureMessage = isReversionRequestForm
      ? 'The QC reversion request could not be submitted. The current QC decision remains unchanged.'
      : (isReversionForm
        ? 'The Quality Control decision could not be reverted. No workflow change was recorded.'
        : (isCorrectionForm
          ? 'The correction could not be saved. No workflow change was recorded.'
          : 'The Quality Control decision could not be saved. No review was recorded.'));
    const submitButton = submitter || form.querySelector('[data-qc-submit-button], button[type="submit"]');
    const submitStatus = form.querySelector('[data-qc-submit-status]');
    const originalButtonLabel = submitButton ? submitButton.textContent.trim() : '';
    const progressLabel = isReversionRequestForm
      ? 'Submitting reversion request...'
      : (isReversionForm ? 'Reverting QC decision...' : (isCorrectionForm ? 'Saving correction...' : 'Saving QC decision...'));

    form.setAttribute('aria-busy', 'true');

    if (submitStatus) {
      submitStatus.textContent = progressLabel;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.textContent = progressLabel;
    }

    try {
      const requestBody = new URLSearchParams();
      const formData = new FormData(form);

      formData.forEach((value, key) => {
        requestBody.append(key, typeof value === 'string' ? value : value.name);
      });

      const response = await fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'HX-Request': 'true'
        },
        body: requestBody.toString()
      });
      const responseMarkup = await response.text();

      if (!response.ok) {
        if (responseMarkup.trim()) {
          replaceQcReviewModal(responseMarkup);
        } else {
          renderQcReviewSubmissionError(failureMessage, failureTitle);
        }
        return;
      }

      closeModalRoot();

      if (!dispatchHxTriggerHeader(response.headers.get('HX-Trigger'))) {
        if (isReversionRequestForm) {
          dispatchQcReviewEvent('qc-reversion-requested', { message: 'QC reversion request submitted for Tech Lead+ review.' });
        } else {
          dispatchQcReviewEvent(isReversionForm ? 'qc-review-reverted' : 'unit-saved', true);
          if (!isReversionForm) {
            dispatchQcReviewEvent(isCorrectionForm ? 'qc-correction-submitted' : 'qc-review-recorded', true);
          }
        }
      }
    } catch (error) {
      renderQcReviewSubmissionError(`${failureMessage} The request failed before the server confirmed it.`, failureTitle);
    } finally {
      if (form.isConnected) {
        delete form.dataset.qcReviewSubmitting;
        form.removeAttribute('aria-busy');
      }

      if (submitStatus && submitStatus.isConnected) {
        submitStatus.textContent = '';
      }

      if (submitButton && submitButton.isConnected) {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
        submitButton.textContent = originalButtonLabel;
      }
    }
  }

  document.addEventListener('submit', (event) => {
    const qcReviewForm = event.target.closest('[data-qc-review-form], [data-qc-correction-form], [data-qc-reversion-form], [data-qc-reversion-request-form]');

    if (!qcReviewForm) {
      return;
    }

    event.preventDefault();
    submitQcReviewForm(qcReviewForm, event.submitter);
  });

  document.addEventListener('change', (event) => {
    const exportColumn = event.target.closest('[data-unit-export-column]');

    if (!exportColumn) {
      return;
    }

    updateUnitExportSelection(getUnitExportModal(exportColumn));
  });

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

  document.addEventListener('keydown', (event) => {
    const lotHierarchyHelp = event.target.closest('[data-lot-hierarchy-help]');
    if (lotHierarchyHelp && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      openLotHierarchyHelp(lotHierarchyHelp);
      return;
    }

    if (event.key === 'Escape') closeLotHierarchyHelp();
  });

  document.addEventListener('click', (event) => {
    const lotHierarchyHelp = event.target.closest('[data-lot-hierarchy-help]');

    if (lotHierarchyHelp) {
      event.preventDefault();
      event.stopPropagation();
      openLotHierarchyHelp(lotHierarchyHelp);
      return;
    }

    if (!event.target.closest('[data-lot-hierarchy-help-popup]')) {
      closeLotHierarchyHelp();
    }

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
      return;
    }

    const qcHistoryTrigger = event.target.closest('[data-qc-open-unit-history]');

    if (qcHistoryTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openUnitHistoryFromQcModal(qcHistoryTrigger);
      return;
    }

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

  function getUnitRecordState(record) {
    const detailRow = record ? record.querySelector('.tech-detail-row') : null;
    const activePanel = detailRow
      ? Array.from(detailRow.querySelectorAll('[data-unit-panel-content]'))
        .find((panel) => !panel.hidden)
      : null;

    return {
      expanded: Boolean(detailRow && !detailRow.hidden),
      panelName: activePanel ? normalizePanelName(activePanel.getAttribute('data-unit-panel-content')) : 'details'
    };
  }

  function processHtmxContent(element) {
    if (element && window.htmx && typeof window.htmx.process === 'function') {
      window.htmx.process(element);
    }
  }

  async function loadUnitPanelContent(record, panelName) {
    const normalizedPanelName = normalizePanelName(panelName);

    if (!record || normalizedPanelName === 'details') {
      return;
    }

    const panelButton = record.querySelector(`[data-unit-panel-button][data-panel="${normalizedPanelName}"]`);
    const requestUrl = panelButton ? panelButton.getAttribute('hx-get') : '';
    const targetSelector = panelButton ? panelButton.getAttribute('hx-target') : '';
    const target = targetSelector ? record.querySelector(targetSelector) || document.querySelector(targetSelector) : null;

    if (!requestUrl || !target) {
      return;
    }

    if (window.htmx && typeof window.htmx.ajax === 'function') {
      window.htmx.ajax('GET', requestUrl, {
        target,
        swap: 'innerHTML'
      });
      return;
    }

    try {
      const response = await fetch(requestUrl, {
        credentials: 'same-origin',
        headers: { 'Accept': 'text/html' }
      });

      if (response.ok) {
        target.innerHTML = await response.text();
      }
    } catch (error) {
      // Leave the existing placeholder in place when a background panel refresh fails.
    }
  }

  function restoreUnitRecordState(record, state) {
    if (!record || !state || !state.expanded) {
      return;
    }

    const detailRow = record.querySelector('.tech-detail-row');

    if (!detailRow) {
      return;
    }

    detailRow.hidden = false;
    setSummaryToggleExpanded(detailRow.id, true);
    setPanel(detailRow, state.panelName);
    loadUnitPanelContent(record, state.panelName);
  }

  function replaceUnitRecord(currentRecord, incomingRecord) {
    const state = getUnitRecordState(currentRecord);
    const replacement = document.importNode(incomingRecord, true);

    currentRecord.replaceWith(replacement);
    processHtmxContent(replacement);
    restoreUnitRecordState(replacement, state);

    return replacement;
  }

  function reconcileTechUnitRecords(currentTable, incomingTable) {
    if (!currentTable || !incomingTable) {
      return;
    }

    const currentRecords = Array.from(currentTable.querySelectorAll('tbody[data-unit-record]'));
    const incomingRecords = Array.from(incomingTable.querySelectorAll('tbody[data-unit-record]'));
    const currentById = new Map(currentRecords.map((record) => [record.getAttribute('data-unit-id'), record]));
    const incomingIds = incomingRecords.map((record) => record.getAttribute('data-unit-id')).filter(Boolean);

    if (incomingRecords.length === 0) {
      currentRecords.forEach((record) => record.remove());
      const currentEmptyState = currentTable.querySelector('tbody[data-unit-empty-state]');
      const incomingEmptyState = incomingTable.querySelector('tbody[data-unit-empty-state]');

      if (incomingEmptyState) {
        const replacement = document.importNode(incomingEmptyState, true);

        if (currentEmptyState) {
          currentEmptyState.replaceWith(replacement);
        } else {
          currentTable.appendChild(replacement);
        }
      }
      return;
    }

    const currentEmptyState = currentTable.querySelector('tbody[data-unit-empty-state]');
    if (currentEmptyState) {
      currentEmptyState.remove();
    }

    const orderedRecords = incomingRecords.map((incomingRecord) => {
      const unitId = incomingRecord.getAttribute('data-unit-id');
      const currentRecord = currentById.get(unitId);

      if (!currentRecord) {
        const newRecord = document.importNode(incomingRecord, true);
        currentTable.appendChild(newRecord);
        processHtmxContent(newRecord);
        return newRecord;
      }

      currentById.delete(unitId);

      if (currentRecord.getAttribute('data-unit-version') !== incomingRecord.getAttribute('data-unit-version')) {
        return replaceUnitRecord(currentRecord, incomingRecord);
      }

      return currentRecord;
    });

    currentById.forEach((record) => record.remove());

    const currentOrder = Array.from(currentTable.querySelectorAll('tbody[data-unit-record]'))
      .map((record) => record.getAttribute('data-unit-id'))
      .filter(Boolean);

    if (currentOrder.join(',') !== incomingIds.join(',')) {
      orderedRecords.forEach((record) => currentTable.appendChild(record));
    }
  }

  function replacePaginationIfChanged(container, incomingDocument, selector) {
    const currentPagination = container.querySelector(selector);
    const incomingPagination = incomingDocument.querySelector(selector);

    if (!currentPagination || !incomingPagination || currentPagination.outerHTML === incomingPagination.outerHTML) {
      return;
    }

    const replacement = document.importNode(incomingPagination, true);
    currentPagination.replaceWith(replacement);
    processHtmxContent(replacement);
  }

  function updateLoadedCount(incomingDocument) {
    const currentCount = document.getElementById('tech-units-loaded-count');
    const incomingCount = incomingDocument.getElementById('tech-units-loaded-count');

    if (currentCount && incomingCount && currentCount.textContent !== incomingCount.textContent) {
      currentCount.textContent = incomingCount.textContent;
    }
  }

  function refreshQcReviewQueue(incomingDocument) {
    const currentQueue = document.querySelector('[data-tech-qc-review-queue]');
    const incomingQueue = incomingDocument
      ? incomingDocument.querySelector('[data-tech-qc-review-queue]')
      : null;

    if (!currentQueue || !incomingQueue) {
      return;
    }

    if (
      currentQueue.getAttribute('data-tech-qc-review-queue-version')
        === incomingQueue.getAttribute('data-tech-qc-review-queue-version')
    ) {
      return;
    }

    const replacement = document.importNode(incomingQueue, true);
    replacement.removeAttribute('hx-swap-oob');
    currentQueue.replaceWith(replacement);
    processHtmxContent(replacement);
  }

  async function fetchTechUnitRefreshDocument(url) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Accept': 'text/html',
        'HX-Request': 'true'
      }
    });

    if (response.redirected) {
      window.location.assign(response.url);
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return new DOMParser().parseFromString(await response.text(), 'text/html');
  }

  async function refreshTechUnitBrowser() {
    const container = document.querySelector('[data-tech-units-refresh-url]');

    if (!container) {
      return;
    }

    const incomingDocument = await fetchTechUnitRefreshDocument(container.getAttribute('data-tech-units-refresh-url'));
    const currentTable = container.querySelector('.tech-units-table');
    const incomingTable = incomingDocument ? incomingDocument.querySelector('.tech-units-table') : null;

    if (!currentTable || !incomingTable) {
      return;
    }

    reconcileTechUnitRecords(currentTable, incomingTable);
    replacePaginationIfChanged(container, incomingDocument, '.table-pagination--top');
    replacePaginationIfChanged(container, incomingDocument, '.table-pagination--bottom');
    updateLoadedCount(incomingDocument);
    refreshQcReviewQueue(incomingDocument);
  }

  async function refreshQcSummary() {
    const container = document.querySelector('[data-tech-qc-summary-refresh-url]');

    if (!container) {
      return;
    }

    const incomingDocument = await fetchTechUnitRefreshDocument(
      container.getAttribute('data-tech-qc-summary-refresh-url')
    );
    const incomingSummary = incomingDocument
      ? incomingDocument.querySelector('[data-tech-qc-summary]')
      : null;
    const currentSummary = container.querySelector('[data-tech-qc-summary]');

    if (!incomingSummary) {
      return;
    }

    if (
      currentSummary
      && currentSummary.getAttribute('data-tech-qc-summary-version')
        === incomingSummary.getAttribute('data-tech-qc-summary-version')
    ) {
      return;
    }

    const replacement = document.importNode(incomingSummary, true);

    if (currentSummary) {
      currentSummary.replaceWith(replacement);
    } else {
      container.replaceChildren(replacement);
    }
  }

  async function refreshTechUnitDetailPage() {
    const container = document.querySelector('[data-tech-unit-detail-refresh-url]');

    if (!container) {
      return;
    }

    const incomingDocument = await fetchTechUnitRefreshDocument(container.getAttribute('data-tech-unit-detail-refresh-url'));
    const currentTable = container.querySelector('.tech-units-table');
    const incomingTable = incomingDocument ? incomingDocument.querySelector('.tech-units-table') : null;

    if (!currentTable || !incomingTable) {
      return;
    }

    reconcileTechUnitRecords(currentTable, incomingTable);
  }

  async function refreshVisibleTechUnitRecords({ force = false } = {}) {
    if (!force && document.hidden) {
      return;
    }

    if (techUnitRefreshInFlight) {
      techUnitRefreshQueued = true;
      return;
    }

    techUnitRefreshInFlight = true;

    try {
      await Promise.all([
        refreshTechUnitBrowser(),
        refreshTechUnitDetailPage(),
        refreshQcSummary()
      ]);
    } catch (error) {
      // A background refresh must never interrupt the current Unit view.
    } finally {
      techUnitRefreshInFlight = false;

      if (techUnitRefreshQueued) {
        techUnitRefreshQueued = false;
        queueVisibleTechUnitRefresh();
      }
    }
  }

  function queueVisibleTechUnitRefresh() {
    if (techUnitRefreshQueueTimer) {
      window.clearTimeout(techUnitRefreshQueueTimer);
    }

    techUnitRefreshQueueTimer = window.setTimeout(() => {
      techUnitRefreshQueueTimer = null;
      refreshVisibleTechUnitRecords({ force: true });
    }, 80);
  }

  function startUnitBrowserRealtimeStream() {
    if (!('EventSource' in window) || techUnitEventSource) {
      return;
    }

    techUnitEventSource = new EventSource('/tech/units/events');
    techUnitEventSource.addEventListener('unit-browser-change', () => {
      queueVisibleTechUnitRefresh();
    });

    window.addEventListener('pagehide', () => {
      if (techUnitEventSource) {
        techUnitEventSource.close();
        techUnitEventSource = null;
      }
    }, { once: true });
  }

  function startTargetedTechUnitRefresh() {
    if (!document.querySelector('[data-tech-units-refresh-url], [data-tech-unit-detail-refresh-url], [data-tech-qc-summary-refresh-url]')) {
      return;
    }

    startUnitBrowserRealtimeStream();

    window.setInterval(() => {
      refreshVisibleTechUnitRecords();
    }, TECH_UNIT_REFRESH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        queueVisibleTechUnitRefresh();
      }
    });
  }

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

    if (autoFilterControl.matches('[data-tech-exclusive-filter-toggle]') && autoFilterControl.checked) {
      const filterForm = autoFilterControl.closest('.tech-filter-form');
      const controlName = autoFilterControl.name;

      if (filterForm && controlName) {
        filterForm.querySelectorAll('[data-tech-exclusive-filter-toggle]').forEach((otherControl) => {
          if (otherControl !== autoFilterControl && otherControl.name === controlName) {
            otherControl.checked = false;
          }
        });
      }
    }

    submitAutoFilterControl(autoFilterControl);
  });

  document.body.addEventListener('unit-saved', (event) => {
    showUnitSaveConfirmation(event.detail || null);
  });

  document.body.addEventListener('qc-reversion-requested', (event) => {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
    showTechUnitWorkflowConfirmation(detail.message || 'QC reversion request submitted for Tech Lead+ review.');
  });

  [
    'unit-saved',
    'qc-review-recorded',
    'qc-review-reverted',
    'qc-reversion-requested',
    'unit-work-completed',
    'unit-work-completion-reversed',
    'override-requested'
  ].forEach((eventName) => {
    document.body.addEventListener(eventName, queueVisibleTechUnitRefresh);
  });

  document.body.addEventListener('unit-parked', () => {
    closeModalRoot();
    queueVisibleTechUnitRefresh();
  });

  document.body.addEventListener('unit-returned-active', () => {
    closeModalRoot();
    queueVisibleTechUnitRefresh();
  });

  document.body.addEventListener('unit-permanently-deleted', () => {
    closeModalRoot();
    queueVisibleTechUnitRefresh();
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

  window.addEventListener('resize', () => {
    initializeUnitExportTableScroll(document.querySelector('[data-unit-export-modal]'));
  });

  updateUnitExportSelection(document.querySelector('[data-unit-export-modal]'));
  startTargetedTechUnitRefresh();
})();
