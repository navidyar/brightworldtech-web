(() => {
  function initialize(root = document) {
    const form = root.querySelector('[data-lot-label-template-form]');
    if (!form || form.dataset.labelPickerReady === '1') return;
    form.dataset.labelPickerReady = '1';

    const search = form.querySelector('[data-lot-label-search]');
    const category = form.querySelector('[data-lot-label-category]');
    const rows = [...form.querySelectorAll('[data-lot-label-template-row]')];
    const count = form.querySelector('[data-lot-label-selected-count]');

    const refresh = () => {
      const term = String(search?.value || '').trim().toLowerCase();
      const categoryCode = String(category?.value || '').trim();
      let selectedCount = 0;

      rows.forEach((row) => {
        const use = row.querySelector('[data-lot-label-template-use]');
        const selected = Boolean(use?.checked);
        if (selected) selectedCount += 1;
        row.classList.toggle('is-selected', selected);

        const matchesTerm = !term || String(row.dataset.searchText || '').includes(term);
        const matchesCategory = !categoryCode || row.dataset.category === categoryCode;
        row.hidden = !(matchesTerm && matchesCategory);
      });

      if (count) count.textContent = new Intl.NumberFormat('en-US').format(selectedCount);
    };

    search?.addEventListener('input', refresh);
    category?.addEventListener('change', refresh);
    form.addEventListener('change', (event) => {
      if (event.target.matches('[data-lot-label-template-use]')) refresh();
    });
    refresh();
  }

  document.addEventListener('DOMContentLoaded', () => initialize(document));
  document.body.addEventListener('htmx:afterSwap', (event) => initialize(event.target));
})();
