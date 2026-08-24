(function () {
  const SELECTOR = 'select[data-hierarchical-lot-select]';
  const instances = new Set();
  let nextId = 1;
  let typeahead = '';
  let typeaheadTimer = null;

  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function closeTypeahead() {
    typeahead = '';
    if (typeaheadTimer) window.clearTimeout(typeaheadTimer);
    typeaheadTimer = null;
  }

  function getOptionLabel(option) {
    return String(option.dataset.lotLabel || option.textContent || '').trim();
  }

  function getFieldLabel(select) {
    const field = select.closest('label.form-field, label');
    const label = field ? field.querySelector(':scope > span:first-child') : null;
    return String(label && label.textContent || select.getAttribute('aria-label') || 'Lot').trim();
  }

  function buildOptionButton(option, index, listboxId) {
    const depth = Math.max(Number(option.dataset.lotDepth || 0), 0);
    const lotId = String(option.dataset.lotId || '').trim();
    const button = document.createElement('button');

    button.type = 'button';
    button.tabIndex = -1;
    button.className = 'hierarchical-lot-picker-option';
    button.setAttribute('role', 'option');
    button.setAttribute('data-lot-picker-option-index', String(index));
    button.setAttribute('aria-selected', option.selected ? 'true' : 'false');
    button.id = `${listboxId}-option-${index}`;
    button.style.setProperty('--lot-depth', String(depth));
    button.textContent = getOptionLabel(option);

    if (lotId && depth === 0) button.classList.add('hierarchical-lot-picker-option--root');
    if (lotId && depth > 0) button.classList.add('hierarchical-lot-picker-option--child');
    if (!lotId) button.classList.add('hierarchical-lot-picker-option--placeholder');

    if (option.disabled) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.classList.add('hierarchical-lot-picker-option--disabled');
    }

    return button;
  }

  function enhance(select) {
    if (!select || select.dataset.hierarchicalLotPickerReady === '1') return;

    const wrapper = document.createElement('div');
    const trigger = document.createElement('button');
    const triggerText = document.createElement('span');
    const triggerChevron = document.createElement('span');
    const listbox = document.createElement('div');
    const listboxId = `hierarchical-lot-picker-${nextId++}`;
    const fieldLabel = getFieldLabel(select);
    let activeIndex = -1;
    let isOpen = false;

    wrapper.className = 'hierarchical-lot-picker';
    trigger.type = 'button';
    trigger.className = 'hierarchical-lot-picker-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', listboxId);
    triggerText.className = 'hierarchical-lot-picker-trigger-text';
    triggerChevron.className = 'hierarchical-lot-picker-trigger-chevron';
    triggerChevron.setAttribute('aria-hidden', 'true');
    trigger.append(triggerText, triggerChevron);

    listbox.id = listboxId;
    listbox.className = 'hierarchical-lot-picker-options';
    listbox.setAttribute('role', 'listbox');
    listbox.hidden = true;
    document.body.appendChild(listbox);

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, trigger);
    select.classList.add('hierarchical-lot-picker-native');
    select.dataset.hierarchicalLotPickerReady = '1';
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const containingLabel = wrapper.closest('label');
    if (containingLabel) {
      containingLabel.addEventListener('click', (event) => {
        if (trigger.contains(event.target) || event.target === select) return;
        if (event.target.closest('a, button, input, textarea')) return;
        event.preventDefault();
        trigger.focus();
      });
    }

    function selectableButtons() {
      return Array.from(listbox.querySelectorAll('.hierarchical-lot-picker-option:not(:disabled)'));
    }

    function updateTrigger() {
      const selected = select.options[select.selectedIndex] || select.options[0];
      const text = selected ? getOptionLabel(selected) : 'Select Lot';
      triggerText.textContent = text;
      trigger.disabled = select.disabled;
      trigger.setAttribute('aria-label', `${fieldLabel}: ${text}`);
      wrapper.classList.toggle('is-disabled', select.disabled);
      wrapper.classList.toggle('is-invalid', !select.validity.valid);

      listbox.querySelectorAll('[data-lot-picker-option-index]').forEach((button) => {
        const optionIndex = Number(button.getAttribute('data-lot-picker-option-index'));
        button.setAttribute('aria-selected', optionIndex === select.selectedIndex ? 'true' : 'false');
      });
    }

    function renderOptions() {
      listbox.replaceChildren();
      Array.from(select.options).forEach((option, index) => {
        listbox.appendChild(buildOptionButton(option, index, listboxId));
      });
      updateTrigger();
    }

    function positionListbox() {
      if (!isOpen || !trigger.isConnected) return;
      const rect = trigger.getBoundingClientRect();
      const viewportGap = 10;
      const preferredHeight = 360;
      const below = window.innerHeight - rect.bottom - viewportGap;
      const above = rect.top - viewportGap;
      const openAbove = below < 180 && above > below;
      const available = Math.max(openAbove ? above : below, 120);
      const maxHeight = Math.min(preferredHeight, available);

      listbox.style.left = `${Math.max(viewportGap, Math.min(rect.left, window.innerWidth - rect.width - viewportGap))}px`;
      listbox.style.width = `${rect.width}px`;
      listbox.style.maxHeight = `${maxHeight}px`;
      listbox.style.top = openAbove
        ? `${Math.max(viewportGap, rect.top - Math.min(listbox.scrollHeight || preferredHeight, maxHeight) - 4)}px`
        : `${rect.bottom + 4}px`;
    }

    function setActive(index, scrollIntoView) {
      const target = listbox.querySelector(`[data-lot-picker-option-index="${index}"]`);
      if (!target || target.disabled) return;

      listbox.querySelectorAll('.is-active').forEach((button) => button.classList.remove('is-active'));
      target.classList.add('is-active');
      activeIndex = index;
      trigger.setAttribute('aria-activedescendant', target.id);
      if (scrollIntoView) target.scrollIntoView({ block: 'nearest' });
    }

    function open(options) {
      if (select.disabled || isOpen) return;
      instances.forEach((instance) => {
        if (instance.select !== select) instance.close();
      });
      renderOptions();
      listbox.hidden = false;
      isOpen = true;
      trigger.setAttribute('aria-expanded', 'true');
      wrapper.classList.add('is-open');
      positionListbox();

      const enabled = selectableButtons();
      if (enabled.length === 0) return;
      const selectedPosition = enabled.findIndex((button) => Number(button.dataset.lotPickerOptionIndex) === select.selectedIndex);
      const move = Number(options && options.move || 0);
      const basePosition = selectedPosition >= 0 ? selectedPosition : (move < 0 ? enabled.length : -1);
      const nextPosition = Math.max(0, Math.min(enabled.length - 1, basePosition + move));
      setActive(Number(enabled[nextPosition].dataset.lotPickerOptionIndex), true);
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      listbox.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      wrapper.classList.remove('is-open');
      listbox.querySelectorAll('.is-active').forEach((button) => button.classList.remove('is-active'));
      activeIndex = -1;
      closeTypeahead();
    }

    function moveActive(direction) {
      const enabled = selectableButtons();
      if (enabled.length === 0) return;
      const currentPosition = enabled.findIndex((button) => Number(button.dataset.lotPickerOptionIndex) === activeIndex);
      const fallback = direction > 0 ? -1 : enabled.length;
      const nextPosition = Math.max(0, Math.min(enabled.length - 1, (currentPosition >= 0 ? currentPosition : fallback) + direction));
      setActive(Number(enabled[nextPosition].dataset.lotPickerOptionIndex), true);
    }

    function choose(index) {
      const option = select.options[index];
      if (!option || option.disabled) return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      updateTrigger();
      close();
      trigger.focus();
    }

    function typeaheadSelect(character) {
      typeahead += normalizeSearchText(character);
      if (typeaheadTimer) window.clearTimeout(typeaheadTimer);
      typeaheadTimer = window.setTimeout(closeTypeahead, 800);
      const normalizedNeedle = normalizeSearchText(typeahead);
      if (!normalizedNeedle) return;

      const enabled = selectableButtons();
      const match = enabled.find((button) => {
        const words = normalizeSearchText(button.textContent).split(' ').filter(Boolean);
        return words.some((word) => word.startsWith(normalizedNeedle));
      });
      if (match) setActive(Number(match.dataset.lotPickerOptionIndex), true);
    }

    trigger.addEventListener('click', () => {
      if (isOpen) close();
      else open();
    });

    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        if (!isOpen) open({ move: direction });
        else moveActive(direction);
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!isOpen) open();
        else if (activeIndex >= 0) choose(activeIndex);
        return;
      }

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        if (!isOpen) open();
        const enabled = selectableButtons();
        if (enabled.length > 0) {
          const target = event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1];
          setActive(Number(target.dataset.lotPickerOptionIndex), true);
        }
        return;
      }

      if (event.key.length === 1 && /[\p{L}\p{N}#_-]/u.test(event.key)) {
        if (!isOpen) open();
        typeaheadSelect(event.key);
      }
    });

    listbox.addEventListener('mousedown', (event) => {
      const optionButton = event.target.closest('[data-lot-picker-option-index]');
      if (!optionButton || optionButton.disabled) return;
      event.preventDefault();
    });

    listbox.addEventListener('click', (event) => {
      const optionButton = event.target.closest('[data-lot-picker-option-index]');
      if (!optionButton || optionButton.disabled) return;
      choose(Number(optionButton.dataset.lotPickerOptionIndex));
    });

    listbox.addEventListener('mousemove', (event) => {
      const optionButton = event.target.closest('[data-lot-picker-option-index]');
      if (!optionButton || optionButton.disabled) return;
      setActive(Number(optionButton.dataset.lotPickerOptionIndex), false);
    });

    select.addEventListener('change', updateTrigger);
    select.addEventListener('invalid', (event) => {
      event.preventDefault();
      wrapper.classList.add('is-invalid');
      trigger.focus();
      open();
    });

    const observer = new MutationObserver(() => {
      renderOptions();
      if (select.disabled) close();
    });
    observer.observe(select, { attributes: true, childList: true, subtree: true });

    const form = select.form;
    if (form) {
      form.addEventListener('reset', () => window.setTimeout(updateTrigger, 0));
    }

    const instance = { select, trigger, listbox, close, positionListbox };
    instances.add(instance);
    renderOptions();
  }

  function initialize(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches(SELECTOR)) enhance(scope);
    scope.querySelectorAll(SELECTOR).forEach(enhance);
  }

  function closeAll() {
    instances.forEach((instance) => instance.close());
  }

  document.addEventListener('pointerdown', (event) => {
    instances.forEach((instance) => {
      if (instance.listbox.hidden) return;
      if (instance.trigger.contains(event.target) || instance.listbox.contains(event.target)) return;
      instance.close();
    });
  });

  window.addEventListener('resize', () => {
    instances.forEach((instance) => instance.positionListbox());
  });

  window.addEventListener('scroll', () => {
    instances.forEach((instance) => instance.positionListbox());
  }, true);

  document.addEventListener('DOMContentLoaded', () => initialize(document));
  document.addEventListener('htmx:beforeSwap', closeAll);
  document.addEventListener('htmx:afterSwap', (event) => initialize(event.target || document));
})();
