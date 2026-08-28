(() => {
  const SEARCH_INPUT_SELECTOR = [
    'input[type="search"]:not([data-search-clear-exempt])',
    'input[role="combobox"][aria-autocomplete="list"]:not([data-search-clear-exempt])'
  ].join(', ');

  const RESERVED_ICON_SELECTOR = [
    '.tech-pallet-filter-input',
    '.lot-requirement-value-search'
  ].join(', ');

  function getClearLabel(input) {
    const fieldName = String(
      input.getAttribute('aria-label')
      || input.getAttribute('placeholder')
      || input.getAttribute('name')
      || ''
    ).trim();

    return fieldName ? `Clear ${fieldName}` : 'Clear search or selection';
  }

  function syncClearControl(input) {
    const shell = input.closest('[data-search-clear-shell]');
    const button = shell ? shell.querySelector('[data-search-clear-button]') : null;

    if (!button) return;

    const hasValue = Boolean(String(input.value || '').trim());
    const unavailable = input.disabled || input.readOnly;

    button.hidden = !hasValue || unavailable;
    button.disabled = unavailable;
    button.setAttribute('aria-label', getClearLabel(input));
  }

  function decorateSearchInput(input) {
    if (!input || input.closest('[data-search-clear-shell]')) {
      if (input) syncClearControl(input);
      return;
    }

    const shell = document.createElement('span');
    shell.className = 'site-search-clear-shell';
    shell.setAttribute('data-search-clear-shell', '');

    if (input.matches(RESERVED_ICON_SELECTOR)) {
      shell.classList.add('site-search-clear-shell--reserved-icon');
    }

    input.parentNode.insertBefore(shell, input);
    shell.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'site-search-clear-button';
    button.setAttribute('data-search-clear-button', '');
    button.setAttribute('aria-label', getClearLabel(input));
    button.title = 'Clear';
    button.innerHTML = '<span aria-hidden="true">×</span>';
    shell.appendChild(button);

    syncClearControl(input);
  }

  function initialize(root = document) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll(SEARCH_INPUT_SELECTOR).forEach(decorateSearchInput);

    if (scope.matches && scope.matches(SEARCH_INPUT_SELECTOR)) {
      decorateSearchInput(scope);
    }
  }

  function syncAll() {
    document.querySelectorAll(SEARCH_INPUT_SELECTOR).forEach(syncClearControl);
  }

  function clearSearchInput(button) {
    const shell = button.closest('[data-search-clear-shell]');
    const input = shell ? shell.querySelector(SEARCH_INPUT_SELECTOR) : null;

    if (!input || input.disabled || input.readOnly) return;

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    if (typeof input.focus === 'function') {
      input.focus({ preventScroll: true });
    }

    syncClearControl(input);
  }

  document.addEventListener('DOMContentLoaded', () => initialize(document));

  document.addEventListener('htmx:afterSwap', (event) => {
    initialize(event.target || document);
  });

  document.addEventListener('input', (event) => {
    if (event.target && event.target.matches && event.target.matches(SEARCH_INPUT_SELECTOR)) {
      syncClearControl(event.target);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target && event.target.matches && event.target.matches(SEARCH_INPUT_SELECTOR)) {
      syncClearControl(event.target);
    }
  });

  document.addEventListener('mousedown', (event) => {
    const button = event.target.closest('[data-search-clear-button]');
    if (!button) return;

    // Keep focus inside custom comboboxes so their blur handlers cannot restore
    // the selected display value before the clear action runs.
    event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-search-clear-button]');
    if (!button) {
      queueMicrotask(syncAll);
      return;
    }

    event.preventDefault();
    clearSearchInput(button);
  });

  document.addEventListener('keydown', () => {
    queueMicrotask(syncAll);
  });
})();
