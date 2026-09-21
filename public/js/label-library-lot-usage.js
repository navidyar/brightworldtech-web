(() => {
  function initialize(root = document) {
    const modals = root.matches?.('[data-label-lot-usage-modal]')
      ? [root]
      : [...root.querySelectorAll?.('[data-label-lot-usage-modal]') || []];

    modals.forEach((modal) => {
      if (modal.dataset.lotUsageReady === '1') return;
      modal.dataset.lotUsageReady = '1';

      const search = modal.querySelector('[data-label-lot-usage-search]');
      const rows = [...modal.querySelectorAll('[data-label-lot-usage-row]')];
      const sections = [...modal.querySelectorAll('[data-label-lot-usage-section]')];
      const noMatch = modal.querySelector('[data-label-lot-usage-no-match]');

      const refresh = () => {
        const term = String(search?.value || '').trim().toLowerCase();
        let visibleRows = 0;

        rows.forEach((row) => {
          const matches = !term || String(row.dataset.searchText || '').includes(term);
          row.hidden = !matches;
          if (matches) visibleRows += 1;
        });

        sections.forEach((section) => {
          const sectionRows = [...section.querySelectorAll('[data-label-lot-usage-row]')];
          if (sectionRows.length > 0) {
            section.hidden = Boolean(term) && !sectionRows.some((row) => !row.hidden);
          }
        });

        if (noMatch) noMatch.hidden = !term || visibleRows > 0;
      };

      search?.addEventListener('input', refresh);
      refresh();
    });
  }

  document.addEventListener('DOMContentLoaded', () => initialize(document));
  document.body.addEventListener('htmx:afterSwap', (event) => initialize(event.target));
})();
