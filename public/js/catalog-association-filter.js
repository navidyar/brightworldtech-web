(() => {
  'use strict';

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function initFilterPanel(panel) {
    if (!panel || panel.dataset.associationFilterReady === '1') return;
    panel.dataset.associationFilterReady = '1';
    const modal = panel.closest('.processor-association-modal') || document;
    const rows = Array.from(modal.querySelectorAll('[data-association-row]'));
    const empty = modal.querySelector('[data-association-empty]');
    const controls = Array.from(panel.querySelectorAll('[data-association-filter]'));

    const refresh = () => {
      const values = Object.fromEntries(controls.map((control) => [control.dataset.associationFilter, normalize(control.value)]));
      let visibleCount = 0;
      rows.forEach((row) => {
        const matchesManufacturer = !values.manufacturer || String(row.dataset.manufacturerId || '') === values.manufacturer;
        const matchesCategory = !values.category || String(row.dataset.categoryId || '') === values.category;
        const matchesBrand = !values.brand || String(row.dataset.brandId || '') === values.brand;
        const matchesSearch = !values.search || normalize(row.dataset.searchText).includes(values.search);
        const visible = matchesManufacturer && matchesCategory && matchesBrand && matchesSearch;
        row.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      if (empty) empty.hidden = visibleCount > 0;
    };

    controls.forEach((control) => {
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', refresh);
    });
    refresh();
  }

  function init(root = document) {
    root.querySelectorAll('[data-catalog-association-filters]').forEach(initFilterPanel);
  }

  document.addEventListener('DOMContentLoaded', () => init(document));
  document.addEventListener('htmx:afterSwap', (event) => init(event.target));
  document.addEventListener('processor-catalog:modal-loaded', (event) => init(event.detail?.root || document));
})();
