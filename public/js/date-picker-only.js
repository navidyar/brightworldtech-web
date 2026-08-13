(function () {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const SHORT_MONTH_NAMES = MONTH_NAMES.map((month) => month.slice(0, 3));
  const DAY_MS = 24 * 60 * 60 * 1000;
  const PICKER_TYPES = new Set(['date', 'week', 'month']);

  function getPickerType(input) {
    const type = String(input?.getAttribute?.('type') || '').toLowerCase();
    return PICKER_TYPES.has(type) ? type : null;
  }

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

  function parseMonth(value) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (month < 0 || month > 11) return null;
    return { year, month };
  }

  function isoWeekStart(year, week) {
    if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return null;
    const januaryFourth = new Date(Date.UTC(year, 0, 4));
    const januaryFourthDay = januaryFourth.getUTCDay() || 7;
    const monday = new Date(januaryFourth);
    monday.setUTCDate(januaryFourth.getUTCDate() - (januaryFourthDay - 1) + ((week - 1) * 7));
    const info = getIsoWeekInfo(monday);
    return info.year === year && info.week === week ? monday : null;
  }

  function getIsoWeekInfo(date) {
    const working = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = working.getUTCDay() || 7;
    working.setUTCDate(working.getUTCDate() + 4 - weekday);
    const year = working.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((working - yearStart) / DAY_MS) + 1) / 7);
    return { year, week };
  }

  function parseWeek(value) {
    const match = /^(\d{4})-W(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const start = isoWeekStart(year, week);
    return start ? { year, week, start } : null;
  }

  function toIso(year, monthIndex, day) {
    return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function toMonthValue(year, monthIndex) {
    return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`;
  }

  function toWeekValue(date) {
    const info = getIsoWeekInfo(date);
    return `${String(info.year).padStart(4, '0')}-W${String(info.week).padStart(2, '0')}`;
  }

  function formatUtcDate(date, options) {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(date);
  }

  function formatDate(value) {
    const parsed = parseDate(value);
    if (!parsed) return 'Select date';
    return formatUtcDate(new Date(Date.UTC(parsed.year, parsed.month, parsed.day)), {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  function formatMonth(value) {
    const parsed = parseMonth(value);
    if (!parsed) return 'Select month';
    return `${MONTH_NAMES[parsed.month]} ${parsed.year}`;
  }

  function formatWeekRange(start) {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

    if (sameMonth) {
      return `${SHORT_MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCDate()}–${end.getUTCDate()}, ${start.getUTCFullYear()}`;
    }
    if (sameYear) {
      return `${SHORT_MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCDate()} – ${SHORT_MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCDate()}, ${start.getUTCFullYear()}`;
    }
    return `${SHORT_MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCDate()}, ${start.getUTCFullYear()} – ${SHORT_MONTH_NAMES[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }

  function formatWeek(value) {
    const parsed = parseWeek(value);
    return parsed ? formatWeekRange(parsed.start) : 'Select week';
  }

  function formatValue(input, value) {
    const type = getPickerType(input);
    if (type === 'week') return formatWeek(value);
    if (type === 'month') return formatMonth(value);
    return formatDate(value);
  }

  function referenceDateForValue(input, value) {
    const type = getPickerType(input);
    if (type === 'week') return parseWeek(value)?.start || null;
    if (type === 'month') {
      const parsed = parseMonth(value);
      return parsed ? new Date(Date.UTC(parsed.year, parsed.month, 1)) : null;
    }
    const parsed = parseDate(value);
    return parsed ? new Date(Date.UTC(parsed.year, parsed.month, parsed.day)) : null;
  }

  function currentValueForType(type) {
    const today = parseDate(getChicagoDateOnly());
    const date = new Date(Date.UTC(today.year, today.month, today.day));
    if (type === 'week') return toWeekValue(date);
    if (type === 'month') return toMonthValue(today.year, today.month);
    return getChicagoDateOnly();
  }

  function isValueAllowed(input, value) {
    const type = getPickerType(input);
    const parsers = { date: parseDate, week: parseWeek, month: parseMonth };
    if (!type || !parsers[type](value)) return false;

    const min = String(input.getAttribute('min') || '');
    const max = String(input.getAttribute('max') || '');
    if (parsers[type](min) && value < min) return false;
    if (parsers[type](max) && value > max) return false;
    return true;
  }

  function getYearBounds(input, referenceYear) {
    const type = getPickerType(input);
    const parseBound = type === 'week' ? parseWeek : type === 'month' ? parseMonth : parseDate;
    const min = parseBound(String(input.getAttribute('min') || ''));
    const max = parseBound(String(input.getAttribute('max') || ''));
    return {
      min,
      max,
      startYear: min ? min.year : referenceYear - 25,
      endYear: max ? max.year : referenceYear + 25
    };
  }

  function monthKey(year, month) {
    return (year * 12) + month;
  }

  function dispatchValueChange(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function calendarShell(input) {
    const type = getPickerType(input);
    const picker = document.createElement('div');
    picker.className = 'site-date-picker';
    picker.dataset.siteDatePicker = 'true';
    picker.dataset.siteDatePickerMode = type;

    const popoverId = input.id ? `${input.id}-site-date-picker` : `site-date-picker-${Math.random().toString(36).slice(2)}`;
    const ariaLabel = type === 'week' ? 'Choose week' : type === 'month' ? 'Choose month' : 'Choose date';
    const body = type === 'week'
      ? '<div class="site-date-picker-week-list" data-site-date-picker-grid role="grid" aria-label="Calendar weeks"></div>'
      : type === 'month'
        ? '<div class="site-date-picker-month-grid" data-site-date-picker-grid role="grid" aria-label="Calendar months"></div>'
        : '<div class="site-date-picker-calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="site-date-picker-calendar-days" data-site-date-picker-grid role="grid" aria-label="Calendar days"></div>';
    const period = type === 'month'
      ? '<div class="date-picker-calendar-period date-picker-calendar-period--year"><select data-site-date-picker-year aria-label="Year"></select></div>'
      : '<div class="date-picker-calendar-period" aria-label="Calendar month and year"><select data-site-date-picker-month aria-label="Month"></select><select data-site-date-picker-year aria-label="Year"></select></div>';
    const previousLabel = type === 'month' ? 'Previous year' : 'Previous month';
    const nextLabel = type === 'month' ? 'Next year' : 'Next month';
    const currentLabel = type === 'week' ? 'This week' : type === 'month' ? 'This month' : 'Today';

    picker.innerHTML = `
      <button class="site-date-picker-trigger" type="button" data-site-date-picker-trigger aria-haspopup="dialog" aria-expanded="false" aria-controls="${popoverId}">
        <span data-site-date-picker-label>${formatValue(input, input.value)}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.25 8 10l4-3.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>
      </button>
      <div id="${popoverId}" class="site-date-picker-calendar site-date-picker-calendar--${type}" data-site-date-picker-popover role="dialog" aria-label="${ariaLabel}" hidden>
        <div class="site-date-picker-calendar-heading">
          <button type="button" class="site-date-picker-calendar-nav" data-site-date-picker-previous aria-label="${previousLabel}">‹</button>
          ${period}
          <button type="button" class="site-date-picker-calendar-nav" data-site-date-picker-next aria-label="${nextLabel}">›</button>
        </div>
        ${body}
        <div class="site-date-picker-calendar-footer"><button type="button" class="button-link" data-site-date-picker-current>${currentLabel}</button><button type="button" class="button-link" data-site-date-picker-clear>Clear</button></div>
      </div>
    `;

    return picker;
  }

  function initializeSiteDatePickers() {
    const inputs = [...document.querySelectorAll(
      'input[type="date"]:not([data-site-date-picker-bound]):not([data-site-date-picker-skip]),' +
      'input[type="week"]:not([data-site-date-picker-bound]):not([data-site-date-picker-skip]),' +
      'input[type="month"]:not([data-site-date-picker-bound]):not([data-site-date-picker-skip])'
    )];

    inputs.forEach((input) => {
      if (!input.parentNode) return;
      const type = getPickerType(input);
      if (!type) return;

      input.dataset.siteDatePickerBound = 'true';
      input.classList.add('site-date-picker-native');
      input.setAttribute('inputmode', 'none');
      input.setAttribute('autocomplete', input.getAttribute('autocomplete') || 'off');

      const picker = calendarShell(input);
      input.insertAdjacentElement('afterend', picker);

      const trigger = picker.querySelector('[data-site-date-picker-trigger]');
      const label = picker.querySelector('[data-site-date-picker-label]');
      const popover = picker.querySelector('[data-site-date-picker-popover]');
      const grid = picker.querySelector('[data-site-date-picker-grid]');
      const monthSelect = picker.querySelector('[data-site-date-picker-month]');
      const yearSelect = picker.querySelector('[data-site-date-picker-year]');
      const previous = picker.querySelector('[data-site-date-picker-previous]');
      const next = picker.querySelector('[data-site-date-picker-next]');
      const currentButton = picker.querySelector('[data-site-date-picker-current]');
      const clearButton = picker.querySelector('[data-site-date-picker-clear]');
      const initialDate = referenceDateForValue(input, input.value) || referenceDateForValue(input, currentValueForType(type));
      const bounds = getYearBounds(input, initialDate.getUTCFullYear());
      let displayedYear = initialDate.getUTCFullYear();
      let displayedMonth = initialDate.getUTCMonth();

      if (monthSelect) {
        MONTH_NAMES.forEach((monthName, monthIndex) => {
          const option = document.createElement('option');
          option.value = String(monthIndex);
          option.textContent = monthName;
          monthSelect.append(option);
        });
      }

      for (let year = bounds.startYear; year <= bounds.endYear; year += 1) {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.append(option);
      }

      const syncDisabled = () => {
        trigger.disabled = input.disabled || input.readOnly;
      };
      syncDisabled();
      new MutationObserver(syncDisabled).observe(input, { attributes: true, attributeFilter: ['disabled', 'readonly'] });

      const closePicker = (returnFocus = false) => {
        popover.hidden = true;
        picker.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus();
      };

      const closeOtherPickers = () => {
        document.querySelectorAll('[data-site-date-picker].is-open').forEach((openPicker) => {
          if (openPicker === picker) return;
          openPicker.querySelector('[data-site-date-picker-popover]')?.setAttribute('hidden', '');
          openPicker.querySelector('[data-site-date-picker-trigger]')?.setAttribute('aria-expanded', 'false');
          openPicker.classList.remove('is-open');
        });
      };

      const setInputValue = (value) => {
        input.value = value;
        label.textContent = formatValue(input, value);
        dispatchValueChange(input);
      };

      function getMonthLimits() {
        const minDate = type === 'date'
          ? (bounds.min ? new Date(Date.UTC(bounds.min.year, bounds.min.month, bounds.min.day)) : null)
          : type === 'week'
            ? bounds.min?.start || null
            : null;
        const maxDate = type === 'date'
          ? (bounds.max ? new Date(Date.UTC(bounds.max.year, bounds.max.month, bounds.max.day)) : null)
          : type === 'week'
            ? bounds.max?.start || null
            : null;
        return {
          minimumMonth: minDate ? monthKey(minDate.getUTCFullYear(), minDate.getUTCMonth()) : monthKey(bounds.startYear, 0),
          maximumMonth: maxDate ? monthKey(maxDate.getUTCFullYear(), maxDate.getUTCMonth()) : monthKey(bounds.endYear, 11)
        };
      }

      const renderDate = () => {
        const selectedDate = parseDate(input.value);
        const today = getChicagoDateOnly();
        const limits = getMonthLimits();
        const firstWeekday = new Date(Date.UTC(displayedYear, displayedMonth, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(displayedYear, displayedMonth + 1, 0)).getUTCDate();

        monthSelect.value = String(displayedMonth);
        yearSelect.value = String(displayedYear);
        [...monthSelect.options].forEach((option) => {
          const key = monthKey(displayedYear, Number(option.value));
          option.disabled = key < limits.minimumMonth || key > limits.maximumMonth;
        });
        const currentKey = monthKey(displayedYear, displayedMonth);
        previous.disabled = currentKey <= limits.minimumMonth;
        next.disabled = currentKey >= limits.maximumMonth;

        grid.innerHTML = '';
        for (let blank = 0; blank < firstWeekday; blank += 1) {
          const spacer = document.createElement('span');
          spacer.className = 'site-date-picker-calendar-spacer';
          spacer.setAttribute('aria-hidden', 'true');
          grid.append(spacer);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const value = toIso(displayedYear, displayedMonth, day);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'site-date-picker-calendar-day';
          button.dataset.siteDatePickerDay = value;
          button.textContent = String(day);
          button.setAttribute('role', 'gridcell');
          button.setAttribute('aria-label', formatUtcDate(new Date(Date.UTC(displayedYear, displayedMonth, day)), {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
          }));
          const isSelected = selectedDate && selectedDate.year === displayedYear && selectedDate.month === displayedMonth && selectedDate.day === day;
          button.classList.toggle('is-selected', Boolean(isSelected));
          button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
          if (value === today) {
            button.classList.add('is-today');
            button.setAttribute('aria-current', 'date');
          }
          button.disabled = !isValueAllowed(input, value);
          button.addEventListener('click', () => {
            if (button.disabled) return;
            setInputValue(value);
            closePicker(true);
          });
          grid.append(button);
        }
      };

      const renderWeek = () => {
        const selectedValue = String(input.value || '');
        const todayValue = currentValueForType('week');
        const limits = getMonthLimits();
        monthSelect.value = String(displayedMonth);
        yearSelect.value = String(displayedYear);
        [...monthSelect.options].forEach((option) => {
          const key = monthKey(displayedYear, Number(option.value));
          option.disabled = key < limits.minimumMonth || key > limits.maximumMonth;
        });
        const currentKey = monthKey(displayedYear, displayedMonth);
        previous.disabled = currentKey <= limits.minimumMonth;
        next.disabled = currentKey >= limits.maximumMonth;

        const first = new Date(Date.UTC(displayedYear, displayedMonth, 1));
        const last = new Date(Date.UTC(displayedYear, displayedMonth + 1, 0));
        const firstWeekday = first.getUTCDay() || 7;
        const monday = new Date(first);
        monday.setUTCDate(first.getUTCDate() - (firstWeekday - 1));

        grid.innerHTML = '';
        for (let cursor = new Date(monday); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
          const start = new Date(cursor);
          const value = toWeekValue(start);
          const info = getIsoWeekInfo(start);
          const end = new Date(start);
          end.setUTCDate(end.getUTCDate() + 6);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'site-date-picker-period-option site-date-picker-week-option';
          button.dataset.siteDatePickerWeek = value;
          button.setAttribute('role', 'gridcell');
          button.setAttribute('aria-label', `Week ${info.week}, ${formatWeekRange(start)}`);
          button.innerHTML = `<span><strong>Week ${info.week}</strong><small>${formatWeekRange(start)}</small></span><span class="site-date-picker-week-days">${Array.from({ length: 7 }, (_, offset) => {
            const day = new Date(start);
            day.setUTCDate(day.getUTCDate() + offset);
            return `<span><b>${['M','T','W','T','F','S','S'][offset]}</b>${day.getUTCDate()}</span>`;
          }).join('')}</span>`;
          const isSelected = value === selectedValue;
          button.classList.toggle('is-selected', isSelected);
          button.classList.toggle('is-current', value === todayValue);
          button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
          button.disabled = !isValueAllowed(input, value);
          button.addEventListener('click', () => {
            if (button.disabled) return;
            setInputValue(value);
            closePicker(true);
          });
          grid.append(button);
        }
      };

      const renderMonth = () => {
        const selectedValue = String(input.value || '');
        const currentValue = currentValueForType('month');
        yearSelect.value = String(displayedYear);
        previous.disabled = displayedYear <= bounds.startYear;
        next.disabled = displayedYear >= bounds.endYear;
        grid.innerHTML = '';

        MONTH_NAMES.forEach((monthName, monthIndex) => {
          const value = toMonthValue(displayedYear, monthIndex);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'site-date-picker-period-option site-date-picker-month-option';
          button.dataset.siteDatePickerMonthOption = value;
          button.textContent = monthName;
          button.setAttribute('role', 'gridcell');
          const isSelected = value === selectedValue;
          button.classList.toggle('is-selected', isSelected);
          button.classList.toggle('is-current', value === currentValue);
          button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
          button.disabled = !isValueAllowed(input, value);
          button.addEventListener('click', () => {
            if (button.disabled) return;
            setInputValue(value);
            closePicker(true);
          });
          grid.append(button);
        });
      };

      const render = type === 'week' ? renderWeek : type === 'month' ? renderMonth : renderDate;

      const clampDisplayedPeriod = () => {
        if (type === 'month') {
          displayedYear = Math.max(bounds.startYear, Math.min(bounds.endYear, displayedYear));
          return;
        }
        const limits = getMonthLimits();
        const currentKey = monthKey(displayedYear, displayedMonth);
        const boundedKey = Math.max(limits.minimumMonth, Math.min(limits.maximumMonth, currentKey));
        displayedYear = Math.floor(boundedKey / 12);
        displayedMonth = boundedKey % 12;
      };

      const movePeriod = (delta) => {
        if (type === 'month') {
          const nextYear = displayedYear + delta;
          if (nextYear < bounds.startYear || nextYear > bounds.endYear) return;
          displayedYear = nextYear;
          render();
          return;
        }
        const limits = getMonthLimits();
        const date = new Date(Date.UTC(displayedYear, displayedMonth + delta, 1));
        const key = monthKey(date.getUTCFullYear(), date.getUTCMonth());
        if (key < limits.minimumMonth || key > limits.maximumMonth) return;
        displayedYear = date.getUTCFullYear();
        displayedMonth = date.getUTCMonth();
        render();
      };

      const openPicker = () => {
        if (trigger.disabled) return;
        closeOtherPickers();
        const selectedDate = referenceDateForValue(input, input.value) || referenceDateForValue(input, currentValueForType(type));
        displayedYear = selectedDate.getUTCFullYear();
        displayedMonth = selectedDate.getUTCMonth();
        clampDisplayedPeriod();
        render();
        popover.hidden = false;
        picker.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => {
          grid.querySelector('[aria-pressed="true"], .is-current, button:not(:disabled)')?.focus();
        });
      };

      trigger.addEventListener('click', () => {
        if (popover.hidden) openPicker();
        else closePicker();
      });
      previous.addEventListener('click', () => movePeriod(-1));
      next.addEventListener('click', () => movePeriod(1));
      monthSelect?.addEventListener('change', () => {
        displayedMonth = Number(monthSelect.value);
        render();
      });
      yearSelect.addEventListener('change', () => {
        displayedYear = Number(yearSelect.value);
        clampDisplayedPeriod();
        render();
      });
      currentButton.addEventListener('click', () => {
        const value = currentValueForType(type);
        if (isValueAllowed(input, value)) setInputValue(value);
        closePicker(true);
      });
      clearButton.addEventListener('click', () => {
        setInputValue('');
        closePicker(true);
      });
      input.addEventListener('change', () => {
        label.textContent = formatValue(input, input.value);
      });
      popover.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePicker(true);
        }
      });
      document.addEventListener('pointerdown', (event) => {
        if (!picker.contains(event.target)) closePicker();
      });

      render();
    });
  }

  function isDateLikeInput(target) {
    return Boolean(target?.matches?.('input[type="date"], input[type="week"], input[type="month"]'));
  }

  document.addEventListener('keydown', (event) => {
    if (!isDateLikeInput(event.target)) return;
    if (!new Set(['Tab', 'Escape']).has(event.key)) event.preventDefault();
  });

  document.addEventListener('paste', (event) => {
    if (isDateLikeInput(event.target)) event.preventDefault();
  });

  document.addEventListener('drop', (event) => {
    if (isDateLikeInput(event.target)) event.preventDefault();
  });

  document.addEventListener('click', (event) => {
    if (isDateLikeInput(event.target)) event.preventDefault();
  });

  document.addEventListener('DOMContentLoaded', initializeSiteDatePickers);
  document.addEventListener('htmx:afterSwap', initializeSiteDatePickers);
})();
