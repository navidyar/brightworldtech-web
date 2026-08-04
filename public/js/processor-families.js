(function () {
  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function setupTableSearch(root) {
    const input = root.querySelector('[data-processor-family-table-search]');
    const table = root.querySelector('[data-processor-family-table]');
    if (!input || !table || input.dataset.ready === '1') return;

    input.dataset.ready = '1';
    input.addEventListener('input', () => {
      const query = normalize(input.value);
      table.querySelectorAll('[data-processor-family-row]').forEach((row) => {
        row.hidden = Boolean(query) && !normalize(row.dataset.searchText).includes(query);
      });
    });
  }

  function setupMemberSearch(root) {
    root.querySelectorAll('[data-processor-member-list]').forEach((list) => {
      const container = list.closest('#processor-family-member-options') || list.parentElement;
      const search = container?.querySelector('[data-processor-member-search]');
      const selectVisible = container?.querySelector('[data-select-visible-processors]');
      const clearVisible = container?.querySelector('[data-clear-visible-processors]');
      if (!search || search.dataset.ready === '1') return;

      const visibleRows = () => Array.from(list.querySelectorAll('[data-processor-member-row]'))
        .filter((row) => !row.hidden);
      const applyFilter = () => {
        const query = normalize(search.value);
        list.querySelectorAll('[data-processor-member-row]').forEach((row) => {
          row.hidden = Boolean(query) && !normalize(row.dataset.searchText).includes(query);
        });
      };

      search.dataset.ready = '1';
      search.addEventListener('input', applyFilter);
      selectVisible?.addEventListener('click', () => {
        visibleRows().forEach((row) => {
          const checkbox = row.querySelector('input[type="checkbox"]');
          if (checkbox) checkbox.checked = true;
        });
      });
      clearVisible?.addEventListener('click', () => {
        visibleRows().forEach((row) => {
          const checkbox = row.querySelector('input[type="checkbox"]');
          if (checkbox) checkbox.checked = false;
        });
      });
    });
  }

  function initialize(root) {
    setupTableSearch(root);
    setupMemberSearch(root);
  }

  document.addEventListener('DOMContentLoaded', () => initialize(document));
  document.addEventListener('htmx:afterSwap', (event) => initialize(event.target || document));
})();
