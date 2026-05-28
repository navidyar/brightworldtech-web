(function () {
  const storageKey = 'bwtdallas-theme';

  const themes = [
    {
      key: 'hybrid',
      label: 'Hybrid',
      icon: '◒',
      colorScheme: 'light',
      next: 'light'
    },
    {
      key: 'light',
      label: 'Light',
      icon: '☼',
      colorScheme: 'light',
      next: 'hybrid'
    }
  ];

  function getThemeDefinition(themeKey) {
    return themes.find((theme) => theme.key === themeKey) || themes[0];
  }

  function normalizeTheme(themeKey) {
    if (themeKey === 'dark' || themeKey === 'dim') {
      return 'hybrid';
    }

    if (themes.some((theme) => theme.key === themeKey)) {
      return themeKey;
    }

    return 'hybrid';
  }

  function getStoredTheme() {
    return normalizeTheme(localStorage.getItem(storageKey));
  }

  function applyTheme(themeKey) {
    const safeThemeKey = normalizeTheme(themeKey);
    const theme = getThemeDefinition(safeThemeKey);

    document.documentElement.setAttribute('data-theme', theme.key);
    document.documentElement.style.colorScheme = theme.colorScheme;
    localStorage.setItem(storageKey, theme.key);

    updateThemeToggle(theme);
  }

  function updateThemeToggle(theme) {
    const toggle = document.querySelector('[data-theme-toggle]');
    const label = document.querySelector('[data-theme-toggle-label]');
    const icon = document.querySelector('[data-theme-toggle-icon]');
    const hint = document.querySelector('[data-theme-toggle-hint]');

    if (!toggle || !label || !icon) {
      return;
    }

    const nextTheme = getThemeDefinition(theme.next);

    toggle.setAttribute('aria-label', `Current theme: ${theme.label}. Click to switch to ${nextTheme.label}.`);
    toggle.setAttribute('title', `Current theme: ${theme.label}. Next: ${nextTheme.label}.`);

    label.textContent = theme.label;
    icon.textContent = theme.icon;

    if (hint) {
      hint.textContent = `Next: ${nextTheme.label}`;
    }
  }

  function createThemeToggle() {
    const topbarRight = document.querySelector('.topbar-right');

    if (!topbarRight || document.querySelector('[data-theme-toggle]')) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.setAttribute('data-theme-toggle', '');
    button.innerHTML = `
      <span class="theme-toggle-icon" data-theme-toggle-icon aria-hidden="true">◒</span>
      <span data-theme-toggle-label>Hybrid</span>
      <small data-theme-toggle-hint>Next: Light</small>
    `;

    button.addEventListener('click', () => {
      const currentThemeKey = normalizeTheme(document.documentElement.getAttribute('data-theme'));
      const currentTheme = getThemeDefinition(currentThemeKey);

      applyTheme(currentTheme.next);
    });

    topbarRight.prepend(button);
    updateThemeToggle(getThemeDefinition(getStoredTheme()));
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getStoredTheme());
    createThemeToggle();
  });
})();