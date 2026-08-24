(function () {
  'use strict';

  const FIELD_SELECTOR = [
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]):not([type="image"])',
    'textarea',
    'select'
  ].join(',');

  function disableAutocomplete(element) {
    if (!element || !element.setAttribute) {
      return;
    }

    if (element.getAttribute('autocomplete') !== 'off') {
      element.setAttribute('autocomplete', 'off');
    }
  }

  function applyPolicy(root) {
    if (!root) {
      return;
    }

    if (root.matches && root.matches('form')) {
      disableAutocomplete(root);
    }

    if (root.matches && root.matches(FIELD_SELECTOR)) {
      disableAutocomplete(root);
    }

    if (!root.querySelectorAll) {
      return;
    }

    root.querySelectorAll('form').forEach(disableAutocomplete);
    root.querySelectorAll(FIELD_SELECTOR).forEach(disableAutocomplete);
  }

  applyPolicy(document.documentElement);

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          applyPolicy(node);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  document.addEventListener('DOMContentLoaded', () => applyPolicy(document));
  document.addEventListener('htmx:afterSwap', (event) => applyPolicy(event.target));
  window.addEventListener('pageshow', () => applyPolicy(document));
})();
