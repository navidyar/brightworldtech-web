(function () {
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

  function isNativeDateInput(target) {
    return target && target.matches && target.matches('input[type="date"]:not([data-site-date-picker-skip])');
  }

  function isDateLikeInput(target) {
    return target && target.matches && target.matches('input[type="date"], input[type="week"], input[type="month"]');
  }

  function isDateAllowed(input, isoDate) {
    if (!parseDate(isoDate)) return false;

    const min = String(input.getAttribute('min') || '').slice(0, 10);
    const max = String(input.getAttribute('max') || '').slice(0, 10);

    if (parseDate(min) && isoDate < min) return false;
    if (parseDate(max) && isoDate > max) return false;

    return true;
  }

  function dispatchValueChange(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function buildPicker(input) {
    const picker = document.createElement('div');
    picker.className = 'site-date-picker';
    picker.dataset.siteDatePicker = 'true';

    const popoverId = input.id ? `${input.id}-site-date-picker` : `site-date-picker-${Math.random().toString(36).slice(2)}`;
    const labelId = input.id ? `${input.id}-site-date-picker-label` : `${popoverId}-label`;

    picker.innerHTML = `
      <button class="site-date-picker-trigger" type="button" data-site-date-picker-trigger aria-haspopup="dialog" aria-expanded="false" aria-controls="${popoverId}">
        <span data-site-date-picker-label>${formatDate(input.value)}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6.25 8 10l4-3.75" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>
      </button>
      <div id="${popoverId}" class="site-date-picker-calendar" data-site-date-picker-popover role="dialog" aria-labelledby="${labelId}" hidden>
        <div class="site-date-picker-calendar-heading">
          <button type="button" class="site-date-picker-calendar-nav" data-site-date-picker-previous aria-label="Previous month">‹</button>
          <strong id="${labelId}" data-site-date-picker-month-label></strong>
          <button type="button" class="site-date-picker-calendar-nav" data-site-date-picker-next aria-label="Next month">›</button>
        </div>
        <div class="site-date-picker-calendar-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
        <div class="site-date-picker-calendar-days" data-site-date-picker-grid role="grid" aria-label="Calendar days"></div>
        <div class="site-date-picker-calendar-footer"><button type="button" class="button-link" data-site-date-picker-today>Today</button><button type="button" class="button-link" data-site-date-picker-clear>Clear</button></div>
      </div>
    `;

    return picker;
  }

  function initializeSiteDatePickers() {
    const inputs = [...document.querySelectorAll('input[type="date"]:not([data-site-date-picker-bound]):not([data-site-date-picker-skip])')];

    inputs.forEach((input) => {
      if (!input.parentNode) return;

      input.dataset.siteDatePickerBound = 'true';
      input.classList.add('site-date-picker-native');
      input.setAttribute('inputmode', 'none');
      input.setAttribute('autocomplete', input.getAttribute('autocomplete') || 'off');

      const picker = buildPicker(input);
      input.insertAdjacentElement('afterend', picker);

      const trigger = picker.querySelector('[data-site-date-picker-trigger]');
      const label = picker.querySelector('[data-site-date-picker-label]');
      const popover = picker.querySelector('[data-site-date-picker-popover]');
      const grid = picker.querySelector('[data-site-date-picker-grid]');
      const monthLabel = picker.querySelector('[data-site-date-picker-month-label]');
      const previous = picker.querySelector('[data-site-date-picker-previous]');
      const next = picker.querySelector('[data-site-date-picker-next]');
      const todayButton = picker.querySelector('[data-site-date-picker-today]');
      const clearButton = picker.querySelector('[data-site-date-picker-clear]');
      const selected = parseDate(input.value);
      const initial = selected || parseDate(getChicagoDateOnly());
      let displayedYear = initial.year;
      let displayedMonth = initial.month;

      if (input.disabled || input.readOnly) {
        trigger.disabled = true;
      }

      const closePicker = (returnFocus = false) => {
        popover.hidden = true;
        picker.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus();
      };

      const closeOtherPickers = () => {
        document.querySelectorAll('[data-site-date-picker].is-open').forEach((openPicker) => {
          if (openPicker === picker) return;
          const openPopover = openPicker.querySelector('[data-site-date-picker-popover]');
          const openTrigger = openPicker.querySelector('[data-site-date-picker-trigger]');
          if (openPopover) openPopover.hidden = true;
          if (openTrigger) openTrigger.setAttribute('aria-expanded', 'false');
          openPicker.classList.remove('is-open');
        });
      };

      const setInputValue = (value) => {
        input.value = value;
        label.textContent = formatDate(value);
        dispatchValueChange(input);
      };

      const render = () => {
        const selectedDate = parseDate(input.value);
        const today = getChicagoDateOnly();
        const firstWeekday = new Date(Date.UTC(displayedYear, displayedMonth, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(displayedYear, displayedMonth + 1, 0)).getUTCDate();

        monthLabel.textContent = new Intl.DateTimeFormat('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(new Date(Date.UTC(displayedYear, displayedMonth, 1)));

        grid.innerHTML = '';

        for (let blank = 0; blank < firstWeekday; blank += 1) {
          const spacer = document.createElement('span');
          spacer.className = 'site-date-picker-calendar-spacer';
          spacer.setAttribute('aria-hidden', 'true');
          grid.append(spacer);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
          const iso = toIso(displayedYear, displayedMonth, day);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'site-date-picker-calendar-day';
          button.dataset.siteDatePickerDay = iso;
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

          if (!isDateAllowed(input, iso)) {
            button.disabled = true;
          }

          button.addEventListener('click', () => {
            if (button.disabled) return;
            setInputValue(iso);
            closePicker(true);
          });

          grid.append(button);
        }
      };

      const moveMonth = (delta) => {
        const date = new Date(Date.UTC(displayedYear, displayedMonth + delta, 1));
        displayedYear = date.getUTCFullYear();
        displayedMonth = date.getUTCMonth();
        render();
      };

      const openPicker = () => {
        if (trigger.disabled) return;

        closeOtherPickers();
        const selectedDate = parseDate(input.value) || parseDate(getChicagoDateOnly());
        displayedYear = selectedDate.year;
        displayedMonth = selectedDate.month;
        render();
        popover.hidden = false;
        picker.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        window.requestAnimationFrame(() => {
          grid.querySelector('[aria-pressed="true"], [aria-current="date"], button:not(:disabled)')?.focus();
        });
      };

      trigger.addEventListener('click', () => {
        if (popover.hidden) openPicker();
        else closePicker();
      });
      previous.addEventListener('click', () => moveMonth(-1));
      next.addEventListener('click', () => moveMonth(1));
      todayButton.addEventListener('click', () => {
        const today = getChicagoDateOnly();
        if (isDateAllowed(input, today)) {
          setInputValue(today);
        }
        closePicker(true);
      });
      clearButton.addEventListener('click', () => {
        setInputValue('');
        closePicker(true);
      });
      input.addEventListener('change', () => {
        label.textContent = formatDate(input.value);
      });
      popover.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePicker(true);
          return;
        }

        const target = event.target.closest('[data-site-date-picker-day]');
        if (!target) return;

        const current = parseDate(target.dataset.siteDatePickerDay);
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (!(event.key in offsets) || !current) return;

        event.preventDefault();
        const nextDate = new Date(Date.UTC(current.year, current.month, current.day + offsets[event.key]));
        displayedYear = nextDate.getUTCFullYear();
        displayedMonth = nextDate.getUTCMonth();
        render();

        const nextIso = toIso(displayedYear, displayedMonth, nextDate.getUTCDate());
        window.requestAnimationFrame(() => {
          grid.querySelector(`[data-site-date-picker-day="${nextIso}"]:not(:disabled)`)?.focus();
        });
      });

      document.addEventListener('pointerdown', (event) => {
        if (!picker.contains(event.target)) closePicker();
      });

      render();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (!isDateLikeInput(event.target)) {
      return;
    }

    const allowedKeys = new Set(['Tab', 'Escape']);

    if (!allowedKeys.has(event.key)) {
      event.preventDefault();
    }
  });

  document.addEventListener('paste', (event) => {
    if (isDateLikeInput(event.target)) {
      event.preventDefault();
    }
  });

  document.addEventListener('drop', (event) => {
    if (isDateLikeInput(event.target)) {
      event.preventDefault();
    }
  });

  document.addEventListener('click', (event) => {
    if (isNativeDateInput(event.target)) {
      event.preventDefault();
    }
  });

  document.addEventListener('DOMContentLoaded', initializeSiteDatePickers);
  document.addEventListener('htmx:afterSwap', initializeSiteDatePickers);
})();
