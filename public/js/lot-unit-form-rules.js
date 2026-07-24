(function () {
  function setupRulesForm(form) {
    if (form.dataset.lotUnitFormRulesReady === '1') {
      return;
    }

    const searchInput = form.querySelector('[data-lot-unit-form-rule-search]');
    const resetButton = form.querySelector('[data-lot-unit-form-rules-reset]');
    const note = form.querySelector('[data-lot-unit-form-rules-note]');
    const emptySearch = form.querySelector('[data-lot-unit-form-rules-empty]');

    function setNote(message) {
      if (note) {
        note.textContent = message;
      }
    }

    function syncCompatibleModes(row, changedControl) {
      const visibilitySelect = row.querySelector('[data-visibility-mode]');
      const requirementSelect = row.querySelector('[data-requirement-mode]');

      if (!visibilitySelect || !requirementSelect) {
        return;
      }

      if (changedControl === requirementSelect && requirementSelect.value === 'required' && visibilitySelect.value === 'hidden') {
        visibilitySelect.value = 'visible';
        setNote('Visibility was changed to Visible because a directly required field cannot be hidden. Save to refresh the effective profile.');
        return;
      }

      if (changedControl === visibilitySelect && visibilitySelect.value === 'hidden' && requirementSelect.value === 'required') {
        requirementSelect.value = 'optional';
        setNote('Requirement was changed to Optional because a directly hidden field cannot be required. Save to refresh the effective profile.');
        return;
      }

      setNote('Unsaved selections are present. Save to refresh effective values, inheritance sources, and dependency results.');
    }

    function applySearch() {
      const query = String(searchInput?.value || '').trim().toLowerCase();
      let visibleRowCount = 0;

      form.querySelectorAll('[data-lot-unit-form-rule-section]').forEach((section) => {
        let visibleSectionRows = 0;
        const sectionSearch = String(section.dataset.sectionSearch || '');

        section.querySelectorAll('[data-lot-unit-form-rule-row]').forEach((row) => {
          const rowSearch = String(row.dataset.fieldSearch || '');
          const matches = !query || rowSearch.includes(query) || sectionSearch.includes(query);
          row.hidden = !matches;

          if (matches) {
            visibleSectionRows += 1;
            visibleRowCount += 1;
          }
        });

        section.hidden = visibleSectionRows === 0;
      });

      if (emptySearch) {
        emptySearch.hidden = visibleRowCount > 0;
      }
    }

    form.addEventListener('change', (event) => {
      const changedControl = event.target.closest('[data-visibility-mode], [data-requirement-mode]');

      if (!changedControl) {
        return;
      }

      const row = changedControl.closest('[data-lot-unit-form-rule-row]');

      if (row) {
        syncCompatibleModes(row, changedControl);
        row.classList.toggle(
          'has-direct-override',
          [...row.querySelectorAll('select')].some((select) => select.value !== 'inherit')
        );
      }
    });

    if (searchInput) {
      searchInput.addEventListener('input', applySearch);
    }

    if (resetButton) {
      resetButton.addEventListener('click', () => {
        form.querySelectorAll('[data-visibility-mode], [data-requirement-mode]').forEach((select) => {
          select.value = 'inherit';
        });
        form.querySelectorAll('[data-lot-unit-form-rule-row]').forEach((row) => {
          row.classList.remove('has-direct-override');
        });
        setNote('All settings for this Lot are set to Inherit. Save to remove its stored overrides.');
      });
    }

    form.dataset.lotUnitFormRulesReady = '1';
    applySearch();
  }

  function initialize(root) {
    root.querySelectorAll('[data-lot-unit-form-rules]').forEach(setupRulesForm);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initialize(document);

    const updatedLotMatch = window.location.pathname.match(/^\/management\/lots\/(\d+)$/);
    const query = new URLSearchParams(window.location.search);

    if (updatedLotMatch && query.get('unitFormRulesUpdated') === '1') {
      try {
        window.localStorage.setItem(
          'bwt-lot-unit-form-profile-updated',
          JSON.stringify({ lotId: updatedLotMatch[1], updatedAt: Date.now() })
        );
      } catch (error) {
        // Storage may be unavailable in restricted browser contexts. The
        // periodic and focus-based refreshes still keep open forms current.
      }
    }
  });

  document.addEventListener('htmx:afterSwap', (event) => {
    initialize(event.target || document);
  });
})();
