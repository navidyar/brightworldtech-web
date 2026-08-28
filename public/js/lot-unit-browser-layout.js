(function () {
  function setupLayoutForm(form) {
    if (!form || form.dataset.lotUnitBrowserLayoutReady === '1') {
      return;
    }

    const rowsContainer = form.querySelector('[data-lot-unit-browser-layout-rows]');
    const note = form.querySelector('[data-lot-unit-browser-layout-note]');
    const maxVisible = Math.max(1, Number(form.dataset.lotUnitBrowserMaxVisible) || 4);

    if (!rowsContainer) {
      return;
    }

    function rows() {
      return Array.from(rowsContainer.querySelectorAll('[data-lot-unit-browser-layout-row]'));
    }

    function setNote(message) {
      if (note) note.textContent = message;
    }

    function syncButtons() {
      const currentRows = rows();
      currentRows.forEach((row, index) => {
        const up = row.querySelector('[data-lot-unit-browser-move="up"]');
        const down = row.querySelector('[data-lot-unit-browser-move="down"]');
        if (up) up.disabled = index === 0;
        if (down) down.disabled = index === currentRows.length - 1;
      });
    }

    rowsContainer.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lot-unit-browser-move]');
      if (!button) return;

      const row = button.closest('[data-lot-unit-browser-layout-row]');
      const direction = button.dataset.lotUnitBrowserMove;

      if (direction === 'up' && row.previousElementSibling) {
        rowsContainer.insertBefore(row, row.previousElementSibling);
        setNote('Unsaved order changed. Save to store this Lot’s direct Browser customization.');
      } else if (direction === 'down' && row.nextElementSibling) {
        rowsContainer.insertBefore(row.nextElementSibling, row);
        setNote('Unsaved order changed. Save to store this Lot’s direct Browser customization.');
      }

      syncButtons();
      button.focus();
    });

    rowsContainer.addEventListener('change', (event) => {
      if (!event.target.matches('[data-lot-unit-browser-visible]')) return;

      const visibleControls = rowsContainer.querySelectorAll('[data-lot-unit-browser-visible]:checked');
      if (event.target.checked && visibleControls.length > maxVisible) {
        event.target.checked = false;
        setNote(`Choose no more than ${maxVisible} optional display groups. Hide another group before showing this one.`);
        event.target.focus();
        return;
      }

      setNote(`Unsaved visibility changed. Up to ${maxVisible} optional groups may be shown. Save to store this Lot’s direct Browser customization.`);
    });

    form.dataset.lotUnitBrowserLayoutReady = '1';
    syncButtons();
  }

  function initialize(root) {
    root.querySelectorAll('[data-lot-unit-browser-layout]').forEach(setupLayoutForm);
  }

  document.addEventListener('DOMContentLoaded', () => initialize(document));
  document.addEventListener('htmx:afterSwap', (event) => initialize(event.target || document));
})();
