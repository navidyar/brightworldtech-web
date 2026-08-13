(function () {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function getChicagoDateOnly() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
    );
    return `${values.year}-${values.month}-${values.day}`;
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }

    return { year, month: month - 1, day };
  }

  function formatDate(value) {
    const parsed = parseDate(value);
    if (!parsed) return 'Select date';

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(parsed.year, parsed.month, parsed.day)));
  }

  function toIso(year, monthIndex, day) {
    return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function monthKey(year, month) {
    return (year * 12) + month;
  }

  function initializeTechUnitsDatePickers() {
    const pickers = [...document.querySelectorAll('[data-tech-created-date-picker]')];
    if (!pickers.length) return;

    const closePicker = (picker, returnFocus = false) => {
      const popover = picker.querySelector('[data-tech-created-date-picker-popover]');
      const trigger = picker.querySelector('[data-tech-created-date-picker-trigger]');
      if (!popover || !trigger) return;

      popover.hidden = true;
      picker.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) trigger.focus();
    };

    const closeOtherPickers = (currentPicker) => {
      pickers.forEach((picker) => {
        if (picker !== currentPicker) closePicker(picker);
      });
    };

    pickers.forEach((picker) => {
      if (picker.dataset.techCreatedDatePickerBound === 'true') return;
      picker.dataset.techCreatedDatePickerBound = 'true';

      const input = picker.querySelector('[data-tech-created-date-picker-input]');
      const trigger = picker.querySelector('[data-tech-created-date-picker-trigger]');
      const label = picker.querySelector('[data-tech-created-date-picker-label]');
      const popover = picker.querySelector('[data-tech-created-date-picker-popover]');
      const grid = picker.querySelector('[data-tech-created-date-picker-grid]');
      const monthSelect = picker.querySelector('[data-tech-created-date-picker-month]');
      const yearSelect = picker.querySelector('[data-tech-created-date-picker-year]');
      const previous = picker.querySelector('[data-tech-created-date-picker-previous]');
      const next = picker.querySelector('[data-tech-created-date-picker-next]');
      const todayButton = picker.querySelector('[data-tech-created-date-picker-today]');
      const clearButton = picker.querySelector('[data-tech-created-date-picker-clear]');

      if (!input || !trigger || !label || !popover || !grid || !monthSelect || !yearSelect || !previous || !next || !todayButton || !clearButton) {
        return;
      }

      const selected = parseDate(input.value);
      const initial = selected || parseDate(getChicagoDateOnly());
      const startYear = initial.year - 25;
      const endYear = initial.year + 25;
      const minimumMonth = monthKey(startYear, 0);
      const maximumMonth = monthKey(endYear, 11);
      let displayedYear = initial.year;
      let displayedMonth = initial.month;

      MONTH_NAMES.forEach((monthName, monthIndex) => {
        const option = document.createElement('option');
        option.value = String(monthIndex);
        option.textContent = monthName;
        monthSelect.append(option);
      });

      for (let year = startYear; year <= endYear; year += 1) {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.append(option);
      }

      const render = () => {
        const selectedDate = parseDate(input.value);
        const today = getChicagoDateOnly();
        const firstWeekday = new Date(Date.UTC(displayedYear, displayedMonth, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(displayedYear, displayedMonth + 1, 0)).getUTCDate();

        monthSelect.value = String(displayedMonth);
        yearSelect.value = String(displayedYear);

        const currentMonth = monthKey(displayedYear, displayedMonth);
        previous.disabled = currentMonth <= minimumMonth;
        next.disabled = currentMonth >= maximumMonth;

        grid.innerHTML = '';

        for (let blank = 0; blank < firstWeekday; blank += 1) {
          const spacer = document.createElement('span');
          spacer.className = 'tech-created-date-calendar-spacer';
          spacer.setAttribute('aria-hidden', 'true');
          grid.append(spacer);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const iso = toIso(displayedYear, displayedMonth, day);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'tech-created-date-calendar-day';
          button.dataset.techCreatedDatePickerDay = iso;
          button.textContent = String(day);
          button.setAttribute('role', 'gridcell');
          button.setAttribute('aria-label', new Intl.DateTimeFormat('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
          }).format(new Date(Date.UTC(displayedYear, displayedMonth, day))));

          if (selectedDate && selectedDate.year === displayedYear && selectedDate.month === displayedMonth && selectedDate.day === day) {
            button.classList.add('is-selected');
            button.setAttribute('aria-pressed', 'true');
          } else {
            button.setAttribute('aria-pressed', 'false');
          }

          if (iso === today) {
            button.classList.add('is-today');
            button.setAttribute('aria-current', 'date');
          }

          button.addEventListener('click', () => {
            input.value = iso;
            label.textContent = formatDate(iso);
            input.dispatchEvent(new Event('change', { bubbles: true }));
            closePicker(picker, true);
          });

          grid.append(button);
        }
      };

      const moveMonth = (delta) => {
        const date = new Date(Date.UTC(displayedYear, displayedMonth + delta, 1));
        const targetYear = date.getUTCFullYear();
        const targetMonth = date.getUTCMonth();
        const targetKey = monthKey(targetYear, targetMonth);
        if (targetKey < minimumMonth || targetKey > maximumMonth) return;
        displayedYear = targetYear;
        displayedMonth = targetMonth;
        render();
      };

      const open = () => {
        closeOtherPickers(picker);
        const selectedDate = parseDate(input.value) || parseDate(getChicagoDateOnly());
        displayedYear = selectedDate.year;
        displayedMonth = selectedDate.month;
        render();
        popover.hidden = false;
        picker.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => {
          grid.querySelector('[aria-pressed="true"], [aria-current="date"], button')?.focus();
        });
      };

      trigger.addEventListener('click', () => {
        if (popover.hidden) open();
        else closePicker(picker);
      });
      previous.addEventListener('click', () => moveMonth(-1));
      next.addEventListener('click', () => moveMonth(1));
      monthSelect.addEventListener('change', () => {
        displayedMonth = Number(monthSelect.value);
        render();
      });
      yearSelect.addEventListener('change', () => {
        displayedYear = Number(yearSelect.value);
        render();
      });
      todayButton.addEventListener('click', () => {
        const today = getChicagoDateOnly();
        input.value = today;
        label.textContent = formatDate(today);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        closePicker(picker, true);
      });
      clearButton.addEventListener('click', () => {
        input.value = '';
        label.textContent = 'Select date';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        closePicker(picker, true);
      });
      popover.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePicker(picker, true);
          return;
        }

        const target = event.target.closest('[data-tech-created-date-picker-day]');
        if (!target) return;

        const current = parseDate(target.dataset.techCreatedDatePickerDay);
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!(event.key in offsets) || !current) return;

        event.preventDefault();
        const nextDate = new Date(Date.UTC(current.year, current.month, current.day + offsets[event.key]));
        const nextYear = nextDate.getUTCFullYear();
        const nextMonth = nextDate.getUTCMonth();
        const nextMonthKey = monthKey(nextYear, nextMonth);
        if (nextMonthKey < minimumMonth || nextMonthKey > maximumMonth) return;
        displayedYear = nextYear;
        displayedMonth = nextMonth;
        render();

        const nextIso = toIso(displayedYear, displayedMonth, nextDate.getUTCDate());
        window.requestAnimationFrame(() => {
          grid.querySelector(`[data-tech-created-date-picker-day="${nextIso}"]`)?.focus();
        });
      });
      document.addEventListener('pointerdown', (event) => {
        if (!picker.contains(event.target)) closePicker(picker);
      });

      render();
    });
  }

  document.addEventListener('DOMContentLoaded', initializeTechUnitsDatePickers);
  document.addEventListener('htmx:afterSwap', initializeTechUnitsDatePickers);
})();
