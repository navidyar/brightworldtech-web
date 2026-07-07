(function () {
  const form = document.querySelector('[data-unit-request-filter-form]');

  if (!form) {
    return;
  }

  const statusInput = form.querySelector('input[name="status"]');
  const searchInput = form.querySelector('[data-unit-request-search]');
  const requestTypeFilter = document.querySelector('[data-unit-request-type-filter]');
  const requestRows = Array.from(document.querySelectorAll('[data-unit-request-row]'));
  const resultsCount = document.querySelector('[data-unit-request-results-count]');
  const emptyState = document.querySelector('[data-unit-request-empty-state]');
  const emptyMessage = document.querySelector('[data-unit-request-empty-message]');
  const clearFiltersLink = document.querySelector('[data-unit-request-filter-clear]');
  const statusTabs = Array.from(document.querySelectorAll('[data-unit-request-status-tab]'));
  const detailLinks = Array.from(document.querySelectorAll('[data-unit-request-detail-link]'));
  const returnTypeInputs = Array.from(document.querySelectorAll('[data-unit-request-return-type]'));
  const returnSearchInputs = Array.from(document.querySelectorAll('[data-unit-request-return-search]'));

  function currentStatus() {
    return statusInput?.value || 'pending';
  }

  function currentRequestType() {
    return requestTypeFilter?.value || 'all';
  }

  function currentSearchValue() {
    return searchInput?.value || '';
  }

  function getSearchTerms(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  function buildQueueUrl(status = currentStatus(), requestType = currentRequestType(), search = currentSearchValue()) {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    params.set('status', status || 'pending');
    params.set('requestType', requestType || 'all');

    if (search) {
      params.set('search', search);
    } else {
      params.delete('search');
    }

    const query = params.toString();
    return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
  }

  function syncQueueContext() {
    const status = currentStatus();
    const requestType = currentRequestType();
    const search = currentSearchValue();

    window.history.replaceState(null, '', buildQueueUrl(status, requestType, search));

    statusTabs.forEach((tab) => {
      const tabStatus = tab.dataset.unitRequestStatus || status;
      tab.href = buildQueueUrl(tabStatus, requestType, search);
    });

    detailLinks.forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      url.searchParams.set('status', status);
      url.searchParams.set('requestType', requestType);

      if (search) {
        url.searchParams.set('search', search);
      } else {
        url.searchParams.delete('search');
      }

      link.href = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
    });

    returnTypeInputs.forEach((input) => {
      input.value = requestType;
    });

    returnSearchInputs.forEach((input) => {
      input.value = search;
    });

    if (clearFiltersLink) {
      clearFiltersLink.href = buildQueueUrl(status, 'all', '');
      clearFiltersLink.hidden = requestType === 'all' && search === '';
    }
  }

  function updateResultsCount(visibleCount) {
    if (!resultsCount) {
      return;
    }

    resultsCount.textContent = `${visibleCount} ${visibleCount === 1 ? 'request' : 'requests'} shown`;
  }

  function updateEmptyState(visibleCount) {
    if (!emptyState) {
      return;
    }

    emptyState.hidden = visibleCount !== 0;

    if (!emptyMessage || visibleCount !== 0) {
      return;
    }

    const search = currentSearchValue().trim();
    const requestType = currentRequestType();

    if (search) {
      emptyMessage.textContent = `No Unit Requests match “${search}”.`;
      return;
    }

    if (requestType !== 'all') {
      emptyMessage.textContent = 'No Unit Requests match the selected Request Type.';
      return;
    }

    emptyMessage.textContent = `No ${currentStatus() === 'all' ? '' : `${currentStatus()} `}Unit Requests are available.`;
  }

  function filterRequestRows() {
    const searchTerms = getSearchTerms(currentSearchValue());
    const requestType = currentRequestType();
    let visibleCount = 0;

    requestRows.forEach((row) => {
      const matchesRequestType = requestType === 'all' || row.dataset.unitRequestType === requestType;
      const searchIndex = row.dataset.unitRequestSearchIndex || '';
      const matchesSearch = searchTerms.every((term) => searchIndex.includes(term));
      const isVisible = matchesRequestType && matchesSearch;

      row.hidden = !isVisible;

      if (isVisible) {
        visibleCount += 1;
      }
    });

    updateResultsCount(visibleCount);
    updateEmptyState(visibleCount);
    syncQueueContext();
  }

  function focusSearchInput() {
    if (!searchInput || searchInput.disabled) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!searchInput.isConnected || searchInput.disabled) {
        return;
      }

      searchInput.focus({ preventScroll: true });
      const caretPosition = searchInput.value.length;
      searchInput.setSelectionRange(caretPosition, caretPosition);
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    filterRequestRows();
  });

  if (searchInput) {
    searchInput.addEventListener('input', filterRequestRows);
  }

  if (requestTypeFilter) {
    requestTypeFilter.addEventListener('change', filterRequestRows);
  }

  if (clearFiltersLink) {
    clearFiltersLink.addEventListener('click', (event) => {
      event.preventDefault();

      if (searchInput) {
        searchInput.value = '';
      }

      if (requestTypeFilter) {
        requestTypeFilter.value = 'all';
      }

      filterRequestRows();
      focusSearchInput();
    });
  }

  // The selected status tab and role scope are still loaded by the server.
  // Search and Request Type only narrow that already-authorized data in place,
  // matching the responsive catalog filtering used by Create Unit.
  filterRequestRows();
  focusSearchInput();
  window.addEventListener('pageshow', () => {
    filterRequestRows();
    focusSearchInput();
  });
}());
