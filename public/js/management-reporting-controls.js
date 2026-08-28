(function () {
  const guidanceByPeriod = {
    all_time: 'All recorded completion cycles are included. No date picker is needed.',
    day: 'Choose one specific day. Only the Day field is used.',
    work_week: 'Choose a week. The dashboard reports Monday through Sunday for that week.',
    month: 'Choose a full month. Only the Month field is used.',
    month_to_date: 'Month-to-Date uses the current month through today. No date picker is needed.',
    custom_range: 'Choose a Start and End date. Only those two fields are used.'
  };

  function fieldMatchesPeriod(field, period) {
    const periods = String(field.dataset.periodField || '').split(/\s+/).filter(Boolean);
    return periods.includes(period);
  }

  function setDisabled(field, disabled) {
    field.querySelectorAll('input, select, textarea').forEach((input) => {
      if (!input.matches('[data-reporting-period-select]')) {
        input.disabled = disabled;
      }
    });
  }

  function updateForm(form) {
    const select = form.querySelector('[data-reporting-period-select]');
    if (!select) return;

    const period = select.value || 'day';
    form.classList.toggle('has-active-date-field', period !== 'all_time');
    form.classList.toggle('is-custom-range', period === 'custom_range');

    const guidance = form.querySelector('[data-period-guidance]');
    if (guidance) {
      guidance.textContent = guidanceByPeriod[period] || 'Choose a reporting period first. Only visible fields are used.';
    }

    form.querySelectorAll('[data-period-field]').forEach((field) => {
      const isVisible = fieldMatchesPeriod(field, period);
      field.hidden = !isVisible;
      field.classList.toggle('is-active', isVisible);
      setDisabled(field, !isVisible);
    });
  }


  function parseSortableCell(cell, type) {
    const raw = cell ? String(cell.dataset.sortValue ?? '').trim() : '';
    if (!raw) return { missing: true, value: null };

    if (type === 'number' || type === 'date') {
      const numeric = Number(raw);
      return Number.isFinite(numeric)
        ? { missing: false, value: numeric }
        : { missing: true, value: null };
    }

    return { missing: false, value: raw };
  }

  function compareSortableValues(left, right, type) {
    if (type === 'number' || type === 'date') {
      return left.value - right.value;
    }

    return String(left.value).localeCompare(String(right.value), 'en-US', {
      sensitivity: 'base',
      numeric: true
    });
  }

  function sortReportingTable(link) {
    const header = link.closest('th');
    const table = link.closest('table');
    const body = table && table.tBodies ? table.tBodies[0] : null;
    if (!header || !table || !body) return;

    const rows = Array.from(body.querySelectorAll('tr[data-qc-report-sort-row]'));
    if (rows.length < 2) return;

    const columnIndex = header.cellIndex;
    const type = link.dataset.sortType || 'text';
    const currentDirection = link.dataset.sortDirection || '';
    const direction = currentDirection
      ? (currentDirection === 'asc' ? 'desc' : 'asc')
      : (link.dataset.sortInitial || 'asc');
    const directionFactor = direction === 'desc' ? -1 : 1;

    rows.forEach((row, originalIndex) => {
      if (!row.dataset.qcReportSortIndex) {
        row.dataset.qcReportSortIndex = String(originalIndex + 1);
      }
    });

    rows.sort((leftRow, rightRow) => {
      const left = parseSortableCell(leftRow.cells[columnIndex], type);
      const right = parseSortableCell(rightRow.cells[columnIndex], type);
      if (left.missing && right.missing) return Number(leftRow.dataset.qcReportSortIndex) - Number(rightRow.dataset.qcReportSortIndex);
      if (left.missing) return 1;
      if (right.missing) return -1;

      const comparison = compareSortableValues(left, right, type);
      if (comparison !== 0) return comparison * directionFactor;
      return Number(leftRow.dataset.qcReportSortIndex) - Number(rightRow.dataset.qcReportSortIndex);
    });

    rows.forEach((row) => body.appendChild(row));

    table.querySelectorAll('[data-qc-report-sort]').forEach((sortLink) => {
      const sortHeader = sortLink.closest('th');
      const indicator = sortLink.querySelector('.qc-reporting-sort-indicator');
      const isActive = sortLink === link;

      sortLink.classList.toggle('is-active', isActive);
      if (isActive) {
        sortLink.dataset.sortDirection = direction;
        if (sortHeader) sortHeader.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        if (indicator) indicator.textContent = direction === 'asc' ? '↑' : '↓';
      } else {
        delete sortLink.dataset.sortDirection;
        if (sortHeader) sortHeader.removeAttribute('aria-sort');
        if (indicator) indicator.textContent = '';
      }
    });
  }



  function closeTeamPickersOutside(target) {
    document.querySelectorAll('[data-reporting-team-picker][open]').forEach((picker) => {
      if (!picker.contains(target)) {
        picker.removeAttribute('open');
      }
    });
  }

  function closeTeamPickerOnEscape(event) {
    if (event.key !== 'Escape') return;

    const picker = event.target.closest('[data-reporting-team-picker]');
    if (!picker || !picker.open) return;

    picker.removeAttribute('open');
    const summary = picker.querySelector('summary');
    if (summary) summary.focus();
  }

  function init(root) {
    root.querySelectorAll('[data-reporting-controls]').forEach(updateForm);
  }


  document.addEventListener('click', (event) => {
    const sortLink = event.target.closest('[data-qc-report-sort]');
    if (!sortLink) return;

    event.preventDefault();
    sortReportingTable(sortLink);
  });

  document.addEventListener('pointerdown', (event) => {
    closeTeamPickersOutside(event.target);
  });

  document.addEventListener('keydown', closeTeamPickerOnEscape);

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-reporting-period-select]')) return;
    const form = event.target.closest('[data-reporting-controls]');
    if (form) updateForm(form);
  });

  document.addEventListener('DOMContentLoaded', () => init(document));
  document.addEventListener('htmx:afterSwap', (event) => init(event.target || document));
})();
