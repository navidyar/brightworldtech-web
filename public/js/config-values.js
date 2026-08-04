(() => {
  'use strict';

  function normalizeSearchText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getOrderRows(list) {
    return Array.from(list.querySelectorAll(':scope > [data-configuration-order-row]'));
  }

  function getOrderIds(list) {
    return getOrderRows(list)
      .map((row) => Number.parseInt(String(row.dataset.configValueId || ''), 10))
      .filter((valueId) => Number.isSafeInteger(valueId) && valueId > 0);
  }


  function getVisibleOrderRows(list) {
    return getOrderRows(list).filter((row) => !row.hidden);
  }

  function mergeVisibleOrderIntoFullOrder(fullOrder, visibleOrder, reorderedVisibleOrder) {
    const fullIds = Array.isArray(fullOrder) ? fullOrder.slice() : [];
    const visibleIds = Array.isArray(visibleOrder) ? visibleOrder.slice() : [];
    const reorderedIds = Array.isArray(reorderedVisibleOrder) ? reorderedVisibleOrder.slice() : [];
    const fullIdSet = new Set(fullIds);
    const visibleIdSet = new Set(visibleIds);
    const reorderedIdSet = new Set(reorderedIds);
    const hasValidVisibleSet = visibleIds.length === reorderedIds.length
      && visibleIds.length === visibleIdSet.size
      && reorderedIds.length === reorderedIdSet.size
      && visibleIds.every((valueId) => fullIdSet.has(valueId) && reorderedIdSet.has(valueId))
      && reorderedIds.every((valueId) => visibleIdSet.has(valueId));

    if (!hasValidVisibleSet) {
      return fullIds;
    }

    let visibleIndex = 0;

    return fullIds.map((valueId) => {
      if (!visibleIdSet.has(valueId)) {
        return valueId;
      }

      const reorderedValueId = reorderedIds[visibleIndex];
      visibleIndex += 1;
      return reorderedValueId;
    });
  }

  function applyVisibleRowOrder(list, reorderedVisibleRows) {
    const fullOrder = getOrderIds(list);
    const visibleOrder = getVisibleOrderRows(list)
      .map((row) => Number.parseInt(String(row.dataset.configValueId || ''), 10));
    const reorderedVisibleOrder = reorderedVisibleRows
      .map((row) => Number.parseInt(String(row.dataset.configValueId || ''), 10));
    const mergedOrder = mergeVisibleOrderIntoFullOrder(fullOrder, visibleOrder, reorderedVisibleOrder);

    restoreOrder(list, mergedOrder);
  }

  function ordersMatch(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function restoreOrder(list, orderedIds) {
    const rowById = new Map(
      getOrderRows(list).map((row) => [Number.parseInt(String(row.dataset.configValueId || ''), 10), row])
    );

    orderedIds.forEach((valueId) => {
      const row = rowById.get(valueId);
      if (row) {
        list.appendChild(row);
      }
    });
  }

  function initializeConfigurationReorderList(list) {
    if (!list || list.dataset.configurationReorderReady === '1') {
      return;
    }

    const category = list.closest('[data-configuration-category]');
    const status = category ? category.querySelector('[data-configuration-order-status]') : null;
    let draggingRow = null;
    let draggingHandle = null;
    let originalOrder = [];
    let activePointerId = null;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerDragStarted = false;
    let saveInProgress = false;
    let searchActive = false;
    let statusClearTimer = null;

    list.dataset.configurationReorderReady = '1';

    function getFilteredOrderingMessage() {
      return searchActive
        ? 'Filtered ordering is active. Matching values can move; hidden values keep their positions.'
        : '';
    }

    function setStatus(message, state = '') {
      if (!status) {
        return;
      }

      if (statusClearTimer) {
        window.clearTimeout(statusClearTimer);
        statusClearTimer = null;
      }

      status.textContent = message;
      status.dataset.state = state;

      if (message && state === 'success') {
        statusClearTimer = window.setTimeout(() => {
          const filteredMessage = getFilteredOrderingMessage();
          status.textContent = filteredMessage;
          status.dataset.state = filteredMessage ? 'notice' : '';
        }, 3000);
      }
    }

    function syncHandleAvailability() {
      const disabled = saveInProgress;

      list.querySelectorAll('[data-configuration-drag-handle]').forEach((handle) => {
        handle.disabled = disabled;
      });

      list.classList.toggle('is-ordering-disabled', disabled);
      list.classList.toggle('is-filtered-ordering', searchActive);
    }

    async function saveOrder(previousOrder) {
      const orderedConfigValueIds = getOrderIds(list);

      if (ordersMatch(previousOrder, orderedConfigValueIds)) {
        return;
      }

      saveInProgress = true;
      syncHandleAvailability();
      list.classList.add('is-ordering-saving');
      setStatus('Saving order…', 'saving');

      try {
        const response = await fetch(list.dataset.reorderUrl, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orderedConfigValueIds,
            includeInactive: list.dataset.includeInactive === '1' ? '1' : '0'
          })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.ok !== true) {
          throw new Error(payload.error || 'The configuration order could not be saved.');
        }

        setStatus('Order saved.', 'success');
      } catch (error) {
        restoreOrder(list, previousOrder);
        setStatus(error && error.message ? error.message : 'The configuration order could not be saved.', 'error');
      } finally {
        saveInProgress = false;
        list.classList.remove('is-ordering-saving');
        syncHandleAvailability();
      }
    }

    function moveRowWithKeyboard(row, direction) {
      if (saveInProgress) {
        return;
      }

      const previousOrder = getOrderIds(list);
      const visibleRows = getVisibleOrderRows(list);
      const currentIndex = visibleRows.indexOf(row);

      if (currentIndex < 0) {
        return;
      }

      let targetIndex = currentIndex;

      if (direction === 'up') {
        targetIndex = Math.max(0, currentIndex - 1);
      } else if (direction === 'down') {
        targetIndex = Math.min(visibleRows.length - 1, currentIndex + 1);
      } else if (direction === 'first') {
        targetIndex = 0;
      } else if (direction === 'last') {
        targetIndex = visibleRows.length - 1;
      }

      if (targetIndex === currentIndex) {
        return;
      }

      const reorderedVisibleRows = visibleRows.slice();
      reorderedVisibleRows.splice(currentIndex, 1);
      reorderedVisibleRows.splice(targetIndex, 0, row);
      applyVisibleRowOrder(list, reorderedVisibleRows);

      const handle = row.querySelector('[data-configuration-drag-handle]');
      if (handle) {
        handle.focus();
      }

      void saveOrder(previousOrder);
    }

    function removePointerListeners() {
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerEnd, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
    }

    function resetPointerState() {
      removePointerListeners();

      if (draggingRow) {
        draggingRow.classList.remove('is-dragging', 'is-pointer-dragging');
      }

      list.classList.remove('is-pointer-dragging');
      document.documentElement.classList.remove('configuration-pointer-dragging');
      draggingRow = null;
      draggingHandle = null;
      originalOrder = [];
      activePointerId = null;
      pointerStartX = 0;
      pointerStartY = 0;
      pointerDragStarted = false;
    }

    function finishPointerDrag(cancelled = false) {
      if (!draggingRow) {
        return;
      }

      const previousOrder = originalOrder.slice();
      const orderChanged = !ordersMatch(previousOrder, getOrderIds(list));
      const handleToFocus = draggingHandle;

      if (cancelled && orderChanged) {
        restoreOrder(list, previousOrder);
      }

      resetPointerState();

      if (handleToFocus && !handleToFocus.disabled) {
        handleToFocus.focus();
      }

      if (!cancelled && orderChanged) {
        void saveOrder(previousOrder);
      } else {
        const filteredMessage = getFilteredOrderingMessage();
        if (filteredMessage) {
          setStatus(filteredMessage, 'notice');
        }
      }
    }

    function startPointerDragVisuals() {
      if (!draggingRow || pointerDragStarted) {
        return;
      }

      pointerDragStarted = true;
      draggingRow.classList.add('is-dragging', 'is-pointer-dragging');
      list.classList.add('is-pointer-dragging');
      document.documentElement.classList.add('configuration-pointer-dragging');
    }

    function handlePointerMove(event) {
      if (!draggingRow || event.pointerId !== activePointerId) {
        return;
      }

      const travelDistance = Math.hypot(
        event.clientX - pointerStartX,
        event.clientY - pointerStartY
      );

      if (!pointerDragStarted && travelDistance < 4) {
        return;
      }

      startPointerDragVisuals();
      event.preventDefault();

      const visibleRows = getVisibleOrderRows(list);
      const candidateRows = visibleRows.filter((row) => row !== draggingRow);
      let insertionIndex = candidateRows.length;

      for (let index = 0; index < candidateRows.length; index += 1) {
        const bounds = candidateRows[index].getBoundingClientRect();
        if (event.clientY < bounds.top + (bounds.height / 2)) {
          insertionIndex = index;
          break;
        }
      }

      const reorderedVisibleRows = candidateRows.slice();
      reorderedVisibleRows.splice(insertionIndex, 0, draggingRow);

      if (!ordersMatch(
        visibleRows.map((row) => Number.parseInt(String(row.dataset.configValueId || ''), 10)),
        reorderedVisibleRows.map((row) => Number.parseInt(String(row.dataset.configValueId || ''), 10))
      )) {
        applyVisibleRowOrder(list, reorderedVisibleRows);
      }
    }

    function handlePointerEnd(event) {
      if (!draggingRow || event.pointerId !== activePointerId) {
        return;
      }

      if (pointerDragStarted) {
        event.preventDefault();
      }

      finishPointerDrag(false);
    }

    function handlePointerCancel(event) {
      if (!draggingRow || event.pointerId !== activePointerId) {
        return;
      }

      finishPointerDrag(true);
    }

    getOrderRows(list).forEach((row) => {
      const handle = row.querySelector('[data-configuration-drag-handle]');

      if (!handle) {
        return;
      }

      handle.addEventListener('pointerdown', (event) => {
        if (handle.disabled || saveInProgress || draggingRow) {
          return;
        }

        if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) {
          return;
        }

        event.preventDefault();
        handle.focus();
        draggingRow = row;
        draggingHandle = handle;
        originalOrder = getOrderIds(list);
        activePointerId = event.pointerId;
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        pointerDragStarted = false;

        document.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
        document.addEventListener('pointerup', handlePointerEnd, true);
        document.addEventListener('pointercancel', handlePointerCancel, true);
      });

      handle.addEventListener('keydown', (event) => {
        const directionsByKey = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          Home: 'first',
          End: 'last'
        };
        const direction = directionsByKey[event.key];

        if (!direction) {
          return;
        }

        event.preventDefault();
        moveRowWithKeyboard(row, direction);
      });
    });

    list.addEventListener('configuration:searchstate', (event) => {
      const nextSearchActive = Boolean(event.detail && event.detail.active);

      if (draggingRow) {
        finishPointerDrag(true);
      }

      searchActive = nextSearchActive;
      syncHandleAvailability();

      const filteredMessage = getFilteredOrderingMessage();
      if (filteredMessage) {
        setStatus(filteredMessage, 'notice');
      } else if (status && status.dataset.state === 'notice') {
        setStatus('');
      }
    });

    syncHandleAvailability();
  }

  function initializeConfigurationBrowser(browser) {
    if (!browser || browser.dataset.configurationBrowserReady === '1') {
      return;
    }

    const searchInput = browser.querySelector('[data-configuration-search]');
    const status = browser.querySelector('[data-configuration-status]');
    const emptyState = browser.querySelector('[data-configuration-empty]');
    const groups = Array.from(browser.querySelectorAll('[data-configuration-group]'));
    const categories = Array.from(browser.querySelectorAll('[data-configuration-category]'));
    const valueRows = Array.from(browser.querySelectorAll('[data-configuration-value-row]'));
    const reorderLists = Array.from(browser.querySelectorAll('[data-configuration-reorder-list]'));
    const expandAllButton = browser.querySelector('[data-configuration-expand-all]');
    const collapseAllButton = browser.querySelector('[data-configuration-collapse-all]');

    browser.dataset.configurationBrowserReady = '1';
    reorderLists.forEach(initializeConfigurationReorderList);

    function updateStatus(visibleValueCount, visibleCategoryCount, query) {
      if (!status) {
        return;
      }

      if (query) {
        status.textContent = `${visibleValueCount} matching value${visibleValueCount === 1 ? '' : 's'} across ${visibleCategoryCount} categor${visibleCategoryCount === 1 ? 'y' : 'ies'}.`;
        return;
      }

      status.textContent = `${valueRows.length} values across ${categories.length} categories.`;
    }

    function applySearch() {
      const query = normalizeSearchText(searchInput ? searchInput.value : '');
      let visibleValueCount = 0;
      let visibleCategoryCount = 0;

      categories.forEach((category) => {
        const categoryMatches = !query || normalizeSearchText(category.dataset.searchText).includes(query);
        const categoryRows = Array.from(category.querySelectorAll('[data-configuration-value-row]'));
        let matchingRowCount = 0;

        categoryRows.forEach((row) => {
          const rowMatches = !query || categoryMatches || normalizeSearchText(row.dataset.searchText).includes(query);
          row.hidden = !rowMatches;

          if (rowMatches) {
            matchingRowCount += 1;
            visibleValueCount += 1;
          }
        });

        const categoryVisible = !query || categoryMatches || matchingRowCount > 0;
        category.hidden = !categoryVisible;

        if (categoryVisible) {
          visibleCategoryCount += 1;
        }

        if (query && categoryVisible) {
          category.open = true;
        }
      });

      groups.forEach((group) => {
        const hasVisibleCategory = Array.from(group.querySelectorAll('[data-configuration-category]'))
          .some((category) => !category.hidden);
        group.hidden = !hasVisibleCategory;
      });

      reorderLists.forEach((list) => {
        list.dispatchEvent(new CustomEvent('configuration:searchstate', {
          detail: { active: Boolean(query) }
        }));
      });

      if (emptyState) {
        emptyState.hidden = visibleCategoryCount > 0;
      }

      updateStatus(visibleValueCount, visibleCategoryCount, query);
    }

    if (searchInput) {
      searchInput.addEventListener('input', applySearch);
    }

    if (expandAllButton) {
      expandAllButton.addEventListener('click', () => {
        categories.forEach((category) => {
          if (!category.hidden) {
            category.open = true;
          }
        });
      });
    }

    if (collapseAllButton) {
      collapseAllButton.addEventListener('click', () => {
        categories.forEach((category) => {
          category.open = false;
        });
      });
    }

    applySearch();
  }

  function initializeConfigValueForm(form) {
    if (!form || form.dataset.configurationValueFormReady === '1') {
      return;
    }

    const categorySelect = form.querySelector('select[name="configCategoryId"]');
    const sortField = form.querySelector('[data-configuration-sort-order-field]');
    const sortInput = sortField ? sortField.querySelector('input[name="sortOrder"]') : null;
    const orderingNote = form.querySelector('[data-configuration-form-ordering-note]');
    const activeCheckbox = form.querySelector('input[name="isActive"]');

    if (!categorySelect || !sortField || !sortInput || !orderingNote) {
      return;
    }

    form.dataset.configurationValueFormReady = '1';

    function syncOrderingMode() {
      const selectedOption = categorySelect.selectedOptions[0] || null;
      const popularitySorted = selectedOption?.dataset.popularitySorted === '1';
      const selectedCategoryId = Number.parseInt(String(selectedOption?.value || '0'), 10) || 0;
      const activeValueCount = Number.parseInt(String(selectedOption?.dataset.activeValueCount || '0'), 10) || 0;
      const desiredActive = Boolean(activeCheckbox && activeCheckbox.checked);
      const originalCategoryId = Number.parseInt(String(form.dataset.originalCategoryId || '0'), 10) || 0;
      const originalActive = form.dataset.originalActive === '1';
      let projectedActiveValueCount = activeValueCount;

      if (form.dataset.formMode === 'edit' && originalCategoryId === selectedCategoryId && originalActive) {
        projectedActiveValueCount -= 1;
      }
      if (desiredActive) {
        projectedActiveValueCount += 1;
      }

      const becomesDragOrdered = !popularitySorted && projectedActiveValueCount >= 3;
      const dragOrderManaged = selectedOption?.dataset.dragOrderManaged === '1' || becomesDragOrdered;

      sortField.hidden = dragOrderManaged;
      sortInput.readOnly = dragOrderManaged;
      sortInput.tabIndex = dragOrderManaged ? -1 : 0;

      if (dragOrderManaged) {
        orderingNote.hidden = false;
        orderingNote.textContent = form.dataset.formMode === 'create'
          ? 'This list uses drag-and-drop ordering. The new value will be added to the end of the list.'
          : 'This list uses drag-and-drop ordering on the Configuration page.';
      } else if (popularitySorted) {
        orderingNote.hidden = false;
        orderingNote.textContent = 'Operational dropdowns use popularity sorting. Sort Order remains the fallback order.';
      } else {
        orderingNote.hidden = true;
        orderingNote.textContent = '';
      }
    }

    categorySelect.addEventListener('change', syncOrderingMode);
    if (activeCheckbox) {
      activeCheckbox.addEventListener('change', syncOrderingMode);
    }
    syncOrderingMode();
  }

  function initializeAllConfigurationBrowsers(root = document) {
    root.querySelectorAll('[data-configuration-browser]').forEach(initializeConfigurationBrowser);
  }

  function initializeAllConfigValueForms(root = document) {
    root.querySelectorAll('[data-configuration-value-form]').forEach(initializeConfigValueForm);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mergeVisibleOrderIntoFullOrder
    };
  }

  if (typeof document === 'undefined') {
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializeAllConfigurationBrowsers();
    initializeAllConfigValueForms();
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    initializeAllConfigurationBrowsers(event.target);
    initializeAllConfigValueForms(event.target);
  });
})();
