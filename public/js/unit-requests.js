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
      emptyMessage.textContent = `No requests match “${search}”.`;
      return;
    }

    if (requestType !== 'all') {
      emptyMessage.textContent = 'No requests match the selected Request Type.';
      return;
    }

    emptyMessage.textContent = `No ${currentStatus() === 'all' ? '' : `${currentStatus()} `}requests are available.`;
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

  const modalRoot = document.getElementById('modal-root');
  let detailRequestSequence = 0;

  function isRequestDetailPath(value) {
    try {
      const url = new URL(value, window.location.href);
      return /^\/unit-requests\/(?:override\/)?\d+$/.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function buildRequestDetailModal(markup, fallbackTitle = 'Request Details') {
    const parsed = new DOMParser().parseFromString(String(markup || ''), 'text/html');
    const content = parsed.querySelector('main.unit-requests-page');
    if (!content || !modalRoot) return false;

    const title = content.querySelector('.dashboard-hero h2, .unit-request-detail-header h2')?.textContent?.trim() || fallbackTitle;
    const panel = document.createElement('div');
    panel.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal-panel site-clean-modal unit-request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="unit-request-detail-modal-title">
          <header class="modal-header">
            <div><h2 id="unit-request-detail-modal-title"></h2></div>
            <button type="button" class="modal-close-button" data-modal-close aria-label="Close request details">×</button>
          </header>
          <div class="modal-body unit-request-modal-content"></div>
        </section>
      </div>`;

    panel.querySelector('#unit-request-detail-modal-title').textContent = title;
    panel.querySelector('.unit-request-modal-content').innerHTML = content.innerHTML;
    modalRoot.replaceChildren(...Array.from(panel.childNodes));
    document.dispatchEvent(new CustomEvent('unit-request:modal-loaded', { detail: { root: modalRoot } }));
    return true;
  }

  function renderRequestLoadingModal(title = 'Request Details') {
    if (!modalRoot) return;
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal-panel site-clean-modal unit-request-detail-modal" role="dialog" aria-modal="true" aria-labelledby="unit-request-loading-title" aria-busy="true">
          <header class="modal-header">
            <div><h2 id="unit-request-loading-title">${title}</h2></div>
            <button type="button" class="modal-close-button" data-modal-close aria-label="Close request details">×</button>
          </header>
          <div class="modal-body unit-request-modal-content">
            <div class="message"><p>Loading request details…</p></div>
          </div>
        </section>
      </div>`;
  }

  function renderRequestLoadError(message) {
    if (!modalRoot) return;
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal-panel site-clean-modal" role="alertdialog" aria-modal="true" aria-labelledby="unit-request-load-error-title">
          <header class="modal-header">
            <div><h2 id="unit-request-load-error-title">Request Could Not Be Loaded</h2></div>
            <button type="button" class="modal-close-button" data-modal-close aria-label="Close">×</button>
          </header>
          <div class="modal-body"><div class="message error"><p>${message}</p></div></div>
        </section>
      </div>`;
  }

  async function openRequestDetail(link) {
    if (!modalRoot || !link?.href || link.dataset.unitRequestLoading === '1') return;
    const sequence = ++detailRequestSequence;
    link.dataset.unitRequestLoading = '1';
    link.setAttribute('aria-busy', 'true');
    renderRequestLoadingModal(link.getAttribute('aria-label') || 'Request Details');

    try {
      const response = await fetch(link.href, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Accept': 'text/html', 'HX-Request': 'true' }
      });
      const markup = await response.text();
      if (sequence !== detailRequestSequence) return;
      if (!response.ok || !buildRequestDetailModal(markup, link.getAttribute('aria-label') || 'Request Details')) {
        if (response.ok) {
          window.location.replace(link.href);
          return;
        }
        renderRequestLoadError('The request details could not be loaded. Refresh the queue and try again.');
      }
    } catch (error) {
      renderRequestLoadError('The request details could not reach the server. Refresh the queue and try again.');
    } finally {
      delete link.dataset.unitRequestLoading;
      link.removeAttribute('aria-busy');
    }
  }

  async function submitRequestModalForm(form, submitter) {
    if (!modalRoot || form.dataset.unitRequestSubmitting === '1') return;
    form.dataset.unitRequestSubmitting = '1';
    form.setAttribute('aria-busy', 'true');
    if (submitter) submitter.disabled = true;

    try {
      const body = new URLSearchParams();
      new FormData(form, submitter || undefined).forEach((value, key) => {
        if (typeof value === 'string') body.append(key, value);
      });
      const response = await fetch(form.action, {
        method: String(form.method || 'POST').toUpperCase(),
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'HX-Request': 'true'
        },
        body: body.toString()
      });
      const markup = await response.text();
      if (isRequestDetailPath(response.url)) {
        if (!buildRequestDetailModal(markup)) window.location.replace(response.url);
        return;
      }
      if (!response.ok) {
        renderRequestLoadError('The server could not complete this request action. No successful change was confirmed.');
        return;
      }
      window.location.replace(response.url || buildQueueUrl());
    } catch (error) {
      renderRequestLoadError('The request action failed before the server confirmed the change.');
    } finally {
      if (form.isConnected) {
        delete form.dataset.unitRequestSubmitting;
        form.removeAttribute('aria-busy');
      }
      if (submitter?.isConnected) submitter.disabled = false;
    }
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-unit-request-detail-link]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openRequestDetail(link);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('#modal-root .unit-request-modal-content form');
    if (!form || event.defaultPrevented) return;
    event.preventDefault();
    submitRequestModalForm(form, event.submitter);
  });
}());
